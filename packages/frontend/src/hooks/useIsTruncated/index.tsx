import { useElementSize } from '@mantine/hooks';
import { useEffect, useState } from 'react';

/**
 * Detects if the element is truncated by comparing its scrollWidth to its clientWidth
 * @returns {ref, isTruncated} - ref to attach to the element and isTruncated boolean
 */
export const useIsTruncated = <T extends HTMLElement = any>() => {
    const { ref, width } = useElementSize<T>();
    const [isTruncated, setIsTruncated] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        setIsTruncated(element.scrollWidth > element.clientWidth);
    }, [ref, width]);

    return {
        ref,
        isTruncated,
    } as const;
};
