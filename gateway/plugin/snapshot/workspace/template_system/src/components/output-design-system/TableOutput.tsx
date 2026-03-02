import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { TableOutputProps } from './types';
import { Table } from 'lucide-react';

export function TableOutput({
    title,
    description,
    columns,
    data,
    className,
    ...props
}: TableOutputProps) {
    return (
        <LayoutWrapper
            icon={<Table />}
            title={title || "Table"}
            className={cn("bg-white dark:bg-zinc-950", className)}
            {...props}
        >
            <div className="p-4 space-y-4">
                {/* Header content if we want description inside the card */}
                {(title || description) && (
                    <div className="space-y-1">
                        {title && <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>}
                        {description && <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
                    </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                                {columns.map((col, i) => (
                                    <th key={i} className="px-4 py-3 font-medium tracking-wider">
                                        {col.header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
                            {data.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                    {columns.map((col, colIndex) => (
                                        <td key={colIndex} className="px-4 py-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                                            {row[col.accessorKey]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </LayoutWrapper>
    );
}
