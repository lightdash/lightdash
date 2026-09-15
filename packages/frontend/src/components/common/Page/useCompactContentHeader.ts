import { useMediaQuery } from '@mantine/hooks';

/** Collapse dense chart and dashboard headers only when their controls get tight. */
export const CONTENT_HEADER_COMPACT_MEDIA_QUERY = '(width < 40em)';

export const useCompactContentHeader = () =>
    useMediaQuery(CONTENT_HEADER_COMPACT_MEDIA_QUERY, undefined, {
        getInitialValueInEffect: false,
    });
