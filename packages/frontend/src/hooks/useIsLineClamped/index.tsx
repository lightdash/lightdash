import { useElementSize, useMergedRef } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';

/**
 * Detects if the element is line clamped by comparing its scrollHeight to computed max height
 * @param lineClamp - number of lines to clamp at
 * @returns {ref, isLineClamped} - ref to attach to the element and isLineClamped boolean
 */
export const useIsLineClamped = <T extends HTMLElement = any>(
    lineClamp: number,
) => {
    const elementRef = useRef<T | null>(null);
    const { ref: sizeRef, width, height } = useElementSize<T>();
    const ref = useMergedRef(elementRef, sizeRef);
    const [isLineClamped, setIsLineClamped] = useState(false);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        const lineHeight = parseInt(getComputedStyle(element).lineHeight);
        const maxHeight = lineHeight * lineClamp;

        setIsLineClamped(element.scrollHeight > maxHeight);
    }, [width, height, lineClamp]);

    return {
        ref,
        isLineClamped,
    } as const;
};
