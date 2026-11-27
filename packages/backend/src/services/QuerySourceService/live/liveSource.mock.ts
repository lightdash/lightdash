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
    return {
        run: (args: { query: string; limit: number }) =>
            runLiveRequest(source, args),
        discover: (): Promise<LiveExploreDefinition[]> =>
            integration.model.discover?.({
                settings,
                runtime: source.runtime,
            }) ?? Promise.resolve([...integration.model.explores]),
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

/** A source's state after a Refresh found `explores`, with nothing curated unless given. */
export const getRefreshedLiveState = (
    explores: LiveExploreDefinition[],
    curated: Partial<
        Pick<LiveSourceFieldState, 'fields' | 'explores' | 'modelNames'>
    > = {},
) => ({
    discovered: { refreshedAt: '2026-11-06T12:00:00.000Z', explores },
    modelNames: {},
    fields: {},
    explores: {},
    ...curated,
});
