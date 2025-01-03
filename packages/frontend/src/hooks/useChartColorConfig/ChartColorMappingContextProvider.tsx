import { useEffect, useRef, type FC } from 'react';
import { useLocation } from 'react-router';
import { ChartColorMappingContext } from './context';

/**
 * Exposes a map of identifier->color values, which can be shared across
 * a context, for shared color assignment.
 */
const ChartColorMappingContextProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const location = useLocation();

    /**
     * Changes to colorMappings are intentionally kept outside the React render loop,
     * we don't want to trigger re-renders for every mapping assignment, and we're
     * creating assignments during the render process anyway.
     */
    const colorMappings = useRef(new Map<string, Map<string, number>>());

    /**
     * Any time the path changes, if we have any color mappings in the context,
     * we reset them completely. This prevents things like playing around with
     * filters, or editing a chart, from 'polluting' the mappings table in
     * unpredictable ways.
     *
     * This could alternatively be implemented as contexts further down the tree,
     * but this approach ensures mappings are always shared at the highest possible
     * level regardless of how/where a chart is being rendered.
     */
    useEffect(() => {
        if (colorMappings.current.size > 0) {
            colorMappings.current = new Map<string, Map<string, number>>();
        }
    }, [location.pathname]);

    return (
        <ChartColorMappingContext.Provider
            value={{
                colorMappings: colorMappings.current,
            }}
        >
            {children}
        </ChartColorMappingContext.Provider>
    );
};

export default ChartColorMappingContextProvider;
