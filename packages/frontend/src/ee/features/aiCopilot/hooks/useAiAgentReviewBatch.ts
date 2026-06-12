import {
    type AiAgentReviewBatchReport,
    type AiAgentReviewBatchRunSummary,
    type AiAgentReviewBatchStarted,
    type ApiAiAgentReviewBatchReportResponse,
    type ApiAiAgentReviewBatchRunResponse,
    type ApiAiAgentReviewBatchRunsResponse,
    type ApiAiAgentReviewBatchStartedResponse,
    type ApiError,
    type CreateAiAgentReviewBatch,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

const REVIEW_BATCH_KEY = 'aiAgentReviewBatch';

function buildQueryString(params: Record<string, string | undefined>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            query.append(key, value);
        }
    }
    const str = query.toString();
    return str ? `?${str}` : '';
}

const startReviewBatch = async (
    body: CreateAiAgentReviewBatch,
): Promise<AiAgentReviewBatchStarted> =>
    lightdashApi<ApiAiAgentReviewBatchStartedResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-runs`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useStartReviewBatch = () => {
    const queryClient = useQueryClient();
    return useMutation<
        AiAgentReviewBatchStarted,
        ApiError,
        CreateAiAgentReviewBatch
    >({
        mutationFn: startReviewBatch,
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: [REVIEW_BATCH_KEY, 'runs'],
            });
        },
    });
};

const getReviewBatchRun = async (
    runUuid: string,
): Promise<AiAgentReviewBatchRunSummary> =>
    lightdashApi<ApiAiAgentReviewBatchRunResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-runs/${encodeURIComponent(runUuid)}`,
        method: 'GET',
        body: undefined,
    });

export const useReviewBatchRun = (
    runUuid: string | undefined,
    opts?: { poll?: boolean },
) => {
    return useQuery<AiAgentReviewBatchRunSummary, ApiError>({
        queryKey: [REVIEW_BATCH_KEY, 'run', runUuid],
        queryFn: () => getReviewBatchRun(runUuid!),
        enabled: !!runUuid,
        refetchInterval: (data) =>
            opts?.poll &&
            (data?.status === 'queued' || data?.status === 'running')
                ? 2500
                : false,
    });
};

const getReviewBatchReport = async (
    runUuid: string,
): Promise<AiAgentReviewBatchReport> =>
    lightdashApi<ApiAiAgentReviewBatchReportResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-runs/${encodeURIComponent(runUuid)}/report`,
        method: 'GET',
        body: undefined,
    });

export const useReviewBatchReport = (
    runUuid: string | undefined,
    opts?: { enabled?: boolean },
) => {
    return useQuery<AiAgentReviewBatchReport, ApiError>({
        queryKey: [REVIEW_BATCH_KEY, 'report', runUuid],
        queryFn: () => getReviewBatchReport(runUuid!),
        enabled: !!runUuid && (opts?.enabled ?? true),
    });
};

const getReviewBatchRuns = async (filters?: {
    projectUuid?: string;
    agentUuid?: string;
}): Promise<AiAgentReviewBatchRunSummary[]> =>
    lightdashApi<ApiAiAgentReviewBatchRunsResponse['results']>({
        version: 'v1',
        url: `/aiAgents/admin/review-runs${buildQueryString({
            projectUuid: filters?.projectUuid,
            agentUuid: filters?.agentUuid,
        })}`,
        method: 'GET',
        body: undefined,
    });

export const useReviewBatchRuns = (filters?: {
    projectUuid?: string;
    agentUuid?: string;
}) => {
    return useQuery<AiAgentReviewBatchRunSummary[], ApiError>({
        queryKey: [REVIEW_BATCH_KEY, 'runs', filters],
        queryFn: () => getReviewBatchRuns(filters),
        keepPreviousData: true,
    });
};
