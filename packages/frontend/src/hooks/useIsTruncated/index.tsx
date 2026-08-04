import { useElementSize, useMergedRef } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';

/**
 * Detects if the element is truncated by comparing its scrollWidth to its clientWidth
 * @param selector - Optional CSS selector to find a child element inside the ref
 * @returns {ref, isTruncated} - ref to attach to the element and isTruncated boolean
 */
export const useIsTruncated = <T extends HTMLElement = any>(
    selector?: string,
) => {
    const elementRef = useRef<T | null>(null);
    const { ref: sizeRef, width } = useElementSize<T>();
    const ref = useMergedRef(elementRef, sizeRef);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        if (!elementRef.current) return;
        const element = selector
            ? elementRef.current.querySelector<HTMLElement>(selector)
            : elementRef.current;
        if (!element) return;
        setIsTruncated(element.scrollWidth > element.clientWidth);
    }, [width, selector]);

    return {
        ref,
        isTruncated,
    } as const;
};
