"use client";

import { useEffect, useRef } from "react";
import { basicSetup, EditorView } from "codemirror";
import { Compartment, type Extension } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";

export type CodeLanguageId =
  | "plain"
  | "markdown"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "json"
  | "html"
  | "css"
  | "xml"
  | "yaml"
  | "python"
  | "sql"
  | "java"
  | "cpp"
  | "rust"
  | "go"
  | "php";

export const CODE_LANGUAGE_OPTIONS: Array<{ value: CodeLanguageId; label: string }> = [
  { value: "plain", label: "纯文本" },
  { value: "markdown", label: "Markdown" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "json", label: "JSON" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS / SCSS / Less" },
  { value: "xml", label: "XML" },
  { value: "yaml", label: "YAML" },
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "java", label: "Java" },
  { value: "cpp", label: "C / C++" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "php", label: "PHP" },
];

export const detectCodeLanguage = (fileName: string): CodeLanguageId => {
  const ext = fileName.toLocaleLowerCase().split(".").pop() ?? "";
  if (/^(md|markdown|mdx)$/.test(ext)) return "markdown";
  if (/^(js|mjs|cjs)$/.test(ext)) return "javascript";
  if (ext === "jsx") return "jsx";
  if (/^(ts|mts|cts)$/.test(ext)) return "typescript";
  if (ext === "tsx") return "tsx";
  if (/^(json|jsonc|map)$/.test(ext)) return "json";
  if (/^(html|htm|vue|svelte)$/.test(ext)) return "html";
  if (/^(css|scss|sass|less)$/.test(ext)) return "css";
  if (/^(xml|svg|plist)$/.test(ext)) return "xml";
  if (/^(yaml|yml)$/.test(ext)) return "yaml";
  if (/^(py|pyw)$/.test(ext)) return "python";
  if (/^(sql|ddl|dml)$/.test(ext)) return "sql";
  if (ext === "java") return "java";
  if (/^(c|cc|cpp|cxx|h|hh|hpp|hxx)$/.test(ext)) return "cpp";
  if (ext === "rs") return "rust";
  if (ext === "go") return "go";
  if (/^(php|phtml)$/.test(ext)) return "php";
  return "plain";
};

const loadLanguage = async (language: CodeLanguageId): Promise<Extension> => {
  switch (language) {
    case "markdown": return (await import("@codemirror/lang-markdown")).markdown();
    case "javascript": return (await import("@codemirror/lang-javascript")).javascript();
    case "typescript": return (await import("@codemirror/lang-javascript")).javascript({ typescript: true });
    case "jsx": return (await import("@codemirror/lang-javascript")).javascript({ jsx: true });
    case "tsx": return (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true });
    case "json": return (await import("@codemirror/lang-json")).json();
    case "html": return (await import("@codemirror/lang-html")).html();
    case "css": return (await import("@codemirror/lang-css")).css();
    case "xml": return (await import("@codemirror/lang-xml")).xml();
    case "yaml": return (await import("@codemirror/lang-yaml")).yaml();
    case "python": return (await import("@codemirror/lang-python")).python();
    case "sql": return (await import("@codemirror/lang-sql")).sql();
    case "java": return (await import("@codemirror/lang-java")).java();
    case "cpp": return (await import("@codemirror/lang-cpp")).cpp();
    case "rust": return (await import("@codemirror/lang-rust")).rust();
    case "go": return (await import("@codemirror/lang-go")).go();
    case "php": return (await import("@codemirror/lang-php")).php();
    default: return [];
  }
};

const lightTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#fbfcfe", color: "#1e293b" },
  ".cm-scroller": { overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  ".cm-content": { minHeight: "100%", padding: "12px 0", caretColor: "#2563eb" },
  ".cm-line": { padding: "0 16px" },
  ".cm-gutters": { backgroundColor: "#f8fafc", color: "#94a3b8", borderRight: "1px solid #e2e8f0" },
  ".cm-activeLine": { backgroundColor: "#eff6ff80" },
  ".cm-activeLineGutter": { backgroundColor: "#dbeafe", color: "#2563eb" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "#bfdbfe !important" },
  "&.cm-focused": { outline: "none" },
});

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-editor": { height: "100%" },
  ".cm-scroller": { minHeight: "0", lineHeight: "1.5rem", overscrollBehavior: "contain" },
  ".cm-content": { width: "max-content", minWidth: "100%" },
  ".cm-panels": { fontSize: "12px" },
  ".cm-searchMatch": { backgroundColor: "#fde68a99" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#fb923c99" },
});

export default function CodeEditor({
  value,
  language,
  lineWrapping,
  onChange,
  onSaveShortcut,
  onCursorChange,
}: {
  value: string;
  language: CodeLanguageId;
  lineWrapping: boolean;
  onChange: (value: string) => void;
  onSaveShortcut?: () => void;
  onCursorChange?: (position: { line: number; column: number; selections: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const initialLineWrappingRef = useRef(lineWrapping);
  const onChangeRef = useRef(onChange);
  const onSaveShortcutRef = useRef(onSaveShortcut);
  const onCursorChangeRef = useRef(onCursorChange);
  const languageCompartmentRef = useRef(new Compartment());
  const wrappingCompartmentRef = useRef(new Compartment());
  const themeCompartmentRef = useRef(new Compartment());

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSaveShortcutRef.current = onSaveShortcut; }, [onSaveShortcut]);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const isDark = document.documentElement.classList.contains("dark");
    const view = new EditorView({
      doc: initialValueRef.current,
      parent: host,
      extensions: [
        basicSetup,
        baseTheme,
        languageCompartmentRef.current.of([]),
        wrappingCompartmentRef.current.of(initialLineWrappingRef.current ? EditorView.lineWrapping : []),
        themeCompartmentRef.current.of(isDark ? oneDark : lightTheme),
        keymap.of([
          indentWithTab,
          { key: "Mod-s", run: () => { onSaveShortcutRef.current?.(); return true; } },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const head = update.state.selection.main.head;
            const line = update.state.doc.lineAt(head);
            onCursorChangeRef.current?.({
              line: line.number,
              column: head - line.from + 1,
              selections: update.state.selection.ranges.length,
            });
          }
        }),
      ],
    });
    viewRef.current = view;
    const observer = new MutationObserver(() => {
      const nextDark = document.documentElement.classList.contains("dark");
      view.dispatch({ effects: themeCompartmentRef.current.reconfigure(nextDark ? oneDark : lightTheme) });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      observer.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    void loadLanguage(language).then((extension) => {
      if (cancelled || !viewRef.current) return;
      viewRef.current.dispatch({ effects: languageCompartmentRef.current.reconfigure(extension) });
    });
    return () => { cancelled = true; };
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrappingCompartmentRef.current.reconfigure(lineWrapping ? EditorView.lineWrapping : []) });
  }, [lineWrapping]);

  return <div ref={hostRef} className="h-full min-h-0 w-full overflow-hidden" />;
}
