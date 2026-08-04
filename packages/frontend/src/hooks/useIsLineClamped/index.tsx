import { useElementSize } from '@mantine/hooks';
import { useEffect, useState } from 'react';

/**
 * Detects if the element is line clamped by comparing its scrollHeight to computed max height
 * @param lineClamp - number of lines to clamp at
 * @returns {ref, isLineClamped} - ref to attach to the element and isLineClamped boolean
 */
export const useIsLineClamped = <T extends HTMLElement = any>(
    lineClamp: number,
) => {
    const { ref, width, height } = useElementSize<T>();
    const [isLineClamped, setIsLineClamped] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const lineHeight = parseInt(getComputedStyle(element).lineHeight);
        const maxHeight = lineHeight * lineClamp;

        setIsLineClamped(element.scrollHeight > maxHeight);
    }, [ref, width, height, lineClamp]);

    return {
        ref,
        isLineClamped,
    } as const;
};
