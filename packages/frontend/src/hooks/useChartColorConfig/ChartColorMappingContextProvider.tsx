import { useEffect, useRef, type FC } from 'react';
import { useLocation } from 'react-router';
import { ChartColorMappingContext } from './context';

/**
 * Provides a shared Map for color assignment across all charts on the same page.
 */
const ChartColorMappingContextProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => {
    const location = useLocation();

    // Using useRef to avoid re-renders on color assignments
    const colorMappings = useRef(new Map<string, Map<string, number>>());

    // Reset on route changes to prevent color pollution
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
