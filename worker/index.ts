import { createClient } from "redis";
import { prisma } from "./db";
import { Sandbox } from "e2b";

const REDIS_URL = process.env.REDIS_URL; 
const E2B_API_KEY = process.env.E2B_API_KEY; 
const E2B_TEMPLATE = process.env.E2B_TEMPLATE;

const SANDBOX_TIMEOUT_MS = parsePositiveInteger(process.env.SANDBOX_TIMEOUT_MS, 60_000);

const COMPILE_TIMEOUT_SECONDS = parsePositiveInteger(process.env.COMPILE_TIMEOUT_SECONDS, 20);

const RUN_TIMEOUT_SECONDS = parsePositiveInteger(process.env.RUN_TIMEOUT_SECONDS, 5);

const MAX_OUTPUT_CHARS = parsePositiveInteger(process.env.MAX_OUTPUT_CHARS, 1_000_000);

const SANDBOX_CREATE_TIMEOUT_MS = parsePositiveInteger(process.env.SANDBOX_CREATE_TIMEOUT_MS, 20_000);

const SANDBOX_KILL_TIMEOUT_MS = parsePositiveInteger(process.env.SANDBOX_KILL_TIMEOUT_MS, 10_000);

const EXECUTION_DEADLINE_MS = parsePositiveInteger(process.env.EXECUTION_DEADLINE_MS, 40_000);

const activeSandboxes = new Set<Sandbox>();

let shuttingDown = false;


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

type CommandAttempt = 
    | {
        // if (attempt.result !== null) 
        result: CommandResult;
        error: null;
    }
    | {
        // if (attempt.result === null) 
        result: null;
        error: unknown;
    };

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

class OperationTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OperationTimeoutError";
    }
}

async function withTimeout<T>(
    operation: Promise<T>, 
    timeoutMs: number, 
    message: string 
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined; 

    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new OperationTimeoutError(message));
        }, timeoutMs);

        timer.unref?.();
    });

    try {
        return await Promise.race([operation, timeout]);
    } finally {
        if(timer){
            clearTimeout(timer);
        }
    }
}

function isTimeoutError(error: unknown): boolean{
    if(error instanceof OperationTimeoutError){
        return true; 
    }
    const message = errorMessage(error).toLowerCase();

    return (message.includes("time out") || message.includes("timed out") || message.includes("timeout") || message.includes("deadline exceeded"));
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
        stderr: truncate(result.stderr ?? "")
    };
}

