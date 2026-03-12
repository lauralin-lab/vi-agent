import { createContext, useContext } from 'react';

// Allows AccentBar (and other primitives) to know if the parent block is still streaming
export const StreamingContext = createContext(false);
export const useIsStreaming = () => useContext(StreamingContext);
