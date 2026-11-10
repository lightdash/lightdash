import { useMediaQuery, type UseMediaQueryOptions } from '@mantine/hooks';
import { createContext, useContext } from 'react';

// Width of the box the agent renders in, when it doesn't own the viewport
export const AgentContainerWidthContext = createContext<number | null>(null);

// Matches a max-width breakpoint against the agent's container when known,
// otherwise against the viewport
export const useAgentMaxWidth = (
    maxWidthPx: number,
    mediaQueryOptions?: UseMediaQueryOptions,
): boolean => {
    const containerWidth = useContext(AgentContainerWidthContext);
    const matchesViewport = useMediaQuery(
        `(max-width: ${maxWidthPx}px)`,
        undefined,
        mediaQueryOptions,
    );
    return containerWidth === null
        ? matchesViewport
        : containerWidth <= maxWidthPx;
};
