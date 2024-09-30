import { type FC } from 'react';
import { vi } from 'vitest';

export const TrackingProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => <>{children}</>;

export function useTracking() {
    return vi.fn();
}

export const TrackPage: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);

export const TrackSection: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);
