import { createClient } from "redis";
import { prisma } from "./db";
import { spawn } from "child_process";
import fs from "fs";

const client = createClient({
    url: process.env.REDIS_URL,
});

async function updateSubmission(
    submissionId: string, 
    status: "Success" | "Failure", 
    output?: string, 
    stdErr?: string 
) {
    await prisma.submissions.update({
        where: {
            id: submissionId
        }, data: {
            status, 
            output, 
            stdErr
        }
    });
}

async function execute(command: string, args: string[]){
    return new Promise<{
        exitCode: number | null; 
        stdout: string; 
        stderr: string; 
    }>((resolve) => {
        // const child = spawn(command, args); 
        const child = spawn(command, args, {
            env: {
                PATH: "/usr/local/bin:/usr/bin:/bin",
                LANG: "C.UTF-8",
            },
        });
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        })

        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        })

        child.on("exit", (exitCode) => {
            resolve({exitCode, stdout, stderr});
        });
    });
}

async function runCpp(filePath: string, submissionId: string){
    const compile = await execute("g++", [filePath, "-o", "./code/out"]);

    if(compile.exitCode !== 0){
        await updateSubmission(submissionId, "Failure", undefined, compile.stderr);
        return; 
    }

    const run = await execute("./code/out", []);

    if(run.exitCode === 0){
        await updateSubmission(submissionId, "Success", run.stdout); 
    } else {
        await updateSubmission(submissionId, "Failure", undefined, run.stderr);
    }
} 

async function runScript(
    command: string, 
    filePath: string, 
    submissionId: string 
) {
    const run = await execute(command, [filePath]);

    if(run.exitCode === 0){
        await updateSubmission(submissionId, "Success", run.stdout);
    } else {
        await updateSubmission(submissionId, "Failure", undefined, run.stderr);
    }
}

client.connect().then(async () => {
    console.log("worker started"); 

    while(1){
        const message = await client.rPop("problems");
        if(!message){
            await new Promise((r) => setTimeout(r, 1000));
            continue;
        }

        try {
            const job = JSON.parse(message);
            const {submissionId, code, language} = job;

            if(!submissionId){
                console.log("missing submission id");
                console.log(job);
                continue; 
            }

            console.log("Processing ", submissionId);

            let extension = "";
            switch (language){
                case "cpp":
                    extension = "cpp"; 
                    break; 
                case "js":
                    extension = "js";
                    break; 
                case "py":
                    extension = "py";
                    break; 
                default: 
                    await updateSubmission(submissionId, "Failure", undefined, "Unsupported language");
                    continue;
            }

            const filePath = `${__dirname}/code/a.${extension}`;
            fs.writeFileSync(filePath, code);

            switch(language){
                case "cpp": 
                    await runCpp(filePath, submissionId);
                    break;
                case "js": 
                    await runScript("node", filePath, submissionId);
                    break;
                case "py":
                    await runScript("python3", filePath, submissionId);
                    break;
            }
        } catch (error){
            console.log(error);
        }
    }

});