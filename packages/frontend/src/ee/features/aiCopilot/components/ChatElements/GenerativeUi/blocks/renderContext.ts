import { assertUnreachable, type GenerativeUiState } from '@lightdash/common';
import { type ReactNode } from 'react';
import { type GenerativeUiStateValue } from '../fields';
import { type GenerativeUiQueryState } from '../useGenerativeUiQueries';

/** Everything a block needs to render and to update the card's state. */
export type GenerativeUiRenderContext = {
    state: GenerativeUiState;
    errors: Readonly<Record<string, ReactNode>>;
    locked: boolean;
    queryStates: ReadonlyMap<string, GenerativeUiQueryState>;
    loadedQueries: ReadonlyMap<string, unknown>;
    labels: ReadonlyMap<string, string>;
    setValue: (key: string, value: GenerativeUiStateValue) => void;
};

export type GenerativeUiQueryNotice = {
    kind: 'waiting' | 'loading' | 'error';
    message: string;
};

/** Why a block bound to a query has no data yet; null once the data is there. */
export const queryNoticeOf = (
    queryId: string,
    context: GenerativeUiRenderContext,
): GenerativeUiQueryNotice | null => {
    const queryState = context.queryStates.get(queryId);
    if (queryState === undefined) {
        return { kind: 'error', message: `Unknown query "${queryId}"` };
    }
    switch (queryState.status) {
        case 'success':
            return null;
        case 'waiting':
            return {
                kind: 'waiting',
                message: `Choose ${context.labels.get(queryState.stateKey) ?? queryState.stateKey} first`,
            };
        case 'loading':
            return { kind: 'loading', message: 'Loading…' };
        case 'error':
            return { kind: 'error', message: queryState.message };
        default:
            return assertUnreachable(
                queryState,
                'Unknown generative UI query state',
            );
    }
};
