import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSubmission, getSubmission } from "../api/submissions";
import type { Language } from "../lib/languages";

const POLL_INTERVAL = 1_500;

function sleep(duration: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(resolve, duration);

        signal?.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timeout);
                reject(new DOMException("Request aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function getErrorMessage(error: unknown) {
    if (axios.isAxiosError(error)) {
        const serverMessage = error.response?.data?.message;

        if (serverMessage) {
            return String(serverMessage);
        }

        if (error.response) {
            return `The server returned HTTP ${error.response.status}.`;
        }

        if (error.request) {
            return "Could not reach the execution server.";
        }
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "An unexpected error occurred.";
}

export interface CodeRunnerResult {
    status: string;
    output: string;
    stdErr: string;
    isRunning: boolean;
    executionTime: number | null;
    runCode: (code: string, language: Language) => Promise<void>;
    resetResult: () => void;
}

export function useCodeRunner(): CodeRunnerResult {
    const controllerRef = useRef<AbortController | null>(null);

    const [status, setStatus] = useState("Ready");
    const [output, setOutput] = useState("");
    const [stdErr, setStdErr] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [executionTime, setExecutionTime] = useState<number | null>(
        null,
    );

    const resetResult = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;

        setStatus("Ready");
        setOutput("");
        setStdErr("");
        setExecutionTime(null);
        setIsRunning(false);
    }, []);

    const runCode = useCallback(
        async (code: string, language: Language) => {
            if (!code.trim() || isRunning) {
                return;
            }

            controllerRef.current?.abort();

            const controller = new AbortController();
            controllerRef.current = controller;

            const startedAt = performance.now();

            setStatus("Processing");
            setOutput("");
            setStdErr("");
            setExecutionTime(null);
            setIsRunning(true);

            try {
                const createdSubmission = await createSubmission(
                    code,
                    language,
                    controller.signal,
                );

                if (!createdSubmission.id) {
                    throw new Error(
                        "The server did not return a submission ID.",
                    );
                }

                while (!controller.signal.aborted) {
                    const response = await getSubmission(
                        createdSubmission.id,
                        controller.signal,
                    );

                    if (!response.submission) {
                        throw new Error(
                            "The server returned an invalid submission.",
                        );
                    }

                    const submission = response.submission;
                    const submissionStatus =
                        submission.status ?? "Processing";

                    setStatus(submissionStatus);

                    if (submissionStatus.toLowerCase() !== "processing") {
                        setOutput(submission.output ?? "");
                        setStdErr(submission.stdErr ?? "");
                        setExecutionTime(performance.now() - startedAt);
                        break;
                    }

                    await sleep(POLL_INTERVAL, controller.signal);
                }
            } catch (error) {
                if (!axios.isCancel(error) && !controller.signal.aborted) {
                    setStatus("Failed");
                    setStdErr(getErrorMessage(error));
                    setExecutionTime(performance.now() - startedAt);
                }
            } finally {
                if (controllerRef.current === controller) {
                    controllerRef.current = null;
                    setIsRunning(false);
                }
            }
        },
        [isRunning],
    );

    useEffect(() => {
        return () => {
            controllerRef.current?.abort();
        };
    }, []);

    return {
        status,
        output,
        stdErr,
        isRunning,
        executionTime,
        runCode,
        resetResult,
    };
}