import {
    AiMetricQueryWithFilters,
    AiWebAppPrompt,
    AnyType,
    CacheMetadata,
    CatalogField,
    CatalogTable,
    Explore,
    ItemsMap,
    KnexPaginateArgs,
    SlackPrompt,
    ToolFindFieldsArgs,
    UpdateSlackResponse,
    UpdateWebAppResponse,
} from '@lightdash/common';
import { AiAgentResponseStreamed } from '../../../../analytics/LightdashAnalytics';
import { PostSlackFile } from '../../../../clients/Slack/SlackClient';

export type FindExploresFn = (args: KnexPaginateArgs) => Promise<{
    tables: CatalogTable[];
    fields: CatalogField[];
    pagination:
        | (KnexPaginateArgs & {
              totalPageCount: number;
              totalResults: number;
          })
        | undefined;
}>;

export type FindFieldFn = (
    args: KnexPaginateArgs & {
        table: ToolFindFieldsArgs['table'];
        fieldSearchQuery: ToolFindFieldsArgs['fieldSearchQueries'][number];
    },
) => Promise<{
    fields: CatalogField[];
    pagination:
        | (KnexPaginateArgs & {
              totalPageCount: number;
              totalResults: number;
          })
        | undefined;
}>;

export type GetExploreFn = (args: { exploreName: string }) => Promise<Explore>;

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
