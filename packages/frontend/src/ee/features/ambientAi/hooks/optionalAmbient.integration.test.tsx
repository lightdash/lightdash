import {
    FeatureFlags,
    CommercialFeatureFlags,
    AiAccessRefusalReason,
    AiAccessRefusalAction,
    ForbiddenError,
    type ApiError,
    type HealthState,
    type ApiResponse,
    type AiAccessForUser,
} from '@lightdash/common';
import {
    QueryClient,
    QueryClientProvider,
    type UseQueryResult,
} from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import nock from 'nock';
import { strict as assert } from 'node:assert';
import { type ClientRequest } from 'node:http';
import { Suspense, startTransition, useLayoutEffect, useMemo } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
    createLightdashApi,
    type LightdashApi,
    type LightdashApiProps,
} from '../../../../api';
import { useAiAccessGate } from '../../../../features/aiAccess/useAiAccessGate';
import { useOptionalAiAccessGate } from '../../../../features/aiAccess/useOptionalAiAccessGate';
import { useAmbientFieldSuggestions } from '../../../../features/chartTypes/builder/useAmbientFieldSuggestions';
import { explore as metadataExplore } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig.mock';
import { type UserWithAbility } from '../../../../hooks/user/useUser';
import { refetchFeatureFlags } from '../../../../hooks/useServerOrClientFeatureFlag';
import AppProviderContext from '../../../../providers/App/context';
import { LightdashApiContext } from '../../../../providers/LightdashApi/LightdashApiContext';
import { mockSavedChartResponse } from '../../../../testing/savedChartResponse.mock';
import EmbedProviderContext from '../../../providers/Embed/context';
import EmbedProvider from '../../../providers/Embed/EmbedProvider';
import { useAmbientAiEnabled } from './useAmbientAiEnabled';
import { useGenerateChartMetadata } from './useGenerateChartMetadata';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastApiError: toast,
        showToastError: toast,
        addToastError: toast,
    }),
}));
const health = {
    isAuthenticated: true,
    ai: { isAmbientAiEnabled: true },
} as HealthState;
const query = <T,>(data: T) =>
    ({
        data,
        isSuccess: true,
        isError: false,
        isLoading: false,
        isFetching: false,
    }) as UseQueryResult<T, ApiError>;
const client = () =>
    new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
        logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
const seen: string[] = [];
const observed: Record<
    string,
    {
        ready: boolean;
        organization: string | null;
        project: string;
        connection: string | null;
        api: string;
    }
> = {};
const metadata: Record<
    string,
    ReturnType<typeof useGenerateChartMetadata>
