import { useMediaQuery } from '@mantine/hooks';
import responsiveBreakpoints from '../../styles/responsiveBreakpoints.json';

/** Switch only once the label-free desktop navigation no longer fits. */
export const NAVBAR_COMPACT_MEDIA_QUERY = `(width < ${responsiveBreakpoints['navigation-compact']})`;

export const useCompactNavigation = () =>
    useMediaQuery(NAVBAR_COMPACT_MEDIA_QUERY, undefined, {
        getInitialValueInEffect: false,
    });
