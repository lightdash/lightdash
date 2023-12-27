import { FC, memo, useMemo } from 'react';
import { NestedTrackingProvider } from '.';
import { SectionData } from './types';

export const TrackSection: FC<SectionData> = memo(({ children, name }) => {
    const section = useMemo(() => ({ name }), [name]);
    return (
        <NestedTrackingProvider section={section}>
            {children || null}
        </NestedTrackingProvider>
    );
});
