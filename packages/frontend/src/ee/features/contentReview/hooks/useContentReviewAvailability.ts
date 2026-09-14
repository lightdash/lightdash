import useApp from '../../../../providers/App/useApp';

export const useContentReviewAvailability = () => {
    const { health } = useApp();
    return {
        isAvailable: health.data?.license?.valid ?? false,
        isLoading: health.isInitialLoading,
    };
};
