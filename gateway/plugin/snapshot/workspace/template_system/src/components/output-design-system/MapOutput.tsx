import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { MapOutputProps } from './types';
import { MapPin, Navigation, Copy, ExternalLink, Map as MapIcon } from 'lucide-react';
import { toast } from 'sonner';

// Placeholder map image style generator
const getMapUrl = (lat: number, lng: number) =>
    `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${lng},${lat},14,0/600x400?access_token=YOUR_TOKEN`;
// In a real app we'd use a real token or a library like react-map-gl, 
// for now we'll use a stylized div placeholder or the provided image

export function MapOutput({
    location,
    mapImageSrc,
    className,
    ...props
}: MapOutputProps) {

    const handleCopyAddress = () => {
        navigator.clipboard.writeText(location.address);
        toast.success('Address copied to clipboard');
    };

    const handleOpenMaps = () => {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`, '_blank');
    };

    return (
        <LayoutWrapper
            icon={<MapIcon />}
            title="Location"
            className={cn("bg-zinc-50 dark:bg-zinc-950", className)}
            {...props}
        >
            <div className="flex flex-col h-full min-h-[300px]">
                {/* Map Preview Area */}
                <div className="relative flex-1 bg-blue-50 dark:bg-blue-950/20 overflow-hidden min-h-[200px] group">
                    {mapImageSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={mapImageSrc}
                            alt={`Map of ${location.name}`}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        // Fallback stylized map visualization
                        <div className="absolute inset-0 opacity-50 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-zinc-200 dark:bg-zinc-800" />
                    )}

                    {/* Animated Pin */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                        <div className="relative">
                            <span className="flex h-4 w-4">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500"></span>
                            </span>
                        </div>
                        <div className="mt-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium transform transition-transform group-hover:scale-110 duration-200">
                            {location.name}
                        </div>
                    </div>
                </div>

                {/* Location Details & Actions */}
                <div className="bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
                    <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Location</dt>
                            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 sm:col-span-2 sm:mt-0 font-medium">{location.name}</dd>
                        </div>
                        <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Address</dt>
                            <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 sm:col-span-2 sm:mt-0">{location.address}</dd>
                        </div>
                    </dl>

                    <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800">
                        <div className="flex gap-3">
                            <button
                                onClick={handleOpenMaps}
                                className="flex-1 inline-flex justify-center items-center gap-2 rounded-md bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                            >
                                <Navigation className="h-4 w-4 text-zinc-500" />
                                Open in Maps
                            </button>
                            <button
                                onClick={handleCopyAddress}
                                className="flex-1 inline-flex justify-center items-center gap-2 rounded-md bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                            >
                                <Copy className="h-4 w-4 text-zinc-500" />
                                Copy Address
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </LayoutWrapper>
    );
}
