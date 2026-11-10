import { useElementSize, useMergedRef } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';

/**
 * Detects if the element is truncated by comparing its scrollWidth to its clientWidth
 * @param selector - Optional CSS selector to find a child element inside the ref
 * @param content - Optional value whose changes also re-measure, for elements
 *   whose text changes without their width changing (e.g. an input's value)
 * @returns {ref, isTruncated} - ref to attach to the element and isTruncated boolean
 */
export const useIsTruncated = <T extends HTMLElement = any>(
    selector?: string,
    content?: unknown,
) => {
    const nodeRef = useRef<T>(null);
    const { ref: sizeRef, width } = useElementSize<T>();
    const ref = useMergedRef(nodeRef, sizeRef);
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        if (!nodeRef.current) return;
        const element = selector
            ? nodeRef.current.querySelector<HTMLElement>(selector)
            : nodeRef.current;
        if (!element) return;
        setIsTruncated(element.scrollWidth > element.clientWidth);
    }, [width, selector, content]);

    return {
        ref,
        isTruncated,
    } as const;
};
