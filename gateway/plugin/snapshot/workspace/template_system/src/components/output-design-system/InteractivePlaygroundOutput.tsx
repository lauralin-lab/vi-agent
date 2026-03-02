import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutWrapper } from './LayoutWrapper';
import { InteractivePlaygroundOutputProps } from './types';
import { Play, Globe, Box, ShieldAlert } from 'lucide-react';

export function InteractivePlaygroundOutput({
    src,
    type,
    children,
    sandboxPermissions,
    className,
    ...props
}: InteractivePlaygroundOutputProps) {
    const getIcon = () => {
        switch (type) {
            case 'iframe': return <Globe />;
            case 'canvas': return <Box />;
            default: return <Play />;
        }
    };

    return (
        <LayoutWrapper
            icon={getIcon()}
            title="Interactive Playground"
            className={className}
            {...props}
        >
            <div className="w-full h-full min-h-[400px] bg-muted/10 relative rounded-3xl overflow-hidden shadow-sm">
                {type === 'iframe' && src ? (
                    <iframe
                        src={src}
                        className="w-full h-full min-h-[400px] border-0"
                        sandbox={sandboxPermissions || "allow-scripts allow-same-origin allow-popups allow-forms"}
                        loading="lazy"
                    />
                ) : type === 'custom' && children ? (
                    <div className="w-full h-full min-h-[400px] p-4">
                        {children}
                    </div>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                        <ShieldAlert className="h-10 w-10 mb-2 opacity-50" />
                        <p className="text-sm font-medium">No interactive content available</p>
                        <p className="text-xs opacity-70 mt-1">
                            Please provide a source URL or custom content.
                        </p>
                    </div>
                )}
            </div>
        </LayoutWrapper>
    );
}
