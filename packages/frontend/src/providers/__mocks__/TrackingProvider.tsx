import { FC } from 'react';

export const TrackingProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => <>{children}</>;

export function useTracking() {
    return jest.fn();
}

export const TrackPage: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);

export const TrackSection: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);
