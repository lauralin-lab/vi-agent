import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { ProductListOutputProps } from './types';
import { ShoppingBag, Star, ExternalLink, Tag } from 'lucide-react';

export function ProductListOutput({
    products,
    className,
    ...props
}: ProductListOutputProps) {
    return (
        <LayoutWrapper
            icon={<ShoppingBag />}
            title="Products"
            bordered={false}
            className={cn("bg-transparent", className)}
            {...props}
        >
            <div className="flex flex-col">
                {products.map((product) => (
                    <div
                        key={product.id}
                        className="group relative flex gap-4 p-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                        <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={product.imageSrc}
                                alt={product.name}
                                className="h-full w-full object-cover object-center"
                            />
                        </div>

                        <div className="flex flex-1 flex-col justify-center">
                            <div className="flex justify-between items-start gap-2">
                                <div>
                                    <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                        <a href={product.url}>
                                            <span aria-hidden="true" className="absolute inset-0" />
                                            {product.name}
                                        </a>
                                    </h3>
                                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                                        {product.description || 'No description available'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between">
                                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                    {product.price}
                                </p>
                                <div className="flex items-center gap-1 text-yellow-400">
                                    <Star className="h-3 w-3 fill-current" />
                                    <span className="text-xs text-zinc-500 dark:text-zinc-400">4.2</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </LayoutWrapper>
    );
}