async function attemptCommand(
    sandbox: Sandbox, 
    command: string, 
    timeoutMs: number, 
): Promise<CommandAttempt> {
    try {
        return {
            result: await runCommand(sandbox, command, timeoutMs), 
            error: null
        }

    } catch (error){
        return{
            result: null, 
            error
        };
    }
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
        "g++ -std=c++20 -O2 -pipe ", 
        "-fdiagnostics-color=never ",
        `${filePath} -o /tmp/program`,
        " > /tmp/compile-stdout 2> /tmp/compile-stderr",
        "'",
    ].join("");

    // const compile = await runCommand(sandbox, compileCommand, (COMPILE_TIMEOUT_SECONDS + 5) * 1000);

    const attempt = await attemptCommand(sandbox, compileCommand, (COMPILE_TIMEOUT_SECONDS + 5) * 1000);

    const compileStdout = await safelyReadFile(sandbox, "/tmp/compile-stdout");

    const compileStderr = await safelyReadFile(sandbox, "/tmp/compile-stderr");

    // if(compile.exitCode !== 0){
    //     const timeoutMessage = compile.exitCode === 124 || compile.exitCode === 137 ? "Compilation timed out" : "";

    //     return {
    //         status: "Failure", 
    //         output: compileStdout || null, 
    //         stdErr: truncate(
    //             [timeoutMessage, compileStderr || compile.stderr].filter(Boolean).join("\n")
    //         ) || "Compilation failed"
    //     };
    // }

    if(!attempt.result){
        const runnerMessage = isTimeoutError(attempt.error) ? `Compilation timed out after ${COMPILE_TIMEOUT_SECONDS} seconds` : `Compiler service error: ${errorMessage(attempt.error)}`;

        return {
            status: "Failure",
            output: compileStdout || null, 
            stdErr: truncate(
                [runnerMessage, compileStderr].filter(Boolean).join("\n")
            ) || "Compilation failed"
        }
    }

    if(attempt.result.exitCode !== 0){
        const timeout = attempt.result.exitCode === 124 || attempt.result.exitCode === 137;

        const failureMessage = timeout ? `Compilation timed out after ${COMPILE_TIMEOUT_SECONDS} seconds` : "Compilation failed";

        return {
            status: "Failure",
            output: compileStdout || null,
            stdErr: truncate(
                [failureMessage, compileStderr || attempt.result.stderr].filter(Boolean).join("\n")
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

// async function runExecutable(
//     sandbox: Sandbox, 
//     programCommand: string 
// ): Promise<ExecutionResult> {
//     const command = runtimeCommand(programCommand);

//     const run = await runCommand(sandbox, command, (RUN_TIMEOUT_SECONDS + 5) * 1000);

//     const stdout = await safelyReadFile(sandbox, "/tmp/stdout");
//     const stderr = await safelyReadFile(sandbox, "/tm[/stderr");

//     if(run.exitCode === 0){
//         return {
//             status: "Success", 
//             output: stdout,
//             stdErr: stderr || null 
//         };
//     }

//     const timeoutMessage = run.exitCode === 124 || run.exitCode === 137 ? `Time limit exceeded after ${RUN_TIMEOUT_SECONDS} seconds.` : `Program exited with code ${run.exitCode}.`;

//     return {
//         status: "Failure", 
//         output: stdout || null, 
//         stdErr: truncate(
//             [timeoutMessage, stderr || run.stderr].filter(Boolean).join("/n")
//         )
//     };
// }


async function runExecutable(
    sandbox: Sandbox, 
    programCommand: string
): Promise<ExecutionResult> {
    const command = runtimeCommand(programCommand);

    const attempt = await attemptCommand(sandbox, command, (RUN_TIMEOUT_SECONDS + 5) * 1000);

    const [stdout, stderr] = await Promise.all([safelyReadFile(sandbox, "/tmp/stdout"), safelyReadFile(sandbox, "/tmp/stderr")]);

    if(!attempt.result){
        const runnerMessage = isTimeoutError(attempt.error) ? `Time limit exceeded after ${RUN_TIMEOUT_SECONDS} seconds` : `Execution service error: ${errorMessage(attempt.error)}`;

        return {
            status: "Failure", 
            output: stdout || null, 
            stdErr: truncate([runnerMessage, stderr].filter(Boolean).join("\n")) || "Program execution failed"
        }
    }

    if(attempt.result.exitCode === 0){
        return {
            status: "Success", 
            output: stdout, 
            stdErr: stderr || attempt.result.stderr || null,
        };
    }

    const timeout = attempt.result.exitCode === 124 || attempt.result.exitCode === 137; 

    const failureMessage = timeout ? `Time limit exceeded after ${RUN_TIMEOUT_SECONDS} seconds` : `Program exited with code ${attempt.result.exitCode}`;

    return {
        status: "Failure",
        output: stdout || null,
        stdErr: truncate([failureMessage, stderr || attempt.result.stderr].filter(Boolean).join("\n")) || "Program execution failed, try again"
    };
}

async function killSandboxSafely(sandbox: Sandbox): Promise<void> {
    try {
        await withTimeout(
            sandbox.kill(), SANDBOX_KILL_TIMEOUT_MS, `Sandbox cleanup exceeded ${SANDBOX_KILL_TIMEOUT_MS}ms`
        );
    } catch (error){
        console.log("Failed to kill sandbox: ", sandbox);
    } finally {
        activeSandboxes.delete(sandbox);
    }
}

async function createSandboxSafely(): Promise<Sandbox> {
    const createPromise = Sandbox.create(E2B_TEMPLATE!, {
        apiKey: E2B_API_KEY,
        timeoutMs: SANDBOX_TIMEOUT_MS,
    });

    try {
        return await withTimeout(
            createPromise,
            SANDBOX_CREATE_TIMEOUT_MS,
            `Sandbox creation exceeded ${SANDBOX_CREATE_TIMEOUT_MS}ms`,
        );
    } catch (error) {
        void createPromise
            .then(async (lateSandbox) => {
                console.log("Sandbox was created after the local creation deadline; killing it");
                
                await killSandboxSafely(lateSandbox);
            })
            .catch((createError) => {
                console.log("Sandbox creation eventually failed:", createError);
            });

        throw error;
    }
}

async function executeInSandbox(
    code: string, 
    language: SupportedLanguage
): Promise<ExecutionResult> {
    let sandbox: Sandbox | null = null; 

    try{
        // sandbox = await withTimeout(Sandbox.create(E2B_TEMPLATE!, {
        //         apiKey: E2B_API_KEY, 
        //         timeoutMs: SANDBOX_TIMEOUT_MS
        //     }), 
        //     SANDBOX_CREATE_TIMEOUT_MS, 
        //     `Sandbox creation exceeded ${SANDBOX_CREATE_TIMEOUT_MS}ms`
        // );

        sandbox = await createSandboxSafely();

        activeSandboxes.add(sandbox);

        const activeSandbox = sandbox;

        return await withTimeout(
            (async (): Promise<ExecutionResult> => {

                const filePath = getFilePath(language);

                await activeSandbox.files.write(filePath, code);

                switch (language) {
                    case "cpp":
                        return await runCpp(activeSandbox, filePath);
                    case "js":
                        return await runJavaScript(activeSandbox, filePath);
                    case "py":
                        return await runPython(activeSandbox, filePath);
                    default:
                        throw new Error(`Unsupported language: ${language}`);

                }


            })(), 
            EXECUTION_DEADLINE_MS, 
            `Execution exceeded the ${EXECUTION_DEADLINE_MS}ms overall deadline`,
        )

    } catch (error){
        console.error("Sandbox execution error: ", error);

        const message = isTimeoutError(error) ? "The execution exceeded its overall time limit" : `Sandbox execution failed: ${errorMessage(error)}`;

        return {
            status: "Failure", 
            output: null, 
            stdErr: truncate(message)
        };

    } finally {
        if (sandbox){
            await killSandboxSafely(sandbox);
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

    while (!shuttingDown){
        let message; 
        try{
            message = await redis.brPop("problems", 5);
        } catch (error){
            if (shuttingDown) {
                break;
            }
            throw error;
        }

        if (!message) {
            continue;
        }

        let submissionId: string | null = null; 

        try {
            const job: unknown = JSON.parse(message.element);

            if (typeof job !== "object" || job === null || !("submissionId" in job) || typeof job.submissionId !== "string"){
                console.error("Invalid queue job:", job);
                continue;
            }
            submissionId = job.submissionId;

            await processSubmission(submissionId);

        } catch(error) {
            console.log("Failed to process queue message: ", error);
            if (submissionId) {
                await markSubmissionFailure(submissionId, error);
            }

        }
    }
    console.log("Worker queue loop stopped");
}

async function markSubmissionFailure(
    submissionId: string,
    error: unknown,
): Promise<void> {
    try {
        await prisma.submissions.updateMany({
            where: {
                id: submissionId,
                status: "Processing",
            },
            data: {
                status: "Failure",
                output: null,
                stdErr: truncate(
                    `Worker failed to process the submission: ${errorMessage(error)}`,
                ),
            },
        });
    } catch (updateError) {
        console.error(
            `Could not mark submission ${submissionId} as failed:`,
            updateError,
        );
    }
}

// async function shutdown(signal: string): Promise<void>{
//     console.log(`Recieved ${signal}; shutting down worker`);

//     await Promise.allSettled([redis.quit(), prisma.$disconnect()]);

//     process.exit(0);
// }

async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}; shutting down worker`);

    const sandboxes = Array.from(activeSandboxes);

    await Promise.allSettled(
        sandboxes.map((sandbox) => killSandboxSafely(sandbox)),
    );

    await Promise.allSettled([
        redis.isOpen ? redis.quit() : Promise.resolve(),
        prisma.$disconnect(),
    ]);

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