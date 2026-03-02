import React from 'react';

export interface OutputProps {
    /**
     * Optional custom class name for the container
     */
    className?: string;

    /**
     * Title to display in the header
     */
    title?: string;

    /**
     * Optional icon to display in the header
     */
    icon?: React.ReactNode;

    /**
     * Optional footer content
     */
    footer?: React.ReactNode;

    /**
     * Whether to show a border around the output
     * @default true
     */
    bordered?: boolean;

    /**
     * Whether the output is currently loading/streaming
     * @default false
     */
    isLoading?: boolean;
}

export interface TextOutputProps extends OutputProps {
    /**
     * The text content to display
     */
    content: string;

    /**
     * Whether to render as markdown
     * @default false
     */
    markdown?: boolean;

    /**
     * Font family style
     * @default 'sans'
     */
    font?: 'sans' | 'mono';

    /**
     * Text variant/size
     * @default 'body'
     */
    variant?: 'body' | 'caption' | 'code';
}

export interface ImageOutputProps extends OutputProps {
    /**
     * Source URL of the image
     */
    src: string;

    /**
     * Alt text for the image
     */
    alt: string;

    /**
     * Optional caption to display below the image
     */
    caption?: string;

    /**
     * Enable zoom/pan capabilities
     * @default false
     */
    interactive?: boolean;
}


export interface AudioOutputProps extends OutputProps {
    snippets: {
        id: string;
        text: string;
        duration?: string;
    }[];
}

export interface CodeOutputProps extends OutputProps {
    /**
     * The code content
     */
    code: string;

    /**
     * Language for syntax highlighting
     */
    language?: string;

    /**
     * Whether to show line numbers
     * @default true
     */
    showLineNumbers?: boolean;
}

export interface InteractivePlaygroundOutputProps extends OutputProps {
    /**
     * URL to embed (if iframe)
     */
    src?: string;

    /**
     * Custom React node content
     */
    children?: React.ReactNode;

    /**
     * Type of interactive element
     */
    type: 'iframe' | 'custom' | 'canvas';

    /**
     * Sandbox permissions (if iframe)
     */
    sandboxPermissions?: string;
}



export interface MapOutputProps extends OutputProps {
    location: {
        lat: number;
        lng: number;
        name: string;
        address: string;
    };
    mapImageSrc?: string; // Optional static image
}

export interface SlideDeckOutputProps extends OutputProps {
    slides: {
        src?: string;
        title?: string;
        content?: string;
        type: 'image' | 'video' | 'text';
    }[];
}

export interface ProductListOutputProps extends OutputProps {
    products: {
        id: string;
        name: string;
        price: string;
        imageSrc: string;
        description?: string;
        url?: string;
    }[];
}

export interface MusicPlayerOutputProps extends OutputProps {
    track: {
        title: string;
        artist: string;
        album: string;
        coverArt: string;
        duration: number; // in seconds
        src: string;
    };
    playlist?: {
        title: string;
        artist: string;
        duration: number;
    }[];
}

export interface TableOutputProps extends OutputProps {
    columns: {
        accessorKey: string;
        header: string;
    }[];
    data: Record<string, any>[];
    description?: string;
}

export interface MindMapOutputProps extends OutputProps {
    nodes: {
        id: string;
        label: string;
        type?: 'default' | 'root' | 'input' | 'output';
        x?: number;
        y?: number;
    }[];
    edges: {
        id: string;
        source: string;
        target: string;
        label?: string;
    }[];
}
