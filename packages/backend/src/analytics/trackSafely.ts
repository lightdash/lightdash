import Logger from '../logging/logger';

export const trackSafely = (track: () => void): void => {
    try {
        track();
    } catch (error) {
        Logger.warn('Failed to track analytics event', { error });
    }
};
