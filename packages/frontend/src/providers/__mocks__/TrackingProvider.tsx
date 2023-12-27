import { FC } from 'react';

export const TrackingProvider: FC<any> = ({ children }) => {
    return <>{children}</>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function useTracking() {
    return jest.fn();
}

export const TrackPage: FC<any> = ({ children }) => {
    return <>{children}</>;
};

export const TrackSection: FC<any> = ({ children }) => {
    return <>{children}</>;
};
