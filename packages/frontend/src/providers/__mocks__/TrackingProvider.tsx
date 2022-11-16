import { FC } from 'react';

export const TrackingProvider: FC<any> = ({ children }) => {
    return <>{children}</>;
};

export function useTracking() {
    return jest.fn();
}

export const TrackPage: FC<any> = ({ children }) => {
    return <>{children}</>;
};

export const TrackSection: FC<any> = ({ children }) => {
    return <>{children}</>;
};
