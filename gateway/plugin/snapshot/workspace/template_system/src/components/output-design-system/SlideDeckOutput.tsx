import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { SlideDeckOutputProps } from './types';
import { Presentation, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import Image from 'next/image';

export function SlideDeckOutput({
    slides,
    className,
    ...props
}: SlideDeckOutputProps) {
    const [activeIndex, setActiveIndex] = useState(0);

    const nextSlide = () => setActiveIndex((prev) => (prev + 1) % slides.length);
    const prevSlide = () => setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);

    const activeSlide = slides[activeIndex];

    return (
        <LayoutWrapper
            icon={<Presentation />}
            title="Presentation"
            className={cn("bg-zinc-100 dark:bg-zinc-950", className)}
            {...props}
        >
            <div className="flex flex-col h-full min-h-[400px]">
                {/* Main Slide Preview */}
                <div className="relative flex-1 bg-white dark:bg-zinc-900 m-4 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden group">
                    <div className="absolute inset-x-0 top-0 h-1 bg-zinc-100 dark:bg-zinc-800 flex">
                        {slides.map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "h-full flex-1 transition-colors duration-300",
                                    i === activeIndex ? "bg-blue-500" : "bg-transparent"
                                )}
                            />
                        ))}
                    </div>

                    <div className="flex items-center justify-center h-full p-8 relative">
                        {activeSlide.type === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={activeSlide.src}
                                alt={activeSlide.title || `Slide ${activeIndex + 1}`}
                                className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
                            />
                        ) : activeSlide.type === 'video' ? (
                            <div className="w-full h-full flex items-center justify-center bg-black rounded-lg aspect-video">
                                <span className="text-white/50 text-sm">Video Component Placeholder</span>
                            </div>
                        ) : (
                            <div className="prose dark:prose-invert max-w-none text-center">
                                <h3>{activeSlide.title}</h3>
                                <p>{activeSlide.content}</p>
                            </div>
                        )}

                        {/* Navigation Overlays */}
                        <button
                            onClick={prevSlide}
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 rounded-full text-zinc-900 dark:text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronLeft className="h-6 w-6" />
                        </button>
                        <button
                            onClick={nextSlide}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 rounded-full text-zinc-900 dark:text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronRight className="h-6 w-6" />
                        </button>
                    </div>
                </div>

                {/* Thumbnails Strip - Tabs Style */}
                <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 p-4">
                    <nav className="flex space-x-4 overflow-x-auto pb-2" aria-label="Slides">
                        {slides.map((slide, idx) => (
                            <button
                                key={idx}
                                onClick={() => setActiveIndex(idx)}
                                className={cn(
                                    idx === activeIndex
                                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10"
                                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50",
                                    "flex-shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2 min-w-[100px]"
                                )}
                            >
                                <div className="h-8 w-12 rounded bg-zinc-100 dark:bg-zinc-900 overflow-hidden flex-shrink-0 border border-zinc-200 dark:border-zinc-700">
                                    {slide.type === 'image' ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={slide.src} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[8px] text-zinc-400">
                                            {slide.type}
                                        </div>
                                    )}
                                </div>
                                <span className="truncate max-w-[100px] text-left">
                                    {slide.title || `Slide ${idx + 1}`}
                                </span>
                            </button>
                        ))}
                    </nav>
                </div>
            </div>
        </LayoutWrapper>
    );
}
