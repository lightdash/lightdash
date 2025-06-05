import {
    AiMetricQuery,
    AiWebAppPrompt,
    AnyType,
    CacheMetadata,
    Explore,
    ItemsMap,
    SlackPrompt,
    UpdateSlackResponse,
} from '@lightdash/common';
import { PostSlackFile } from '../../../../clients/Slack/SlackClient';

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

export type RunMiniMetricQueryFn = (metricQuery: AiMetricQuery) => Promise<{
    rows: Record<string, AnyType>[];
    cacheMetadata: CacheMetadata;
    fields: ItemsMap;
}>;

export type SendFileFn = (args: PostSlackFile) => Promise<void>;

export type UpdatePromptFn = (prompt: UpdateSlackResponse) => Promise<void>;
