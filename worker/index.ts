import { createClient } from "redis";
import { prisma } from "./db";
import { Sandbox } from "e2b";

const REDIS_URL = process.env.REDIS_URL; 
const E2B_API_KEY = process.env.E2B_API_KEY; 
const E2B_TEMPLATE = process.env.E2B_TEMPLATE;

const SANDBOX_TIMEOUT_MS = parsePositiveInteger(process.env.SANDBOX_TIMEOUT_MS, 60_000);

const COMPILE_TIMEOUT_SECONDS = parsePositiveInteger(process.env.COMPILE_TIMEOUT_SECONDS, 5);

const RUN_TIMEOUT_SECONDS = parsePositiveInteger(process.env.RUN_TIMEOUT_SECONDS, 5);


const MAX_OUTPUT_CHARS = parsePositiveInteger(process.env.MAX_OUTPUT_CHARS, 1_000_000);

const redis = createClient({
    url: REDIS_URL,
});

type SupportedLanguage = "cpp" | "js" | "py";

type ExecutionResult = {
    status: "Success" | "Failure"; 
    output: string | null; 
    stdErr: string | null; 
};

type CommandResult = {
    exitCode: number; 
    stdout: string; 
    stderr: string; 
}

function parsePositiveInteger(
    value: string | undefined, 
    fallback: number,
): number {

    if(!value){
        return fallback;
    }
    
    const parsed = Number.parseInt(value, 10);

    if(!Number.isFinite(parsed) || parsed <= 0){
        return fallback;
    }

    return parsed;
}

function errorMessage(error: unknown): string {
    if(error instanceof Error){
        return error.message;
    }
    return String(error);
}

function truncate(value: string): string {
    if(value.length <= MAX_OUTPUT_CHARS){
        return value;
    }
    return `${value.slice(0, MAX_OUTPUT_CHARS)}\n\n[Output truncated]`;
}

function isSupportedLanguage(language: string): language is SupportedLanguage{
    return language === "cpp" || language === "js" || language === "py";
}

function getFilePath(language: SupportedLanguage): string{
    switch(language){
        case "cpp":
            return "/tmp/main.cpp";
        case "js":
            return "/tmp/main.js";
        case "py":
            return "/tmp/main.py";
    }
}

async function updateSubmission(
    submissionId: string, 
    result: ExecutionResult
): Promise<void> {
    await prisma.submissions.update({
        where: {
            id: submissionId
        }, data: {
            status: result.status, 
            output: result.output, 
            stdErr: result.stdErr
        }
    });
}

async function safelyReadFile(
    sandbox: Sandbox, 
    path: string
): Promise<string>{
    try{
        const contents = await sandbox.files.read(path);
        return truncate(String(contents));
    } catch {
        return "";
    }
}

async function runCommand(
    sandbox: Sandbox, 
    command: string, 
    timeoutMs: number
): Promise<CommandResult> {
    const result = await sandbox.commands.run(command, {timeoutMs});

    return {
        exitCode: result.exitCode, 
        stdout: truncate(result.stdout ?? ""), 
        stderr: truncate(result.stdout ?? "")
    };
}

function runtimeCommand(programCommand: string): string {
    return[
        "bash -lc '",
        "ulimit -f 2048; ",
        "ulimit -n 64; ",
        "ulimit -u 128; ",
        `timeout --signal=KILL ${RUN_TIMEOUT_SECONDS}s `,
        programCommand,
        " > /tmp/stdout 2> /tmp/stderr",
        "'",
    ].join("");
}

async function runCpp(
    sandbox: Sandbox, 
    filePath: string,
): Promise<ExecutionResult>{

    const compileCommand = [
        "bash -lc '",
        "ulimit -f 40960; ",
        "ulimit -n 64; ",
        "ulimit -u 128; ",
        `timeout --signal=KILL ${COMPILE_TIMEOUT_SECONDS}s `,
        `g++ -std=c++20 -O2 -pipe ${filePath} -o /tmp/program`,
        " > /tmp/compile-stdout 2> /tmp/compile-stderr",
        "'",
    ].join("");

    const compile = await runCommand(sandbox, compileCommand, (COMPILE_TIMEOUT_SECONDS + 5) * 1000);

    const compileStdout = await safelyReadFile(sandbox, "/tmp/compile-stdout");

    const compileStderr = await safelyReadFile(sandbox, "/tmp/compile-stderr");

    if(compile.exitCode !== 0){
        const timeoutMessage = compile.exitCode === 124 || compile.exitCode === 137 ? "Compilation timed out" : "";

        return {
            status: "Failure", 
            output: compileStdout || null, 
            stdErr: truncate(
                [timeoutMessage, compileStderr || compile.stderr].filter(Boolean).join("\n")
            ) || "Compilation failed"
        };
    }
    return runExecutable(sandbox, "/tmp/program");
}

