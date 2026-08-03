import { useElementSize } from '@mantine/hooks';
import { useEffect, useState } from 'react';

/**
 * Detects if the element is truncated by comparing its scrollWidth to its clientWidth
 * @param selector - Optional CSS selector to find a child element inside the ref
 * @returns {ref, isTruncated} - ref to attach to the element and isTruncated boolean
 */
export const useIsTruncated = <T extends HTMLElement = any>(
    selector?: string,
) => {
    const { ref, width } = useElementSize<T>();
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        if (!ref.current) return;
        const element = selector
            ? ref.current.querySelector<HTMLElement>(selector)
            : ref.current;
        if (!element) return;
        setIsTruncated(element.scrollWidth > element.clientWidth);
    }, [ref, width, selector]);

    return {
        ref,
        isTruncated,
    } as const;
};
