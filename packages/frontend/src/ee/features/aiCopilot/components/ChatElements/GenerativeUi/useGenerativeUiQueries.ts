import {
    assertUnreachable,
    isApiError,
    type GenerativeUiCompiledSpec,
    type GenerativeUiState,
} from '@lightdash/common';
import { useQueries } from '@tanstack/react-query';
import {
    isPresent,
    refsIn,
    resolveRef,
    type GenerativeUiBindingContext,
} from './bindings';
import {
    buildGenerativeUiRequest,
    type GenerativeUiFetcher,
    type GenerativeUiRequest,
} from './requests';

export type GenerativeUiQueryState =
    | { status: 'waiting'; stateKey: string }
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'success'; data: unknown };

type PreparedQuery =
    | { status: 'ready'; id: string; request: GenerativeUiRequest }
    | { status: 'waiting'; id: string; stateKey: string }
    | { status: 'invalid'; id: string; message: string };

const NO_VALUES: ReadonlyMap<string, unknown> = new Map();

const prepareQueries = (
    compiled: GenerativeUiCompiledSpec,
    state: GenerativeUiState,
): PreparedQuery[] => {
    const context: GenerativeUiBindingContext = {
        state,
        queries: NO_VALUES,
        results: NO_VALUES,
        item: null,
    };
    return compiled.queries.map((query): PreparedQuery => {
        const { path, query: search, body } = query.params;
        const refs = [path, search, ...(body === undefined ? [] : [body])]
            .flatMap(refsIn)
            .filter((ref) => !isPresent(resolveRef(ref, context)));
        const [missing] = refs;
        if (missing !== undefined) {
            // The compiler only lets queries reference $state.
            return missing.kind === 'state'
                ? { status: 'waiting', id: query.id, stateKey: missing.key }
                : {
                      status: 'invalid',
                      id: query.id,
                      message: 'Query params may only reference $state',
                  };
        }
        const built = buildGenerativeUiRequest(query, context);
        return built.ok
            ? { status: 'ready', id: query.id, request: built.request }
            : { status: 'invalid', id: query.id, message: built.message };
    });
};

/**
 * Runs the spec's GET queries, each once every $state it reads has a value;
 * a query re-runs when those values change.
 */
export const useGenerativeUiQueries = ({
    toolCallId,
    compiled,
    state,
    fetcher,
}: {
    toolCallId: string;
    compiled: GenerativeUiCompiledSpec;
    state: GenerativeUiState;
    fetcher: GenerativeUiFetcher;
}) => {
    const prepared = prepareQueries(compiled, state);
    const results = useQueries({
        queries: prepared.map((query) => ({
            queryKey: [
                'generativeUi',
                toolCallId,
                query.id,
                query.status === 'ready' ? query.request : null,
            ],
            queryFn: () =>
                query.status === 'ready'
                    ? fetcher(query.request)
                    : Promise.reject(new Error('The query is not ready')),
            enabled: query.status === 'ready',
            staleTime: 5 * 60 * 1000,
        })),
    });

    const queryStates = new Map(
        prepared.map((query, index): [string, GenerativeUiQueryState] => {
            switch (query.status) {
                case 'waiting':
                    return [
                        query.id,
                        { status: 'waiting', stateKey: query.stateKey },
                    ];
                case 'invalid':
                    return [
                        query.id,
                        { status: 'error', message: query.message },
                    ];
                case 'ready': {
                    const result = results[index];
                    if (result.isSuccess) {
                        return [
                            query.id,
                            { status: 'success', data: result.data },
                        ];
                    }
                    if (result.isError) {
                        return [
                            query.id,
                            {
                                status: 'error',
                                message: isApiError(result.error)
                                    ? result.error.error.message
                                    : 'Could not load this data',
                            },
                        ];
                    }
                    return [query.id, { status: 'loading' }];
                }
                default:
                    return assertUnreachable(
                        query,
                        'Unknown generative UI query status',
                    );
            }
        }),
    );

    const loaded = new Map(
        Array.from(queryStates).flatMap(
            ([id, queryState]): [string, unknown][] =>
                queryState.status === 'success' ? [[id, queryState.data]] : [],
        ),
    );

    return { queryStates, loaded };
};
