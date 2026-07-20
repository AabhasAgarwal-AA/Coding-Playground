import Prism from "prismjs";
import { type KeyboardEvent, useMemo, useRef } from "react";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import type { Language } from "../../lib/languages";

interface SyntaxEditorProps {
    value: string;
    language: Language;
    onChange: (value: string) => void;
    disabled?: boolean;
}

const prismLanguages: Record<Language, string> = {
    cpp: "cpp",
    js: "javascript",
    py: "python",
};

export function SyntaxEditor({
    value,
    language,
    onChange,
    disabled = false,
}: SyntaxEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const highlightedCodeRef = useRef<HTMLElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    const lineCount = useMemo(
        () => Math.max(value.split("\n").length, 1),
        [value],
    );

    const highlightedCode = useMemo(() => {
        const prismLanguageName = prismLanguages[language];
        const grammar = Prism.languages[prismLanguageName];

        if (!grammar) {
            return Prism.util.encode(value) as string;
        }

        return Prism.highlight(
            value,
            grammar,
            prismLanguageName,
        );
    }, [language, value]);

    function synchronizeScroll() {
        const textarea = textareaRef.current;
        const highlightedCodeElement = highlightedCodeRef.current;
        const lineNumbersElement = lineNumbersRef.current;

        if (!textarea) {
            return;
        }

        if (highlightedCodeElement) {
            highlightedCodeElement.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
        }

        if (lineNumbersElement) {
            lineNumbersElement.style.transform = `translateY(${-textarea.scrollTop}px)`;
        }
    }

    function handleKeyDown(
        event: KeyboardEvent<HTMLTextAreaElement>,
    ) {
        if (event.key === "Tab") {
            event.preventDefault();

            const textarea = event.currentTarget;
            const selectionStart = textarea.selectionStart;
            const selectionEnd = textarea.selectionEnd;
            const indentation = "  ";

            const nextValue =
                value.slice(0, selectionStart) +
                indentation +
                value.slice(selectionEnd);

            onChange(nextValue);

            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + indentation.length;
            });

            return;
        }

        if (
            event.key === "Enter" &&
            !event.ctrlKey &&
            !event.metaKey
        ) {
            const textarea = event.currentTarget;
            const selectionStart = textarea.selectionStart;
            const textBeforeCursor = value.slice(0, selectionStart);
            const currentLine = textBeforeCursor.split("\n").at(-1) ?? "";
            const indentation = currentLine.match(/^\s*/)?.[0] ?? "";

            if (!indentation) {
                return;
            }

            event.preventDefault();

            const selectionEnd = textarea.selectionEnd;
            const insertion = `\n${indentation}`;

            const nextValue =
                value.slice(0, selectionStart) +
                insertion +
                value.slice(selectionEnd);

            onChange(nextValue);

            requestAnimationFrame(() => {
                const nextCursorPosition = selectionStart + insertion.length;

                textarea.selectionStart = textarea.selectionEnd = nextCursorPosition;
            });
        }
    }

    return (
        <div className="syntax-editor">
            <div className="syntax-editor-gutter" aria-hidden="true">
                <div ref={lineNumbersRef} className="syntax-editor-line-numbers">
                    {Array.from({ length: lineCount }, (_, index) => (
                        <span key={index}>{index + 1}</span>
                    ))}
                </div>
            </div>

            <div className="syntax-editor-code-area">
                <pre className={`syntax-editor-highlight language-${prismLanguages[language]}`} aria-hidden="true">
                    <code
                        ref={highlightedCodeRef}
                        dangerouslySetInnerHTML={{
                            __html: `${highlightedCode}${value.endsWith("\n") ? " " : ""
                                }`,
                        }}
                    />
                </pre>

                <textarea
                    ref={textareaRef}
                    className="syntax-editor-textarea"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onScroll={synchronizeScroll}
                    disabled={disabled}
                    aria-label="Source code editor"
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    wrap="off"
                />
            </div>
        </div>
    );
}