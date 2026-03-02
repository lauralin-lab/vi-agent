import React, { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { MindMapOutputProps } from './types';
import { Network, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

export function MindMapOutput({
    nodes,
    edges,
    className,
    ...props
}: MindMapOutputProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });

    // Simple drag-to-pan logic for the canvas background
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.target === containerRef.current) {
            setIsPanning(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isPanning) {
            setPan(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
        }
    };

    const handleMouseUp = () => setIsPanning(false);

    // Calculate node positions (mock layout since we don't have a layout engine)
    const getInitialPos = (index: number, total: number) => {
        const angle = (index / total) * 2 * Math.PI;
        const radius = 200;
        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius
        };
    };

    return (
        <LayoutWrapper
            icon={<Network />}
            title="Concept Canvas"
            className={cn("bg-zinc-50 dark:bg-zinc-950", className)}
            {...props}
        >
            <div
                ref={containerRef}
                className={cn(
                    "relative w-full h-[600px] overflow-hidden cursor-grab active:cursor-grabbing select-none",
                    "bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px]"
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                    backgroundPosition: `${pan.x}px ${pan.y}px`
                }}
            >
                {/* Controls */}
                <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm p-1">
                    <button onClick={() => setScale(s => Math.min(s + 0.1, 2))} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">
                        <ZoomIn className="h-4 w-4" />
                    </button>
                    <button onClick={() => setScale(s => Math.max(s - 0.1, 0.5))} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">
                        <ZoomOut className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setPan({ x: 0, y: 0 }); setScale(1); }} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>

                {/* Canvas Content */}
                <div
                    className="absolute top-1/2 left-1/2 w-0 h-0"
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                    }}
                >
                    {/* Edges Layer (Simplified) */}
                    <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" style={{ left: -300, top: -300, width: 600, height: 600 }}>
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" className="fill-zinc-400 dark:fill-zinc-600" />
                            </marker>
                        </defs>
                        {edges.map((edge, i) => {
                            return null; // Mock edges
                        })}
                    </svg>

                    {/* Nodes Layer */}
                    {nodes.map((node, i) => {
                        const pos = node.type === 'root' ? { x: 0, y: 0 } : getInitialPos(i, nodes.length);
                        const nodeClassName = cn(
                            "absolute flex items-center justify-center p-4 rounded-xl shadow-lg border cursor-grab active:cursor-grabbing min-w-[120px] text-center backdrop-blur-sm",
                            node.type === 'root'
                                ? "bg-blue-500 text-white border-blue-600 z-10"
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 hover:border-blue-400 dark:hover:border-blue-500"
                        );

                        return (
                            <motion.div
                                key={node.id}
                                drag
                                dragMomentum={false}
                                initial={{ x: pos.x, y: pos.y, opacity: 0, scale: 0.8 }}
                                animate={{ x: pos.x, y: pos.y, opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                style={{ x: pos.x, y: pos.y }}
                            >
                                <div className={nodeClassName}>
                                    <span className="text-sm font-medium">{node.label}</span>

                                    {/* Connectors */}
                                    <div className="absolute -right-1 w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100" />
                                    <div className="absolute -left-1 w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100" />
                                    <div className="absolute -top-1 w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100" />
                                    <div className="absolute -bottom-1 w-2 h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full opacity-0 group-hover:opacity-100" />
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </LayoutWrapper>
    );
}
