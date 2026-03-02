import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { TextOutputProps } from './types';
import { FileText } from 'lucide-react';

export function TextOutput({
    content,
    markdown = false,
    font = 'sans',
    variant = 'body',
    className,
    ...props
}: TextOutputProps) {
    const fontClass = font === 'mono' ? 'font-mono' : 'font-sans';

    const variantClass = {
        body: 'text-sm leading-relaxed',
        caption: 'text-xs text-muted-foreground',
        code: 'font-mono text-xs bg-muted/50 p-2 rounded',
    }[variant];

    return (
        <LayoutWrapper
            icon={<FileText />}
            title="Text Output"
            bordered={false}
            className={cn("bg-transparent", className)}
            {...props}
        >
            <div className={cn("p-4 bg-white dark:bg-zinc-900 rounded-3xl", fontClass, variantClass)}>
                {markdown ? (
                    <div className="prose dark:prose-invert max-w-none prose-sm">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, rehypeSanitize]}
                            components={{
                                a: ({ node, ...props }) => (
                                    <a target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" {...props} />
                                ),
                                pre: ({ node, ...props }) => (
                                    <pre className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-lg overflow-x-auto my-4" {...props} />
                                ),
                                code: ({ node, className, children, ...props }) => {
                                    const match = /language-(\w+)/.exec(className || '');
                                    return match ? (
                                        <code className={cn("bg-transparent", className)} {...props}>
                                            {children}
                                        </code>
                                    ) : (
                                        <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded text-sm" {...props}>
                                            {children}
                                        </code>
                                    );
                                }
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                ) : (
                    <div className="whitespace-pre-wrap text-zinc-900 dark:text-zinc-100">{content}</div>
                )}
            </div>
        </LayoutWrapper>
    );
}
