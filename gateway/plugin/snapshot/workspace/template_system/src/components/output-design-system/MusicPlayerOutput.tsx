import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { MusicPlayerOutputProps } from './types';
import { Music, Play, Pause, SkipBack, SkipForward, Disc, ListMusic } from 'lucide-react';

export function MusicPlayerOutput({
    track,
    playlist,
    className,
    ...props
}: MusicPlayerOutputProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);

    // Simulate progress
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying) {
            interval = setInterval(() => {
                setProgress((prev) => (prev + 1) % 100);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying]);

    return (
        <LayoutWrapper
            icon={<Music />}
            title="Now Playing"
            className={cn("bg-zinc-50 dark:bg-zinc-950", className)}
            {...props}
        >
            <div className="flex flex-col md:flex-row h-full">
                {/* Main Player */}
                <div className="flex-1 p-6 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-950">
                    {/* Vinyl / Cover Art */}
                    <div className="relative mb-8 group">
                        <div className={cn(
                            "w-48 h-48 rounded-full shadow-2xl relative overflow-hidden border-4 border-zinc-800 dark:border-zinc-900 transition-transform duration-[10s] ease-linear",
                            isPlaying ? "animate-spin" : ""
                        )}>
                            {/* Vinyl Texture */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.1)_10%,transparent_11%,transparent_13%,rgba(255,255,255,0.1)_14%)] opacity-50 pointer-events-none z-10" />

                            {/* Album Art */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={track.coverArt}
                                alt={track.album}
                                className="w-full h-full object-cover"
                            />

                            {/* Center Hole */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-zinc-300 dark:border-zinc-700 z-20" />
                        </div>

                        {/* Tone Arm Hint (Purely decorative CSS) */}
                        <div className="absolute -top-4 -right-4 w-24 h-2 bg-zinc-400 rotate-45 rounded-full origin-top-right transition-transform duration-500"
                            style={{ transform: isPlaying ? 'rotate(30deg)' : 'rotate(0deg)' }}
                        />
                    </div>

                    <div className="text-center w-full max-w-xs space-y-1 mb-6">
                        <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 truncate">{track.title}</h3>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">{track.artist} — {track.album}</p>
                    </div>

                    {/* Controls */}
                    <div className="w-full max-w-sm space-y-4">
                        {/* Progress Bar */}
                        <div className="w-full h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-1000 ease-linear"
                                style={{ width: `${progress}%` }}
                            />
                        </div>

                        <div className="flex items-center justify-center gap-6">
                            <button className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                                <SkipBack className="h-6 w-6" />
                            </button>
                            <button
                                onClick={() => setIsPlaying(!isPlaying)}
                                className="p-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-black rounded-full hover:scale-105 transition-transform shadow-lg"
                            >
                                {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current ml-1" />}
                            </button>
                            <button className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">
                                <SkipForward className="h-6 w-6" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Playlist (Sidebar on desktop, hidden on small) */}
                {playlist && playlist.length > 0 && (
                    <div className="w-full md:w-80 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col">
                        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2 bg-zinc-50/50 dark:bg-zinc-900/50">
                            <ListMusic className="h-4 w-4 text-zinc-500" />
                            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">Up Next</span>
                        </div>
                        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
                            {playlist.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="group flex items-center gap-3 p-2 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer transition-colors"
                                >
                                    <span className="text-xs font-mono text-zinc-400 group-hover:text-indigo-500 w-5 text-center">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                            {item.title}
                                        </p>
                                        <p className="text-xs text-zinc-500 truncate group-hover:text-zinc-600 dark:group-hover:text-zinc-400">
                                            {item.artist}
                                        </p>
                                    </div>
                                    <span className="text-xs text-zinc-400 group-hover:text-indigo-500 tabular-nums">
                                        {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </LayoutWrapper>
    );
}
