import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { xcodeLight } from '@uiw/codemirror-theme-xcode';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { CodeOutputProps } from './types';
import { Code, Check, Copy } from 'lucide-react';

const extensions = {
    javascript: [javascript({ jsx: true, typescript: true })],
    typescript: [javascript({ jsx: true, typescript: true })],
    jsx: [javascript({ jsx: true })],
    tsx: [javascript({ jsx: true, typescript: true })],
    python: [python()],
    html: [html()],
    css: [css()],
    json: [json()],
    markdown: [markdown()],
};

export function CodeOutput({
    code,
    language = 'javascript',
    showLineNumbers = true,
    className,
    ...props
}: CodeOutputProps) {
    const { theme } = useTheme();
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const cleanLang = language.toLowerCase() as keyof typeof extensions;
    const extension = extensions[cleanLang] || extensions.javascript;

    return (
        <LayoutWrapper
            icon={<Code />}
            title="Code Output"
            className={className}
            {...props}
        >
            <div className="relative group">
                <button
                    onClick={handleCopy}
                    className="absolute right-4 top-4 z-10 p-2 rounded-md bg-muted/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                    title="Copy code"
                >
                    {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                    ) : (
                        <Copy className="h-4 w-4 text-muted-foreground" />
                    )}
                </button>

                <CodeMirror
                    value={code}
                    height="100%"
                    theme={theme === 'dark' ? vscodeDark : xcodeLight}
                    extensions={extension}
                    editable={false}
                    basicSetup={{
                        lineNumbers: showLineNumbers,
                        foldGutter: true,
                        dropCursor: false,
                        allowMultipleSelections: false,
                        indentOnInput: false,
                    }}
                    className="text-sm border-none"
                />
            </div>
        </LayoutWrapper>
    );
}
