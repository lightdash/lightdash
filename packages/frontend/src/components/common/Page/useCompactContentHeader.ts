import { useMediaQuery } from '@mantine/hooks';
import responsiveBreakpoints from '../../../styles/responsiveBreakpoints.json';

/** Collapse dense chart and dashboard headers only when their controls get tight. */
export const CONTENT_HEADER_COMPACT_MEDIA_QUERY = `(width < ${responsiveBreakpoints['content-header-compact']})`;

export const useCompactContentHeader = () =>
    useMediaQuery(CONTENT_HEADER_COMPACT_MEDIA_QUERY, undefined, {
        getInitialValueInEffect: false,
    });
