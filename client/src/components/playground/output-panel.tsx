import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, Terminal } from "lucide-react";

interface OutputPanelProps {
    status: string;
    output: string;
    stdErr: string;
    isRunning: boolean;
    executionTime: number | null;
}

export function OutputPanel({
    status,
    output,
    stdErr,
    isRunning,
    executionTime,
}: OutputPanelProps) {
    const normalizedStatus = status.toLowerCase();

    const isSuccessful =
        normalizedStatus === "accepted" ||
        normalizedStatus === "success" ||
        normalizedStatus === "completed";

    const hasFailed =
        normalizedStatus === "failed" ||
        normalizedStatus === "error" ||
        normalizedStatus.includes("limit") ||
        normalizedStatus.includes("exception");

    const hasResults = Boolean(output || stdErr || isRunning);

    return (
        <section className="panel output-panel">
            <div className="panel-header">
                <div className="panel-title">
                    <Terminal size={16} />
                    <span>Output</span>
                </div>

                <StatusBadge status={status} isRunning={isRunning} isSuccessful={isSuccessful} hasFailed={hasFailed} />
            </div>

            <div className="terminal-content">
                {!hasResults ? (
                    <EmptyOutput />
                ) : (
                    <div className="terminal-results">
                        {isRunning && (
                            <div className="processing-message">
                                <LoaderCircle className="animate-spin" size={16} />
                                <span>Executing submission…</span>
                            </div>
                        )}

                        {output && (
                            <TerminalBlock label="stdout" content={output}/>
                        )}

                        {stdErr && (
                            <TerminalBlock label="stderr" content={stdErr} variant="error" />
                        )}

                        {!isRunning && !output && !stdErr && (
                            <TerminalBlock label="stdout" content="Process finished without output." muted />
                        )}
                    </div>
                )}
            </div>

            <footer className="panel-footer output-footer">
                <span>
                    {executionTime !== null
                        ? `${Math.round(executionTime)} ms`
                        : "No execution"}
                </span>

                <span>UTF-8</span>
            </footer>
        </section>
    );
}

function EmptyOutput() {
    const shortcut = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";

    return (
        <div className="terminal-empty">
            <div className="terminal-empty-icon">
                <Terminal size={22} />
            </div>

            <div>
                <h2>Ready to execute</h2>
                <p>
                    Run your code to see its output and diagnostics here.
                </p>
            </div>

            <div className="terminal-empty-hint">
                Press <kbd>{shortcut}</kbd> + <kbd>Enter</kbd>
            </div>
        </div>
    );
}

interface StatusBadgeProps {
    status: string;
    isRunning: boolean;
    isSuccessful: boolean;
    hasFailed: boolean;
}

function StatusBadge({
    status,
    isRunning,
    isSuccessful,
    hasFailed,
}: StatusBadgeProps) {
    let className = "status-badge status-idle";
    let icon = <Clock3 size={13} />;

    if (isRunning) {
        className = "status-badge status-processing";
        icon = (
            <LoaderCircle className="animate-spin" size={13} />
        );
    } else if (isSuccessful) {
        className = "status-badge status-success";
        icon = <CheckCircle2 size={13} />;
    } else if (hasFailed) {
        className = "status-badge status-error";
        icon = <AlertCircle size={13} />;
    }

    return (
        <div className={className}>
            {icon}
            <span>{isRunning ? "Processing" : status}</span>
        </div>
    );
}

interface TerminalBlockProps {
    label: string;
    content: string;
    variant?: "default" | "error";
    muted?: boolean;
}

// function TerminalBlock({
//     label,
//     content,
//     variant = "default",
//     muted = false,
// }: TerminalBlockProps) {
//     return (
//         <section className={`terminal-block ${variant === "error" ? "terminal-block-error" : ""}`}>
//             <div className="terminal-block-label">{label}</div>

//             <pre className={muted ? "terminal-output-muted" : ""}>
//                 {content}
//             </pre>
//         </section>
//     );
// }

function TerminalBlock({
    label,
    content,
    variant = "default",
    muted = false,
}: TerminalBlockProps) {
    return (
        <section className={["terminal-block", variant === "error" ? "terminal-block-error" : "",].filter(Boolean).join(" ")}>
            <div className="terminal-block-label">{label}</div>

            <pre className={muted ? "terminal-output-muted" : undefined}>
                <code>{content}</code>
            </pre>
        </section>
    );
}