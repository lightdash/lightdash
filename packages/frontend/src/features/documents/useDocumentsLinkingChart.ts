import {
    type ApiError,
    type DocumentLinkingChart,
    type DocumentSavedChartKind,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

/** Documents the user can view whose current version links this chart. */
export const useDocumentsLinkingChart = (
    projectUuid: string | undefined,
    kind: DocumentSavedChartKind,
    chartUuid: string,
) =>
    useQuery<DocumentLinkingChart[], ApiError>({
        queryKey: ['documents-linking-chart', projectUuid, kind, chartUuid],
        queryFn: ({ signal }) =>
            lightdashApi<DocumentLinkingChart[]>({
                url: `/projects/${projectUuid}/documents/linking-chart?${new URLSearchParams(
                    {
                        [kind === 'chart' ? 'savedChartUuid' : 'savedSqlUuid']:
                            chartUuid,
                    },
                ).toString()}`,
                method: 'GET',
                body: undefined,
                signal,
            }),
        enabled: projectUuid !== undefined,
        retry: false,
    });