> = {};
const required: Record<string, ReturnType<typeof useAiAccessGate>> = {};
const gates: Record<string, ReturnType<typeof useOptionalAiAccessGate>> = {};
const enabled: Record<string, boolean | undefined> = {};
function server(
    actor: string,
    identityOn = true,
    identityStatus = 200,
    copilot = false,
) {
    for (const [flag, value] of [
        [FeatureFlags.AgentIdentity, identityOn],
        [CommercialFeatureFlags.AiCopilot, copilot],
    ] as const) {
        nock('http://test.lightdash')
            .persist()
            .get(`/api/v2/feature-flag/${flag}`)
            .matchHeader('x-fixture-actor', actor)
            .reply(() => {
                seen.push(`${actor}:flag:${flag}`);
                return [200, { status: 'ok', results: { enabled: value } }];
            });
    }
    nock('http://test.lightdash')
        .persist()
        .get('/api/v2/projects/project/ai-access/me')
        .matchHeader('x-fixture-actor', actor)
        .reply(() => {
            seen.push(`${actor}:identity`);
            return identityStatus === 200
                ? [
                      200,
                      {
                          status: 'ok',
                          results: { enabled: true, refusal: null },
                      },
                  ]
                : [403, { status: 'error', error: new ForbiddenError() }];
        });
}
function sdkServer() {
    nock('http://test.lightdash')
        .persist()
        .get('/api/v1/user/account')
        .query(true)
        .reply(() => {
            seen.push('sdk:account');
            return [
                200,
                {
                    status: 'ok',
                    results: {
                        authentication: { type: 'jwt' },
                        organization: { organizationUuid: 'sdk-organization' },
                        user: { type: 'external', abilityRules: [] },
                    },
                },
            ];
        });
    for (const flag of [
        FeatureFlags.AgentIdentity,
        CommercialFeatureFlags.AiCopilot,
    ]) {
        nock('http://test.lightdash')
            .persist()
            .get(`/api/v2/feature-flag/${flag}`)
            .query(true)
            .reply(() => {
                seen.push(`sdk:flag:${flag}`);
                return [200, { status: 'ok', results: { enabled: true } }];
            });
    }
    nock('http://test.lightdash')
        .persist()
        .get('/api/v2/projects/project/ai-access/me')
        .query(true)
        .reply(() => {
            seen.push('sdk:identity');
            return [403, { status: 'error', error: new ForbiddenError() }];
        });
}
function Probe({
    actor,
    callerEnabled = true,
}: {
    actor: string;
    callerEnabled?: boolean;
}) {
    enabled[actor] = useAmbientAiEnabled('project', { enabled: callerEnabled });
    return null;
}
const chart = mockSavedChartResponse();
function MetadataProbe({ actor }: ScopeProps) {
    metadata[actor] = useGenerateChartMetadata({
        projectUuid: 'project',
        unsavedChartVersion: chart,
        explore: metadataExplore,
    });
    return null;
}
function RequiredProbe({ actor }: ScopeProps) {
    required[actor] = useAiAccessGate('project');
    return null;
}
function FieldProbe({ actor, callerEnabled = true }: ScopeProps) {
    const suggestions = useAmbientFieldSuggestions({
        projectUuid: 'project',
        enabled: callerEnabled,
        sourceKey: 'source',
        explore: {
            name: 'orders',
            label: 'Orders',
            joinedTableLabels: [],
            fields: [],
            itemsMap: {},
        },
        fields: [{ name: 'x', label: 'X', type: 'dimension', required: true }],
        context: { prompt: 'trend', clarifications: [] },
        suggestedExploreName: null,
    });
    enabled[actor] = suggestions.pendingFieldNames.size === 0;
    return null;
}
function AccessProbe({
    actor,
    callerEnabled = true,
    ambientAvailable = true,
    project = 'project',
    connection = null,
}: ScopeProps) {
    gates[actor] = useOptionalAiAccessGate(project, {
        enabled: callerEnabled,
        ambientAvailable,
        connection,
    });
    enabled[actor] = !gates[actor].disabled;
    return null;
}
type ScopeProps = {
    actor: string;
    callerEnabled?: boolean;
    embedded?: boolean;
    pending?: boolean;
    access?: boolean;
    ambientAvailable?: boolean;
    project?: string;
    connection?: string | null;
    organization?: string;
    realEmbed?: boolean;
    fieldConsumer?: boolean;
    metadataConsumer?: boolean;
    requiredConsumer?: boolean;
    transportEpoch?: string;
    authenticated?: boolean;
    healthPending?: boolean;
    token?: string;
};
function Scope({
    actor,
    callerEnabled = true,
    embedded = false,
    pending = false,
    access = false,
    realEmbed = false,
    fieldConsumer = false,
    metadataConsumer = false,
    requiredConsumer = false,
    token,
    ...props
}: ScopeProps) {
    const transportEpoch = props.transportEpoch;
    const api = useMemo<LightdashApi>(() => {
        const base = createLightdashApi(() => undefined);
        return Object.assign(
            <T extends ApiResponse['results']>(props: LightdashApiProps) =>
                base<T>({
                    ...props,
                    headers: {
                        ...props.headers,
                        'x-fixture-actor': actor,
                        'x-fixture-transport': transportEpoch ?? 'initial',
                    },
                }),
            {
                response: base.response,
                stream: base.stream,
                getResultsFromStream: base.getResultsFromStream,
            },
        );
    }, [actor, transportEpoch]);
    const user = {
        userUuid: actor,
        organizationUuid: props.organization ?? `org-${actor}`,
    } as UserWithAbility;
    const app = {
        health: props.healthPending
            ? ({
                  ...query(health),
                  data: undefined,
                  isSuccess: false,
                  isLoading: true,
              } as UseQueryResult<HealthState, ApiError>)
            : query({
                  ...health,
                  isAuthenticated: props.authenticated ?? true,
              }),
        user: pending
            ? ({
                  ...query(user),
                  data: undefined,
                  isSuccess: false,
                  isLoading: true,
              } as UseQueryResult<UserWithAbility, ApiError>)
            : query(user),
    };
    const probe = metadataConsumer ? (
        <MetadataProbe actor={actor} />
    ) : requiredConsumer ? (
        <RequiredProbe actor={actor} />
    ) : fieldConsumer ? (
        <FieldProbe actor={actor} callerEnabled={callerEnabled} />
    ) : access ? (
        <AccessProbe actor={actor} callerEnabled={callerEnabled} {...props} />
    ) : (
        <Probe actor={actor} callerEnabled={callerEnabled} />
    );
    useLayoutEffect(() => {
        observed[actor] = {
            ready: enabled[actor] === true,
            organization: user.organizationUuid ?? null,
            project: props.project ?? 'project',
            connection: props.connection ?? null,
            api: transportEpoch ?? 'initial',
        };
    });
    const content = realEmbed ? (
        <EmbedProvider projectUuid="project" embedToken={token}>
            {probe}
        </EmbedProvider>
    ) : (
        probe
    );
    return (
        <LightdashApiContext.Provider value={api}>
            <AppProviderContext.Provider value={app}>
                {embedded ? (
                    <EmbedProviderContext.Provider
                        value={{
                            t: () => undefined,
                            mode: 'sdk',
                            projectUuid: 'project',
                            embedToken: undefined,
                            backDestination: 'chart',
                            dispatchEmbedEvent: () => false,
                            isEmbedEventReady: false,
                            theme: 'light',
                            backgroundColor: null,
                            timezone: null,
                            aiAgentThreadSetup: null,
                            aiAgentNavigationDisabled: false,
                        }}
                    >
                        {content}
                    </EmbedProviderContext.Provider>
                ) : (
                    content
                )}
            </AppProviderContext.Provider>
        </LightdashApiContext.Provider>
    );
}
const tree = (queryClient: QueryClient, props: Parameters<typeof Scope>[0]) => (
    <QueryClientProvider client={queryClient}>
        <MemoryRouter>
            <Scope {...props} />
        </MemoryRouter>
    </QueryClientProvider>
);
const unmatched: string[] = [];
const recordUnmatched = (request: ClientRequest) => {
    unmatched.push(`${request.method} ${request.path.split('?')[0]}`);
};
beforeEach(() => {
    vi.mocked(console.error).mockClear();
    unmatched.length = 0;
    nock.emitter.on('no match', recordUnmatched);
});
afterEach(() => {
    cleanup();
    nock.emitter.removeListener('no match', recordUnmatched);
    assert.deepEqual(unmatched, []);
    assert.equal(
        vi.mocked(console.error).mock.calls.length,
        0,
        'Unexpected console.error',
    );
    nock.cleanAll();
    toast.mockClear();
    seen.length = 0;
    Object.keys(observed).forEach((key) => delete observed[key]);
    Object.keys(enabled).forEach((key) => delete enabled[key]);
    Object.keys(gates).forEach((key) => delete gates[key]);
    Object.keys(metadata).forEach((key) => delete metadata[key]);
    Object.keys(required).forEach((key) => delete required[key]);
});
it.each([
    { name: 'SDK bootstrap with retained registered context', embedded: true },
    { name: 'disabled consumer', callerEnabled: false },
    { name: 'unresolved registered context', pending: true },
])('issues no optional identity request for $name', async (props) => {
    const queryClient = client();
    queryClient.setQueryData(['health'], health);
    server('A', true, 403);
    const view = render(tree(queryClient, { actor: 'A', ...props }));
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(seen.filter((entry) => entry.endsWith(':identity'))).toEqual([]);
    expect(toast).not.toHaveBeenCalled();
    expect(enabled.A).toBe(false);
    view.unmount();
    queryClient.clear();
});
it('revalidates an identity-off decision before a new registered context can act', async () => {
    const queryClient = client();
    queryClient.setQueryData(['health'], health);
    server('A', false);
    server('B', true, 403);
    const view = render(tree(queryClient, { actor: 'A' }));
    await waitFor(() => expect(enabled.A).toBe(true));
    act(() => view.rerender(tree(queryClient, { actor: 'B' })));
    expect(enabled.B).toBe(false);
    await waitFor(() => expect(seen).toContain('B:identity'));
    expect(enabled.B).toBe(false);
    expect(seen).toContain(`B:flag:${FeatureFlags.AgentIdentity}`);
    view.unmount();
    queryClient.clear();
});

