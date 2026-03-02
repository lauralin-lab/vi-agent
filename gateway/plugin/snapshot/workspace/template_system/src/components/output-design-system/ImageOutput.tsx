import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { ImageOutputProps } from './types';
import { ImageIcon, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

export function ImageOutput({
    src,
    alt,
    caption,
    interactive = false,
    className,
    ...props
}: ImageOutputProps) {
    const [scale, setScale] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 3));
    const handleZoomOut = () => setScale(s => Math.max(s - 0.5, 1));
    const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

    return (
        <LayoutWrapper
            icon={<ImageIcon />}
            title="Image Output"
            className={cn(isFullscreen && "fixed inset-0 z-50 h-[100vh] rounded-none", className)}
            {...props}
        >
            <div className={cn(
                "relative flex flex-col items-center justify-center p-4 min-h-[200px] h-full bg-black/5 dark:bg-black/20",
                isFullscreen && "bg-black/90"
            )}>
                {interactive && (
                    <div className="absolute top-4 right-4 flex gap-2 z-10 bg-background/50 backdrop-blur-sm p-1 rounded-lg border border-border/50">
                        <button
                            onClick={handleZoomOut}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            title="Zoom Out"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </button>
                        <button
                            onClick={handleZoomIn}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            title="Zoom In"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </button>
                        <button
                            onClick={toggleFullscreen}
                            className="p-1.5 hover:bg-muted rounded-md transition-colors"
                            title="Toggle Fullscreen"
                        >
                            <Maximize className="h-4 w-4" />
                        </button>
                    </div>
                )}

                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                    <div
                        style={{
                            transform: `scale(${scale})`,
                            transition: 'transform 0.2s ease-in-out'
                        }}
                        className="flex items-center justify-center"
                    >
                        {/* We use standard img tag here for flexibility with arbitrary URLs and scaling, 
                Next.js Image requires known dimensions or fill, which can be tricky with zoom */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={src}
                            alt={alt}
                            className="max-w-full max-h-[500px] object-contain rounded shadow-sm"
                            style={{ maxHeight: isFullscreen ? '90vh' : undefined }}
                        />
                    </div>
                </div>

                {caption && (
                    <div className="mt-4 text-center">
                        <p className="text-sm text-muted-foreground bg-background/80 px-3 py-1 rounded-full backdrop-blur-sm border shadow-sm">
                            {caption}
                        </p>
                    </div>
                )}
            </div>
        </LayoutWrapper>
    );
}
