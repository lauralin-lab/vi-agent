import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { AudioOutputProps } from './types';
import { Volume2 } from 'lucide-react';

export function AudioOutput({
    snippets,
    className,
    ...props
}: AudioOutputProps) {
    return (
        <LayoutWrapper
            icon={<Volume2 />}
            title="Voice Snippets"
            bordered={false}
            className={cn("bg-transparent", className)}
            {...props}
        >
            <div className="space-y-3">
                {snippets.map((snippet) => (
                    <div
                        key={snippet.id}
                        className="flex items-center justify-between p-4 rounded-3xl bg-zinc-100 dark:bg-zinc-900"
                    >
                        <span className="text-zinc-900 dark:text-zinc-100 font-medium">
                            {snippet.text}
                        </span>
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center cursor-pointer hover:bg-zinc-300 dark:hover:bg-zinc-700 transition">
                            <Volume2 className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                        </div>
                    </div>
                ))}
            </div>
        </LayoutWrapper>
    );
}
