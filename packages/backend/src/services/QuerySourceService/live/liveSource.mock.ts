import type { ApiConnectorType, ApiSourceOf } from '@lightdash/common';
import { createLiveRuntime, type LiveTransport } from './calls';
import type { LiveExploreDefinition } from './explores/definition';
import {
    getLiveSourceModels,
    type LiveSourceFieldState,
} from './explores/source';
import { runLiveRequest } from './query/run';
import type { LiveExtension, LiveIntegration } from './types';

const REFRESHED_AT = '2026-11-06T12:00:00.000Z';

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
    const scan = (): Promise<unknown> =>
        integration.model.scan?.({
            settings,
            runtime: source.runtime,
        }) ?? Promise.resolve(null);
    return {
        run: (args: { query: string; limit: number }) =>
            runLiveRequest(source, args),
        /** What a Refresh would store: the vendor's metadata. */
        scan,
        /** The source's explores after a Refresh, as a build reads them. */
        discover: async (): Promise<LiveExploreDefinition[]> => {
            const { model, connector } = source.integration;
            return model.scan
                ? getLiveSourceModels(connector, {
                      scan: { at: REFRESHED_AT, metadata: await scan() },
                  }).map(({ definition }) => definition)
                : [...model.explores];
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

/** A source's state after a Refresh stored `metadata`, with nothing curated unless given. */
export const getRefreshedLiveState = (
    metadata: unknown,
    curated: Partial<Pick<LiveSourceFieldState, 'fields' | 'explores'>> = {},
) => ({
    scan: { at: REFRESHED_AT, metadata },
    fields: {},
    explores: {},
    ...curated,
});

/**
 * A source's state holding `extension` as is, for core tests that need
 * what no integration adds: it rides in as an old scan's.
 */
export const getLiveStateWithExtension = (
    extension: LiveExtension,
    curated: Partial<Pick<LiveSourceFieldState, 'fields' | 'explores'>> = {},
) => ({
    scan: null,
    legacy: { at: REFRESHED_AT, extension },
    fields: {},
    explores: {},
    ...curated,
});
