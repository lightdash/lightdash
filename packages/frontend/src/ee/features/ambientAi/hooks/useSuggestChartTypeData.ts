import {
    type ApiError,
    type SuggestChartTypeDataRequest,
    type SuggestedChartTypeData,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

export type SuggestChartTypeDataVariables = {
    projectUuid: string;
    body: SuggestChartTypeDataRequest;
};

const suggestChartTypeDataApi = ({
    projectUuid,
    body,
}: SuggestChartTypeDataVariables) =>
    lightdashApi({
        url: `/ai/${projectUuid}/chart-type/suggest-data`,
        method: 'POST',
        body: JSON.stringify(body),
        // The endpoint's results are not part of the shared `ApiResults`
        // union, so the response is named here.
    }) as unknown as Promise<SuggestedChartTypeData>;

/**
 * Ask ambient AI which explore and fields a chart type should be built on.
 * Metadata only: the suggestion is read from field definitions, so asking for
 * one never reaches the warehouse.
 */
export const useSuggestChartTypeData = () =>
    useMutation<
        SuggestedChartTypeData,
        ApiError,
        SuggestChartTypeDataVariables
    >({ mutationFn: suggestChartTypeDataApi });
