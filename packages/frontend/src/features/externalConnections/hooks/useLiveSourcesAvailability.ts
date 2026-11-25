import useApp from '../../../providers/App/useApp';

/** Live data sources ship with the Enterprise licence. */
export const useLiveSourcesAvailability = () => {
    const { health } = useApp();
    return {
        isAvailable: health.data?.license?.valid === true,
        isLoading: health.isInitialLoading,
    };
};
