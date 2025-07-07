import { useEffect, useRef, useState } from 'react';

interface UseDelayedHoverOptions {
    delay?: number;
}

export const useDelayedHover = ({
    delay = 300,
}: UseDelayedHoverOptions = {}) => {
    const [isHovered, setIsHovered] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            setIsHovered(true);
        }, delay);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        setIsHovered(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return {
        isHovered,
        handleMouseEnter,
        handleMouseLeave,
    };
};
