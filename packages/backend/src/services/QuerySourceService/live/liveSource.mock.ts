import type { ApiConnectorType, ApiSourceOf } from '@lightdash/common';
import { createLiveRuntime, type LiveTransport } from './calls';
import type { LiveExploreDefinition } from './explores/definition';
import type { LiveSourceFieldState } from './explores/source';
import { runLiveRequest } from './query/run';
import type { LiveIntegration } from './types';

/** One integration over a fake transport, the way the service runs it. */
export const connectLiveSource = <C extends ApiConnectorType>(
    integration: LiveIntegration<C>,
    settings: ApiSourceOf<C>,
    transport: LiveTransport,
) => {
    const source = {
        integration: integration as unknown as LiveIntegration,
        settings,
        runtime: createLiveRuntime(
            integration as unknown as LiveIntegration,
            settings,
            transport,
        ),
    };
    const read = (): Promise<unknown> =>
        integration.model.discover?.read({
            settings,
            runtime: source.runtime,
        }) ?? Promise.resolve(null);
    return {
        run: (args: { query: string; limit: number }) =>
            runLiveRequest(source, args),
        /** What a Refresh would store: the vendor's facts. */
        read,
        /** The explores a Refresh's facts give, as a build reads them. */
        discover: async (): Promise<LiveExploreDefinition[]> => {
            const { discover } = integration.model;
            return discover
                ? (discover.explores(await read()) ?? [])
                : [...integration.model.explores];
        },
    };
};

/** The names of the discovered explores that gained dimensions beyond the declared ones. */
export const getExploresWithDiscoveredFields = (
    declared: readonly LiveExploreDefinition[],
    discovered: readonly LiveExploreDefinition[],
) =>
    discovered
        .filter(
            ({ name, dimensions }) =>
                dimensions.length >
                (declared.find((explore) => explore.name === name)?.dimensions
                    .length ?? 0),
        )
        .map(({ name }) => name);

/** A source's state after a Refresh stored `found`, with nothing curated unless given. */
export const getRefreshedLiveState = (
    found: unknown,
    curated: Partial<
        Pick<LiveSourceFieldState, 'fields' | 'explores' | 'modelNames'>
    > = {},
) => ({
    discovered: { refreshedAt: '2026-11-06T12:00:00.000Z', found },
    modelNames: {},
    fields: {},
    explores: {},
    ...curated,
});

/**
 * A source's state holding `explores` as is, for core tests that need
 * explores no integration builds: they ride in as an old scan's.
 */
export const getLiveStateWithExplores = (
    explores: LiveExploreDefinition[],
    curated: Partial<
        Pick<LiveSourceFieldState, 'fields' | 'explores' | 'modelNames'>
    > = {},
) => ({
    discovered: null,
    legacy: { refreshedAt: '2026-11-06T12:00:00.000Z', explores },
    modelNames: {},
    fields: {},
    explores: {},
    ...curated,
});
