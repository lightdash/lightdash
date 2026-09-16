/**
 * `useAiPrompt()` — ask the org-approved AI a question about results the app
 * already loaded. The host proxies the call and applies its own consent and
 * permission gates; the app never holds a key or sends rows anywhere else.
 */

import { useCallback, useState } from 'react';
import { useHostAppUuid } from './hostContext';
import { useHostAiAvailable } from './insights';
import { useTransport } from './LightdashProvider';
import type {
    AiPromptRequest,
    AiPromptResult,
    QueryResult,
    Row,
} from './types';

export type AiPromptSource = {
    /** A `useLightdash` result (its `data`); null while still loading. */
    result: Pick<QueryResult, 'queryUuid'> | null;
    /** Shown to the model as the section title; defaults to "Query N". */
    label?: string;
};

export type AiPromptOptions = {
    /** The question. Author-written, may interpolate app state. */
    prompt: string;
    /** Results already loaded via `useLightdash`; only these are sent. */
    sources: AiPromptSource[];
    /** Narrow the question to one row of a source. */
    focus?: { row: Row };
};

export type AiPrompt = {
    /** False outside a Lightdash host or on a host without the feature. */
    available: boolean;
    ask: (options: AiPromptOptions) => Promise<AiPromptResult>;
    loading: boolean;
    /** Last answer, until the next `ask` resolves. */
    text: string | null;
    error: Error | null;
};

const rowToFocus = (row: Row): Record<string, string> =>
    Object.fromEntries(
        Object.entries(row).map(([fieldId, value]) => [
            fieldId,
            value === null ? '' : String(value),
        ]),
    );

/** Pure request builder; throws when no source carries a query uuid. */
export const buildAiPromptRequest = (
    appUuid: string,
    options: AiPromptOptions,
): AiPromptRequest => {
    const sources = options.sources.flatMap(({ result, label }) =>
        result?.queryUuid
            ? [{ queryUuid: result.queryUuid, label: label ?? null }]
            : [],
    );
    if (sources.length === 0) {
        throw new Error(
            'useAiPrompt: pass at least one loaded useLightdash result as a source',
        );
    }
    return {
        appUuid,
        prompt: options.prompt,
        sources,
        focus: options.focus ? rowToFocus(options.focus.row) : null,
    };
};

export function useAiPrompt(): AiPrompt {
    const transport = useTransport();
    const appUuid = useHostAppUuid();
    const hostAiAvailable = useHostAiAvailable();
    const [loading, setLoading] = useState(false);
    const [text, setText] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const available =
        appUuid !== null && transport.aiPrompt !== undefined && hostAiAvailable;

    const ask = useCallback(
        async (options: AiPromptOptions): Promise<AiPromptResult> => {
            if (!appUuid || !transport.aiPrompt || !hostAiAvailable) {
                throw new Error(
                    'useAiPrompt: AI is not available for this app; check `available` before calling ask',
                );
            }
            setLoading(true);
            setError(null);
            try {
                const result = await transport.aiPrompt(
                    buildAiPromptRequest(appUuid, options),
                );
                setText(result.text);
                return result;
            } catch (e) {
                const err = e instanceof Error ? e : new Error(String(e));
                setError(err);
                throw err;
            } finally {
                setLoading(false);
            }
        },
        [appUuid, transport, hostAiAvailable],
    );

    return { available, ask, loading, text, error };
}
