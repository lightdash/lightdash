import { type FC } from 'react';

export const TrackingProvider: FC<React.PropsWithChildren<{}>> = ({
    children,
}) => <>{children}</>;

export const TrackPage: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);

export const TrackSection: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <>{children}</>
);
