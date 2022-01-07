import { useEffect, useState } from 'react';

interface Breakpoint {
    isOverBreakpoint: boolean | undefined;
}

const useBreakpoint = (width: number): Breakpoint => {
    const [isOverBreakpoint, setIsOverBreakpoint] = useState<boolean>();

    useEffect(() => {
        if (isOverBreakpoint === undefined) {
            setIsOverBreakpoint(window.innerWidth > width);
        }
    }, [width, setIsOverBreakpoint, isOverBreakpoint]);

    useEffect(() => {
        // checks if viewport is greater than the given breakpoint
        const handleResize = () =>
            setIsOverBreakpoint(window.innerWidth > width);

        // check if still in desktop view on resize
        window.addEventListener('resize', handleResize, { passive: true });

        // on unmount of component remove event listener
        return () => window.removeEventListener('resize', handleResize);
    }, [width]);

    return {
        isOverBreakpoint,
    };
};

export default useBreakpoint;
