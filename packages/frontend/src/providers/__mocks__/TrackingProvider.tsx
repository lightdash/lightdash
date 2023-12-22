import { FC } from 'react';

export const TrackingProvider: FC<React.PropsWithChildren<any>> = ({
    children,
}) => {
    return <>{children}</>;
};

export function useTracking() {
    return jest.fn();
}

export const TrackPage: FC<React.PropsWithChildren<any>> = ({ children }) => {
    return <>{children}</>;
};

export const TrackSection: FC<React.PropsWithChildren<any>> = ({
    children,
}) => {
    return <>{children}</>;
};
