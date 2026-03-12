import {
    hasDateZoomCapabilities,
    type ApiError,
    type DateZoomCapabilities,
    type SavedChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const getDateZoomCapabilities = async (
    chartUuid: string,
): Promise<DateZoomCapabilities | undefined> => {
    const result = await lightdashApi<SavedChart>({
        url: `/saved/${chartUuid}?includeDateZoomCapabilities=true`,
        method: 'GET',
        body: undefined,
    });
    return hasDateZoomCapabilities(result)
        ? result.dateZoomCapabilities
        : undefined;
};

export const useDateZoomCapabilities = (chartUuid: string | undefined) =>
    useQuery<DateZoomCapabilities | undefined, ApiError>({
        queryKey: ['date_zoom_capabilities', chartUuid],
        queryFn: () => getDateZoomCapabilities(chartUuid!),
        enabled: chartUuid !== undefined,
        retry: false,
    });
