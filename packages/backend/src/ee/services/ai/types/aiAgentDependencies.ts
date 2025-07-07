import {
    AiMetricQueryWithFilters,
    AiWebAppPrompt,
    AnyType,
    CacheMetadata,
    Explore,
    ItemsMap,
    SlackPrompt,
    UpdateSlackResponse,
    UpdateWebAppResponse,
} from '@lightdash/common';
import { AiAgentResponseStreamed } from '../../../../analytics/LightdashAnalytics';
import { PostSlackFile } from '../../../../clients/Slack/SlackClient';
import { AiAgentExploreSummary } from './aiAgentExploreSummary';

export type GetExploresFn = () => Promise<AiAgentExploreSummary[]>;

export type GetExploreFn = (args: { exploreName: string }) => Promise<Explore>;

export type SearchFieldsFn = (args: {
    exploreName: string;
    embeddingSearchQueries: Array<{
        name: string;
        description: string;
    }>;
}) => Promise<string[]>;

export type UpdateProgressFn = (progress: string) => Promise<void>;

export type GetPromptFn = () => Promise<SlackPrompt | AiWebAppPrompt>;

export type RunMiniMetricQueryFn = (
    metricQuery: AiMetricQueryWithFilters,
    maxLimit: number,
) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type SendFileFn = (args: PostSlackFile) => Promise<void>;

export type UpdatePromptFn = (
    prompt: UpdateWebAppResponse | UpdateSlackResponse,
) => Promise<void>;

export type StoreToolCallFn = (data: {
    promptUuid: string;
    toolCallId: string;
    toolName: string;
    toolArgs: object;
}) => Promise<void>;

export type StoreToolResultsFn = (
    data: Array<{
        promptUuid: string;
        toolCallId: string;
        toolName: string;
        result: string;
    }>,
) => Promise<void>;

export type TrackEventFn = (event: AiAgentResponseStreamed) => void;
