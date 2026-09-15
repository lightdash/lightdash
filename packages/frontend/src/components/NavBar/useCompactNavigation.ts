import { useMediaQuery } from '@mantine/hooks';

/** Match the shared phone boundary; wider viewports keep desktop navigation. */
export const NAVBAR_COMPACT_MEDIA_QUERY = '(width < 48em)';

export const useCompactNavigation = () =>
    useMediaQuery(NAVBAR_COMPACT_MEDIA_QUERY, undefined, {
        getInitialValueInEffect: false,
    });
