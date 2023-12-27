import { FC, useEffect } from 'react';
import { NestedTrackingProvider } from '.';
import { PageData } from './types';
import { useTracking } from './useTracking';

export const TrackPage: FC<PageData> = ({ children, ...rest }) => {
    const { page } = useTracking();

    useEffect(() => {
        page(rest);
    }, [page, rest]);

    return (
        <NestedTrackingProvider page={rest}>
            {children || null}
        </NestedTrackingProvider>
    );
};