const pause = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
    });
const allowed: AiAccessForUser = {
    enabled: true,
    refusal: null,
    requirementSource: null,
    identity: null,
    source: null,
    marker: null,
    projectUuid: 'project',
    warehouseConnectionUuid: null,
    principalKind: null,
    expiresAt: null,
    principalName: null,
};
const refused: AiAccessForUser = {
    ...allowed,
    refusal: {
        code: 'ai_access_refused',
        reason: AiAccessRefusalReason.NEEDS_SIGN_IN,
        action: AiAccessRefusalAction.SIGN_IN,
        message: 'Connect',
        settingsUrl: null,
        connectUrl: null,
    },
};
function holdIdentity(actor: string, status = 200, result = allowed) {
    let deliver: (error: null, response: [number, object]) => void;
    let started = false;
    let requestAborted = false;
    nock('http://test.lightdash')
        .get('/api/v2/projects/project/ai-access/me')
        .matchHeader('x-fixture-actor', actor)
        .reply((_uri, _body, callback) => {
            started = true;
            seen.push(`${actor}:held-identity`);
            deliver = callback;
        })
        .on('request', (request: ClientRequest) => {
            request.on('abort', () => {
                requestAborted = true;
            });
        });
    return {
        started: () => started,
        aborted: () => requestAborted,
        release: () =>
            deliver(null, [
                status,
                status === 200
                    ? { status: 'ok', results: result }
                    : { status: 'error', error: new ForbiddenError() },
            ]),
    };
}
it.each([true, false])(
    'allows a registered app consumer with identity flag %s',
    async (identityOn) => {
        const queryClient = client();
        queryClient.setQueryData(['health'], health);
        server('A', identityOn);
        const view = render(tree(queryClient, { actor: 'A' }));
        await waitFor(() => expect(enabled.A).toBe(true));
        expect(seen.filter((entry) => entry.endsWith(':identity'))).toEqual(
            identityOn ? ['A:identity'] : [],
        );
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);
it.each([{ callerEnabled: false }, { pending: true }, { embedded: true }])(
    'manual and retained refetch cannot bypass current eligibility %j',
    async (replacement) => {
        const queryClient = client();
        server('A');
        const initial = { actor: 'A', access: true };
        const view = render(tree(queryClient, initial));
        await waitFor(() => expect(enabled.A).toBe(true));
        const retained = gates.A.refetch;
        view.rerender(tree(queryClient, { ...initial, ...replacement }));
        const count = seen.length;
        expect(await retained()).toEqual({ status: 'not-applicable' });
        expect(await gates.A.refetch()).toEqual({ status: 'not-applicable' });
        await act(async () => {
            await queryClient.refetchQueries({ type: 'active' });
        });
        await pause();
        expect(seen).toHaveLength(count);
        expect(enabled.A).toBe(false);
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);
it('flag-off and unresolved flag manual refetch issue no identity request', async () => {
    const queryClient = client();
    let release: (error: null, response: [number, object]) => void;
    nock('http://test.lightdash')
        .get(`/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`)
        .reply((_uri, _body, callback) => {
            release = callback;
            seen.push('flag-started');
        });
    const view = render(tree(queryClient, { actor: 'A', access: true }));
    await waitFor(() => expect(seen).toContain('flag-started'));
    expect(await gates.A.refetch()).toEqual({ status: 'not-applicable' });
    expect(enabled.A).toBe(false);
    await act(async () =>
        release(null, [200, { status: 'ok', results: { enabled: false } }]),
    );
    await waitFor(() => expect(enabled.A).toBe(true));
    expect(await gates.A.refetch()).toEqual({ status: 'not-applicable' });
    expect(seen).toEqual(['flag-started']);
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});
it.each([
    { status: 200, result: allowed },
    { status: 200, result: refused },
    { status: 403, result: allowed },
])(
    'retires a started non-aborted $status outcome after context replacement and B completion',
    async ({ status, result }) => {
        const queryClient = client();
        const held = holdIdentity('A', status, result);
        server('A');
        server('B');
        const view = render(tree(queryClient, { actor: 'A', access: true }));
        await waitFor(() => expect(held.started()).toBe(true));
        const retry = gates.A.refetch;
        view.rerender(tree(queryClient, { actor: 'B', access: true }));
        expect(enabled.B).toBe(false);
        await waitFor(() => expect(enabled.B).toBe(true));
        const count = seen.length;
        await act(async () => held.release());
        await pause();
        expect(enabled.B).toBe(true);
        expect(toast).not.toHaveBeenCalled();
        expect(seen).toHaveLength(count);
        expect(await retry()).toEqual({ status: 'not-applicable' });
        view.unmount();
        queryClient.clear();
    },
);
it.each([{ callerEnabled: false }, { ambientAvailable: false }])(
    'withdraws a pending identity before late error %j',
    async (replacement) => {
        const queryClient = client();
        const held = holdIdentity('A', 403);
        server('A');
        const view = render(tree(queryClient, { actor: 'A', access: true }));
        await waitFor(() => expect(held.started()).toBe(true));
        view.rerender(
            tree(queryClient, { actor: 'A', access: true, ...replacement }),
        );
        await act(async () => held.release());
        await pause();
        expect(enabled.A).toBe(false);
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);
it('A to B to A starts a fresh decision while an independent same-project peer stays usable', async () => {
    const queryClient = client();
    server('A');
    server('B');
    server('peer');
    const children = (actor: string) => (
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Scope actor={actor} access />
                <Scope actor="peer" access />
            </MemoryRouter>
        </QueryClientProvider>
    );
    const view = render(children('A'));
    await waitFor(() =>
        expect([enabled.A, enabled.peer]).toEqual([true, true]),
    );
    const old = gates.A.refetch;
    view.rerender(children('B'));
    expect(enabled.B).toBe(false);
    expect(enabled.peer).toBe(true);
    await waitFor(() => expect(enabled.B).toBe(true));
    view.rerender(children('A'));
    expect(enabled.A).toBe(false);
    await waitFor(() => expect(enabled.A).toBe(true));
    expect(await old()).toEqual({ status: 'not-applicable' });
    expect(seen.filter((entry) => entry === 'A:identity')).toHaveLength(2);
    expect(seen.filter((entry) => entry === 'peer:identity')).toHaveLength(1);
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});
it('current eligible failures show the error and manual retry recovers', async () => {
    const queryClient = client();
    const held = holdIdentity('A', 403);
    server('A');
    const view = render(tree(queryClient, { actor: 'A', access: true }));
    await waitFor(() => expect(held.started()).toBe(true));
    await act(async () => held.release());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(enabled.A).toBe(false);
    await act(async () => {
        await gates.A.refetch();
    });
    await waitFor(() => expect(enabled.A).toBe(true));
    expect(seen.filter((entry) => entry.endsWith(':identity'))).toEqual([
        'A:identity',
    ]);
    view.unmount();
    queryClient.clear();
});
it.each([
    undefined,
    '',
    'synthetic-header.synthetic-payload.synthetic-signature',
])(
    'real EmbedProvider never discovers optional identity with token input %j and retained registered context',
    async (token) => {
        const queryClient = client();
        queryClient.setQueryData(['health'], health);
        queryClient.setQueryData(['account'], { user: { abilityRules: [] } });
        server('A', true, 403);
        sdkServer();
        const view = render(
            tree(queryClient, { actor: 'A', realEmbed: true, token }),
        );
        await pause();
        expect(seen.filter((entry) => entry.endsWith(':identity'))).toEqual([]);
        expect(toast).not.toHaveBeenCalled();
        expect(enabled.A).toBe(false);
        view.unmount();
        queryClient.clear();
    },
);

it.each([
    { callerEnabled: false, available: true, embedded: false },
    { callerEnabled: true, available: false, embedded: false },
    { callerEnabled: true, available: true, embedded: false },
    { callerEnabled: true, available: true, embedded: true },
])(
    'actual field-suggestion consumer gates identity and generation %j',
    async ({ callerEnabled, available, embedded }) => {
        const queryClient = client();
        queryClient.setQueryData(['health'], {
            ...health,
            ai: { isAmbientAiEnabled: available },
        });
        server('A');
        if (embedded) sdkServer();
        const suggestion = nock('http://test.lightdash')
            .post('/api/v1/ai/project/chart-type/suggest-fields')
            .query(true)
            .reply(() => {
                seen.push('suggest-fields');
                return [200, { status: 'ok', results: { suggestions: [] } }];
            });
        const view = render(
            tree(queryClient, {
                actor: 'A',
                fieldConsumer: true,
                callerEnabled,
                realEmbed: embedded,
                token: embedded
                    ? 'synthetic-header.synthetic-payload.synthetic-signature'
                    : undefined,
            }),
        );
        if (available && callerEnabled && !embedded) {
            await waitFor(() => expect(suggestion.isDone()).toBe(true));
            expect(seen).toContain('A:identity');
        } else {
            await pause();
            expect(seen.filter((entry) => entry.endsWith(':identity'))).toEqual(
                [],
            );
            expect(suggestion.isDone()).toBe(false);
        }
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);
it.each([
    { ambient: false, copilot: false, expected: false },
    { ambient: false, copilot: true, expected: true },
    { ambient: true, copilot: false, expected: true },
])(
    'supports ambient/copylot availability %j',
    async ({ ambient, copilot, expected }) => {
        const queryClient = client();
        queryClient.setQueryData(['health'], {
            ...health,
            ai: { isAmbientAiEnabled: ambient },
        });
        server('A', true, 200, copilot);
        const view = render(tree(queryClient, { actor: 'A' }));
        if (expected) await waitFor(() => expect(enabled.A).toBe(true));
        else
            await waitFor(() =>
                expect(seen).toContain(
                    `A:flag:${CommercialFeatureFlags.AiCopilot}`,
                ),
            );
        expect(enabled.A).toBe(expected);
        expect(seen.filter((entry) => entry.endsWith(':identity'))).toEqual(
            expected ? ['A:identity'] : [],
        );
        view.unmount();
        queryClient.clear();
    },
);
it('committed flag withdrawal retires held identity and retained retry', async () => {
    const queryClient = client();
    let flagOn = true;
    nock('http://test.lightdash')
        .persist()
        .get(`/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`)
        .reply(() => [200, { status: 'ok', results: { enabled: flagOn } }]);
    const held = holdIdentity('A', 403);
    const view = render(tree(queryClient, { actor: 'A', access: true }));
    await waitFor(() => expect(held.started()).toBe(true));
    const retry = gates.A.refetch;
    flagOn = false;
    await act(async () => {
        await queryClient.invalidateQueries({
            predicate: (query) => query.queryKey.includes('identity-flag'),
        });
    });
    await waitFor(() => expect(enabled.A).toBe(true));
    await act(async () => held.release());
    await pause();
    expect(toast).not.toHaveBeenCalled();
    expect(await retry()).toEqual({ status: 'not-applicable' });
    expect(await gates.A.refetch()).toEqual({ status: 'not-applicable' });
    view.unmount();
    queryClient.clear();
});
it('held flag error never admits an identity-dependent action', async () => {
    const queryClient = client();
    nock('http://test.lightdash')
        .get(`/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`)
        .reply(500, {
            status: 'error',
            error: {
                statusCode: 500,
                name: 'Error',
                message: 'flag unavailable',
            },
        });
    const view = render(tree(queryClient, { actor: 'A', access: true }));
    await pause();
    expect(enabled.A).toBe(false);
    expect(await gates.A.refetch()).toEqual({ status: 'not-applicable' });
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});
it('an abandoned replacement render neither dispatches nor revokes the committed consumer', async () => {
    const queryClient = client();
    server('A');
    server('B');
    server('peer');
    const never = new Promise<void>(() => {});
    function Suspend({ hold }: { hold: boolean }) {
        if (hold) throw never;
        return null;
    }
    const content = (actor: string, hold: boolean) => (
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Suspense fallback={null}>
                    <Scope actor={actor} access />
                    <Suspend hold={hold} />
                </Suspense>
                <Scope actor="peer" access />
            </MemoryRouter>
        </QueryClientProvider>
    );
    const view = render(content('A', false));
    await waitFor(() =>
        expect([enabled.A, enabled.peer]).toEqual([true, true]),
    );
    const retry = gates.A.refetch;
    act(() => startTransition(() => view.rerender(content('B', true))));
    await act(async () => {
        await retry();
    });
    expect(seen.filter((entry) => entry.startsWith('B:'))).toEqual([]);
    expect(seen.filter((entry) => entry === 'A:identity')).toHaveLength(2);
    expect(enabled.peer).toBe(true);
    view.rerender(content('A', false));
    await waitFor(() => expect(enabled.A).toBe(true));
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});
it.each([
    { organization: 'other-org' },
    { project: 'other-project' },
    { connection: 'warehouse-2' },
])(
    'withholds settled cached decisions across resource scope changes %j',
    async (replacement) => {
        const queryClient = client();
        server('A');
        const view = render(tree(queryClient, { actor: 'A', access: true }));
        await waitFor(() => expect(enabled.A).toBe(true));
        const old = gates.A.refetch;
        nock('http://test.lightdash')
            .get('/api/v2/projects/other-project/ai-access/me')
            .reply(200, { status: 'ok', results: allowed });
        nock('http://test.lightdash')
            .get('/api/v2/projects/project/ai-access/me')
            .query({ connection: 'warehouse-2' })
            .reply(200, { status: 'ok', results: allowed });
        view.rerender(
            tree(queryClient, { actor: 'A', access: true, ...replacement }),
        );
        expect(enabled.A).toBe(false);
        expect(await old()).toEqual({ status: 'not-applicable' });
        await waitFor(() => expect(enabled.A).toBe(true));
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);

it.each([
    { embedded: true, available: true },
    { embedded: false, available: false },
])(
    'actual metadata consumer skips optional identity and generation %j',
    async ({ embedded, available }) => {
        const queryClient = client();
        queryClient.setQueryData(['health'], {
            ...health,
            ai: { isAmbientAiEnabled: available },
        });
        server('A', true, 403);
        if (embedded) sdkServer();
        const view = render(
            tree(queryClient, {
                actor: 'A',
                metadataConsumer: true,
                realEmbed: embedded,
                token: embedded
                    ? 'synthetic-header.synthetic-payload.synthetic-signature'
                    : undefined,
            }),
        );
        await pause();
        act(() => metadata.A.trigger());
        await pause();
        expect(seen.filter((entry) => entry.endsWith(':identity'))).toEqual([]);
        expect(metadata.A.generatedMetadata).toBe(null);
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);
it('actual eligible metadata preserves request payload and deduplication', async () => {
    const queryClient = client();
    queryClient.setQueryData(['health'], health);
    server('A');
    const response = nock('http://test.lightdash')
        .post(
            '/api/v1/ai/project/chart/generate-metadata',
            (body) =>
                body.tableName === chart.tableName &&
                body.chartType === chart.chartConfig.type &&
                JSON.stringify(body.dimensions) ===
                    JSON.stringify(chart.metricQuery.dimensions) &&
                Array.isArray(body.fieldsContext),
        )
        .reply(200, {
            status: 'ok',
            results: { title: 'Generated', description: 'Description' },
        });
    const view = render(
        tree(queryClient, { actor: 'A', metadataConsumer: true }),
    );
    await waitFor(() => expect(seen).toContain('A:identity'));
    await pause();
    act(() => metadata.A.trigger());
    await waitFor(() =>
        expect(metadata.A.generatedMetadata?.name).toBe('Generated'),
    );
    act(() => metadata.A.trigger());
    expect(response.isDone()).toBe(true);
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});
it('required access in an embed keeps genuine errors and retry actionable', async () => {
    const queryClient = client();
    queryClient.setQueryData(['health'], health);
    const held = holdIdentity('A', 403);
    server('A');
    const view = render(
        tree(queryClient, {
            actor: 'A',
            requiredConsumer: true,
            embedded: true,
        }),
    );
    await waitFor(() => expect(held.started()).toBe(true));
    await act(async () => held.release());
    await waitFor(() => expect(required.A.isError).toBe(true));
    expect(required.A.disabled).toBe(true);
    expect(toast).toHaveBeenCalledTimes(1);
    await act(async () => {
        await required.A.refetch();
    });
    await waitFor(() => expect(required.A.disabled).toBe(false));
    view.unmount();
    queryClient.clear();
});

it('revalidation of a settled identity-OFF flag blocks new optional work until the current flag resolves', async () => {
    const queryClient = client();
    nock('http://test.lightdash')
        .get(`/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`)
        .reply(200, { status: 'ok', results: { enabled: false } });
    let release: (error: null, response: [number, object]) => void;
    let started = false;
    nock('http://test.lightdash')
        .get(`/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`)
        .reply((_uri, _body, callback) => {
            started = true;
            release = callback;
        });
    const view = render(tree(queryClient, { actor: 'A', access: true }));
    await waitFor(() => expect(enabled.A).toBe(true));
    act(() => {
        void queryClient.invalidateQueries({
            predicate: (query) => query.queryKey.includes('identity-flag'),
        });
    });
    await waitFor(() => expect(started).toBe(true));
    await waitFor(() => expect(enabled.A).toBe(false));
    expect(await gates.A.refetch()).toEqual({ status: 'not-applicable' });
    await act(async () =>
        release(null, [
            500,
            {
                status: 'error',
                error: {
                    statusCode: 500,
                    name: 'Error',
                    message: 'Unavailable',
                },
            },
        ]),
    );
    await pause();
    expect(enabled.A).toBe(false);
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});

it.each([
    ...[200, 403].flatMap((status) => [
        { status, replacement: { organization: 'replacement-org' } },
        { status, replacement: { project: 'replacement-project' } },
        { status, replacement: { connection: 'replacement-connection' } },
        { status, replacement: { transportEpoch: 'replacement-api' } },
    ]),
])(
    'late non-aborted outcome cannot populate or toast after replacement %j',
    async ({ status, replacement }) => {
        const queryClient = client();
        const held = holdIdentity('A', status);
        server('A');
        nock('http://test.lightdash')
            .get('/api/v2/projects/replacement-project/ai-access/me')
            .reply(200, { status: 'ok', results: allowed });
        nock('http://test.lightdash')
            .get('/api/v2/projects/project/ai-access/me')
            .query({ connection: 'replacement-connection' })
            .reply(200, { status: 'ok', results: allowed });
        const view = render(tree(queryClient, { actor: 'A', access: true }));
        await waitFor(() => expect(held.started()).toBe(true));
        const old = gates.A.refetch;
        view.rerender(
            tree(queryClient, { actor: 'A', access: true, ...replacement }),
        );
        expect(enabled.A).toBe(false);
        await waitFor(() => expect(enabled.A).toBe(true));
        const count = seen.length;
        await act(async () => held.release());
        await pause();
        expect(enabled.A).toBe(true);
        expect(toast).not.toHaveBeenCalled();
        expect(seen).toHaveLength(count);
        expect(await old()).toEqual({ status: 'not-applicable' });
        const retired = queryClient.getQueryCache().findAll({
            predicate: (query) =>
                query.queryKey.includes('optional-ai-access') &&
                query.queryKey.includes('me') &&
                query.queryKey[3] === 0,
        });
        expect(retired.length).toBeGreaterThan(0);
        expect(retired.every((query) => query.state.data === undefined)).toBe(
            true,
        );
        view.unmount();
        queryClient.clear();
    },
);
it('a current refusal gates the optional action and can recover on explicit retry', async () => {
    const queryClient = client();
    const held = holdIdentity('A', 200, refused);
    server('A');
    const view = render(tree(queryClient, { actor: 'A', access: true }));
    await waitFor(() => expect(held.started()).toBe(true));
    await act(async () => held.release());
    await waitFor(() => expect(gates.A.refusal).toEqual(refused.refusal));
    expect(enabled.A).toBe(false);
    expect(toast).not.toHaveBeenCalled();
    await act(async () => {
        await gates.A.refetch();
    });
    await waitFor(() => expect(enabled.A).toBe(true));
    view.unmount();
    queryClient.clear();
});
it('retiring one consumer does not cancel an independent pending same-project peer', async () => {
    const queryClient = client();
    server('A');
    server('B');
    const held = holdIdentity('peer');
    server('peer');
    const content = (actor: string) => (
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <Scope actor={actor} access />
                <Scope actor="peer" access />
            </MemoryRouter>
        </QueryClientProvider>
    );
    const view = render(content('A'));
    await waitFor(() => expect(held.started()).toBe(true));
    await waitFor(() => expect(enabled.A).toBe(true));
    view.rerender(content('B'));
    await waitFor(() => expect(enabled.B).toBe(true));
    expect(enabled.peer).toBe(false);
    await act(async () => held.release());
    await waitFor(() => expect(enabled.peer).toBe(true));
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});

it('existing flag refresh revalidates scoped optional discovery before new work', async () => {
    const queryClient = client();
    let flagOn = false;
    nock('http://test.lightdash')
        .persist()
        .get(`/api/v2/feature-flag/${FeatureFlags.AgentIdentity}`)
        .reply(() => [200, { status: 'ok', results: { enabled: flagOn } }]);
    const identityRequest = nock('http://test.lightdash')
        .get('/api/v2/projects/project/ai-access/me')
        .reply(200, { status: 'ok', results: allowed });
    const view = render(tree(queryClient, { actor: 'A', access: true }));
    await waitFor(() => expect(enabled.A).toBe(true));
    expect(identityRequest.isDone()).toBe(false);
    flagOn = true;
    await act(async () => {
        await refetchFeatureFlags(queryClient);
    });
    await waitFor(() => expect(identityRequest.isDone()).toBe(true));
    await waitFor(() => expect(enabled.A).toBe(true));
    expect(toast).not.toHaveBeenCalled();
    view.unmount();
    queryClient.clear();
});

it.each([
    { status: 200, result: allowed },
    { status: 200, result: refused },
    { status: 403, result: allowed },
])(
    'an already-started manual refetch returns not-applicable after withdrawal $status',
    async ({ status, result }) => {
        const queryClient = client();
        nock('http://test.lightdash')
            .get('/api/v2/projects/project/ai-access/me')
            .reply(200, { status: 'ok', results: allowed });
        const held = holdIdentity('A', status, result);
        server('A');
        const initial = { actor: 'A', access: true };
        const view = render(tree(queryClient, initial));
        await waitFor(() => expect(enabled.A).toBe(true));
        const completion = gates.A.refetch();
        await waitFor(() => expect(held.started()).toBe(true));
        view.rerender(tree(queryClient, { ...initial, callerEnabled: false }));
        await act(async () => held.release());
        expect(await completion).toEqual({ status: 'not-applicable' });
        expect(enabled.A).toBe(false);
        expect(toast).not.toHaveBeenCalled();
        view.rerender(tree(queryClient, initial));
        expect(enabled.A).toBe(false);
        await waitFor(() => expect(enabled.A).toBe(true));
        view.unmount();
        queryClient.clear();
    },
);

it.each([{ authenticated: false }, { healthPending: true }, { project: '' }])(
    'cached registered user alone cannot admit optional discovery %j',
    async (replacement) => {
        const queryClient = client();
        server('A', true, 403);
        const view = render(
            tree(queryClient, { actor: 'A', access: true, ...replacement }),
        );
        await pause();
        expect(enabled.A).toBe(false);
        expect(seen).toEqual([]);
        expect(await gates.A.refetch()).toEqual({ status: 'not-applicable' });
        expect(toast).not.toHaveBeenCalled();
        view.unmount();
        queryClient.clear();
    },
);

it.each([200, 403])(
    'A to B to A cannot adopt the first A non-aborted outcome %s',
    async (status) => {
        const queryClient = client();
        const held = holdIdentity('A', status);
        server('A');
        server('B');
        const view = render(tree(queryClient, { actor: 'A', access: true }));
        await waitFor(() => expect(held.started()).toBe(true));
        const firstRetry = gates.A.refetch;
        view.rerender(tree(queryClient, { actor: 'B', access: true }));
        await waitFor(() => expect(enabled.B).toBe(true));
        view.rerender(tree(queryClient, { actor: 'A', access: true }));
        expect(enabled.A).toBe(false);
        await waitFor(() => expect(enabled.A).toBe(true));
        const count = seen.length;
        await act(async () => held.release());
        await pause();
        expect(enabled.A).toBe(true);
        expect(seen).toHaveLength(count);
        expect(toast).not.toHaveBeenCalled();
        expect(await firstRetry()).toEqual({ status: 'not-applicable' });
        expect(seen.filter((entry) => entry === 'A:identity')).toHaveLength(1);
        view.unmount();
        queryClient.clear();
    },
);
it('a replacement user cannot start metadata generation using a cached identity-OFF flag', async () => {
    const queryClient = client();
    queryClient.setQueryData(['health'], health);
    server('A', false);
    server('B', true, 403);
    nock('http://test.lightdash')
        .post('/api/v1/ai/project/chart/generate-metadata')
        .matchHeader('x-fixture-actor', 'B')
        .reply(() => {
            seen.push('B:metadata');
            return [403, { status: 'error', error: new ForbiddenError() }];
        });
    const view = render(
        tree(queryClient, { actor: 'A', metadataConsumer: true }),
    );
    await waitFor(() =>
        expect(seen).toContain(`A:flag:${FeatureFlags.AgentIdentity}`),
    );
    await pause();
    view.rerender(tree(queryClient, { actor: 'B', metadataConsumer: true }));
    act(() => metadata.B.trigger());
    await pause();
    expect(seen).not.toContain('B:metadata');
    await waitFor(() => expect(seen).toContain('B:identity'));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    act(() => metadata.B.trigger());
    expect(seen).not.toContain('B:metadata');
    view.unmount();
    queryClient.clear();
});

it.each([
    { status: 200, result: allowed },
    { status: 200, result: refused },
    { status: 403, result: allowed },
])(
    'native optional consumers observe retirement before a held completion and recover afterwards %j',
    async ({ status, result }) => {
        const queryClient = client();
        queryClient.setQueryData(['health'], health);
        const held = holdIdentity('A', status, result);
        server('A');
        server('B');
        server('peer');
        const content = (actor: string) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <Scope actor={actor} />
                    <Scope actor="peer" />
                </MemoryRouter>
            </QueryClientProvider>
        );
        const view = render(content('A'));
        await waitFor(() => expect(held.started()).toBe(true));
        await waitFor(() => expect(enabled.peer).toBe(true));
        view.rerender(content('B'));
        expect(observed.B).toMatchObject({
            ready: false,
            organization: 'org-B',
        });
        await waitFor(() => expect(enabled.B).toBe(true));
        expect(seen.filter((event) => event === 'B:identity')).toHaveLength(1);
        const peerRequests = seen.filter(
            (event) => event === 'peer:identity',
        ).length;
        expect(held.aborted()).toBe(false);
        await act(async () => held.release());
        await pause();
        expect(enabled.B).toBe(true);
        expect(enabled.peer).toBe(true);
        expect(toast).not.toHaveBeenCalled();
        expect(seen.filter((event) => event === 'peer:identity')).toHaveLength(
            peerRequests,
        );
        await act(async () => {
            await queryClient.invalidateQueries({
                predicate: (query) =>
                    query.queryKey[0] === 'ai-access' &&
                    query.getObserversCount() > 0,
            });
        });
        await waitFor(() => expect(enabled.B).toBe(true));
        expect(seen.filter((event) => event === 'B:identity')).toHaveLength(2);
        expect(seen.filter((event) => event === 'A:identity')).toHaveLength(0);
        view.unmount();
        queryClient.clear();
    },
);

it.each(['error', 'malformed-json'] as const)(
    'the real metadata consumer falls back on synthetic provider %s',
    async (failure) => {
        const queryClient = client();
        queryClient.setQueryData(['health'], health);
        server('A');
        nock('http://test.lightdash')
            .post('/api/v1/ai/project/chart/generate-metadata')
            .reply(
                failure === 'error' ? 503 : 200,
                failure === 'error'
                    ? {
                          status: 'error',
                          error: {
                              name: 'Error',
                              statusCode: 503,
                              message: 'Synthetic provider unavailable',
                          },
                      }
                    : '{invalid-json',
                { 'Content-Type': 'application/json' },
            );
        const view = render(
            tree(queryClient, { actor: 'A', metadataConsumer: true }),
        );
        await waitFor(() => expect(seen).toContain('A:identity'));
        await pause();
        act(() => metadata.A.trigger());
        await waitFor(() => expect(metadata.A.isLoading).toBe(false));
        expect(metadata.A.generatedMetadata).toBe(null);
        if (failure === 'malformed-json') {
            expect(console.error).toHaveBeenCalledExactlyOnceWith(
                'Failed to reach the Lightdash server:',
                expect.objectContaining({
                    name: 'UnexpectedResponseError',
                    status: 200,
                }),
            );
            vi.mocked(console.error).mockClear();
        }
        view.unmount();
        queryClient.clear();
    },
);
