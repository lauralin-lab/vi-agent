import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { OutputProps } from './types';

interface LayoutWrapperProps extends OutputProps {
    children: React.ReactNode;
}

export function LayoutWrapper({
    children,
    className,
    title,
    icon,
    footer,
    bordered = true,
    isLoading = false,
}: LayoutWrapperProps) {
    return (
        <div
            className={cn(
                "flex flex-col w-full overflow-hidden bg-white dark:bg-zinc-900",
                bordered && "border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/10",
                className
            )}
        >
            {(title || icon) && (
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/50">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div className="flex-shrink-0 p-1.5 bg-zinc-50 dark:bg-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400">
                                {icon}
                            </div>
                        )}
                        {title && (
                            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-6">
                                {title}
                            </h3>
                        )}
                    </div>
                    {isLoading && (
                        <div className="flex-shrink-0">
                            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-auto relative">
                {children}
            </div>

            {footer && (
                <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
                    {footer}
                </div>
            )}
        </div>
    );
}
