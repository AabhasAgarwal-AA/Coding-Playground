import { useCallback, useEffect, useMemo, useState } from "react";
import { Code2, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { Button } from "./components/ui/button";
import { LanguageSelect } from "./components/playground/language-select";
import { OutputPanel } from "./components/playground/output-panel";
import { SyntaxEditor } from "./components/playground/syntax-editor";
import { useCodeRunner } from "./hooks/use-code-runner";
import { getLanguageDetails, initialCode, type Language } from "./lib/languages";
import "./index.css";

export function App() {
  const [selectedLanguage, setSelectedLanguage] = useState<Language>("cpp");

  const [sourceFiles, setSourceFiles] = useState<Record<Language, string>>(initialCode);

  const {
    status,
    output,
    stdErr,
    isRunning,
    executionTime,
    runCode,
    resetResult,
  } = useCodeRunner();

  const code = sourceFiles[selectedLanguage];

  const languageDetails = useMemo(
    () => getLanguageDetails(selectedLanguage),
    [selectedLanguage],
  );

  const lineCount = useMemo(
    () => Math.max(code.split("\n").length, 1),
    [code],
  );

  const updateCode = useCallback(
    (nextCode: string) => {
      setSourceFiles((currentFiles) => ({
        ...currentFiles,
        [selectedLanguage]: nextCode,
      }));
    },
    [selectedLanguage],
  );

  const handleRun = useCallback(() => {
    void runCode(code, selectedLanguage);
  }, [code, runCode, selectedLanguage]);

  const handleReset = useCallback(() => {
    setSourceFiles((currentFiles) => ({
      ...currentFiles,
      [selectedLanguage]: initialCode[selectedLanguage],
    }));

    resetResult();
  }, [resetResult, selectedLanguage]);

  useEffect(() => {
    function handleKeyboardShortcut(
      event: globalThis.KeyboardEvent,
    ) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        handleRun();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyboardShortcut,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboardShortcut,
      );
    };
  }, [handleRun]);

  const keyboardShortcut =
    typeof navigator !== "undefined" &&
      navigator.platform.toLowerCase().includes("mac")
      ? "⌘ ↵"
      : "Ctrl ↵";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Code2 size={18} strokeWidth={2} />
          </div>

          <div className="brand-copy">
            <span className="brand-name">Playground</span>
            <span className="brand-environment">
              Local workspace
            </span>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="server-status">
            <span className="server-status-dot" />
            Execution server
          </div>

          <Button type="button" variant="ghost" className="reset-button" onClick={handleReset} disabled={isRunning}>
            <RotateCcw size={15} />
            <span>Reset</span>
          </Button>

          <Button type="button" className="run-button" onClick={handleRun} disabled={isRunning || !code.trim()}>
            {isRunning ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Play size={16} fill="currentColor" />
            )}

            {isRunning ? "Running" : "Run code"}

            <kbd className="run-shortcut">
              {keyboardShortcut}
            </kbd>
          </Button>
        </div>
      </header>

      <section className="workspace">
        <section className="panel editor-panel">
          <div className="panel-header">
            <div className="file-tab">
              <span
                className={`language-dot language-${selectedLanguage}`}
              />
              <span>{languageDetails.filename}</span>
            </div>

            <LanguageSelect value={selectedLanguage} onChange={setSelectedLanguage} disabled={isRunning} />
          </div>

          <SyntaxEditor value={code} language={selectedLanguage} onChange={updateCode} disabled={isRunning} />

          <footer className="panel-footer">
            <span>{languageDetails.label}</span>
            <span>Spaces: 2</span>
            <span>
              {lineCount} {lineCount === 1 ? "line" : "lines"}
            </span>
          </footer>
        </section>

        <OutputPanel status={status} output={output} stdErr={stdErr} isRunning={isRunning} executionTime={executionTime} />
      </section>
    </main>
  );
}

export default App;