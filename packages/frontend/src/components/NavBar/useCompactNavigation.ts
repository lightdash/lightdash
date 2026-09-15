import { useMediaQuery } from '@mantine/hooks';

/** Switch only once the label-free desktop navigation no longer fits. */
export const NAVBAR_COMPACT_MEDIA_QUERY = '(width < 32em)';

export const useCompactNavigation = () =>
    useMediaQuery(NAVBAR_COMPACT_MEDIA_QUERY, undefined, {
        getInitialValueInEffect: false,
    });