async function runJavaScript(
    sandbox: Sandbox, 
    filePath: string
): Promise<ExecutionResult>{
    return runExecutable(
        sandbox,
        `env NODE_OPTIONS=--max-old-space-size=256 node ${filePath}`,
    );
}


async function runPython(
    sandbox: Sandbox,
    filePath: string
): Promise<ExecutionResult> {
    return runExecutable(
        sandbox,
        `python3 -I -B ${filePath}`,
    );
}

async function runExecutable(
    sandbox: Sandbox, 
    programCommand: string 
): Promise<ExecutionResult> {
    const command = runtimeCommand(programCommand);

    const run = await runCommand(sandbox, command, (RUN_TIMEOUT_SECONDS + 5) * 1000);

    const stdout = await safelyReadFile(sandbox, "/tmp/stdout");
    const stderr = await safelyReadFile(sandbox, "/tm[/stderr");

    if(run.exitCode === 0){
        return {
            status: "Success", 
            output: stdout,
            stdErr: stderr || null 
        };
    }

    const timeoutMessage = run.exitCode === 124 || run.exitCode === 137 ? `Time limit exceeded after ${RUN_TIMEOUT_SECONDS} seconds.` : `Program exited with code ${run.exitCode}.`;

    return {
        status: "Failure", 
        output: stdout || null, 
        stdErr: truncate(
            [timeoutMessage, stderr || run.stderr].filter(Boolean).join("/n")
        )
    };
}


async function executeInSandbox(
    code: string, 
    language: SupportedLanguage
): Promise<ExecutionResult> {
    let sandbox: Sandbox | null = null; 

    try{
        // if (!E2B_TEMPLATE) {
        //     throw new Error("E2B_TEMPLATE is not defined.");
        // }
        sandbox = await Sandbox.create(E2B_TEMPLATE!, {
            apiKey: E2B_API_KEY, 
            timeoutMs: SANDBOX_TIMEOUT_MS
        });

        const filePath = getFilePath(language);
        await sandbox.files.write(filePath, code);

        switch(language){
            case "cpp": 
                return await runCpp(sandbox, filePath);
            case "js":
                return await runJavaScript(sandbox, filePath);
            case "py":
                return await runPython(sandbox, filePath);
            default:
                throw new Error(`Unsupported language: ${language}`);

        }

    } catch (error){
        console.error("Sandbox execution error:", error);
        return {
            status: "Failure", 
            output: null, 
            stdErr: truncate(
                `Snadbox execution failed: ${errorMessage(error)}`
            )
        };

    } finally {
        if (sandbox){
            try {
                await sandbox.kill();
            } catch (killError){
                console.log("Failed to kill sandbox: ", killError);
            }
        }
    }
    
}

async function processSubmission(submissionId: string): Promise<void>{
    const submission = await prisma.submissions.findUnique({
        where:{
            id: submissionId
        }, 
        select: {
            id: true, 
            code: true, 
            language: true, 
            status: true
        }
    });

    if(!submission){
        console.log(`Submission ${submissionId} does not exist`);
        return; 
    }

    if(submission.status !== "Processing"){
        console.log(`Skipping submission ${submission.id}; status is ${submission.status}`);
        return; 
    }

    if(!isSupportedLanguage(submission.language)){
        await updateSubmission(submission.id, {
            status: "Failure", 
            output: null, 
            stdErr: "Unsupported language"
        });
        return;
    }
    console.log(`Processing submission ${submission.id} : ${submission.language}`);

    const result = await executeInSandbox(submission.code, submission.language);

    await updateSubmission(submission.id, result);

    console.log(`Finished submission ${submission.id}: ${result.status}`);
}

async function startWorker(): Promise<void>{
    await redis.connect();
    console.log("E2B started");

    while(true){
        const message = await redis.brPop("problems", 0);
        if(!message){
            continue;
        }

        try {
            const job: unknown = JSON.parse(message.element);
            if (typeof job !== "object" || job === null || !("submissionId" in job) || typeof job.submissionId !== "string"){
                console.error("Invalid queue job:", job);
                continue;
            }

            await processSubmission(job.submissionId);

        } catch(error) {
            console.log("Failed to process queue message: ", error);
        }
    }
}

async function shutdown(signal: string): Promise<void>{
    console.log(`Recieved ${signal}; shutting down worker`);

    await Promise.allSettled([redis.quit(), prisma.$disconnect()]);

    process.exit(0);
}

process.on("SIGINT", ()=>{
    void shutdown("SIGINT");
})


process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});

startWorker().catch(async (error)=>{
    console.log(`Worker failed ${error}`);
    
    await Promise.allSettled([redis.disconnect(), prisma.$disconnect()]);

    process.exit(1);
})