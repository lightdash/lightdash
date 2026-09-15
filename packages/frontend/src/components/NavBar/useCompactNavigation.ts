import { useMediaQuery } from '@mantine/hooks';

/** The full navigation needs ~830px; keep a little room before collapsing. */
export const NAVBAR_COMPACT_MEDIA_QUERY = '(width < 56em)';

export const useCompactNavigation = () =>
    useMediaQuery(NAVBAR_COMPACT_MEDIA_QUERY, undefined, {
        getInitialValueInEffect: false,
    });
