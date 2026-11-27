import {
    ApiConnectorType,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ENABLED_ENV,
    type HydraApiSource,
    type HydraObject,
    type MetricQuery,
} from '@lightdash/common';
import { hydraIntegration } from '.';
import {
    buildLiveExplores,
    compileLiveMetricQuery,
} from '../../explores/build';
import {
    assertLiveQuery,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { type LiveSourceExploreEdits } from '../../explores/fields';
import {
    checkDiscoveredExplores,
    nameLiveExplores,
} from '../../explores/source';
import { extendLiveModel, findAccessRule } from '../../integration';
import {
    connectLiveSource,
    getRefreshedLiveState,
} from '../../liveSource.mock';
import { createHydraServer } from './fake/server';

const NOW = new Date('2026-11-23T12:00:00Z');

const DEALS: HydraObject = {
    id: 'Deals',
    label: 'Deals',
    recordCount: 30,
    fields: [
        { id: 'stage', label: 'Stage', type: 'string' },
        { id: 'amount', label: 'Amount', type: 'number' },
        {
            id: 'sync_token',
            label: 'Sync token',
            type: 'string',
            system: true,
        },
    ],
};

const settingsWith = (objects: HydraObject[]): HydraApiSource => ({
    ...HYDRA_DEFAULT_SOURCE,
    objects,
});

const connect = (settings: HydraApiSource) => {
    const server = createHydraServer({ now: () => NOW, sleep: vi.fn() });
    const send = vi.fn((request) =>
        server.fetch({
            sourceKey: 'source-1',
            settings,
            token: 'alice',
            request,
        }),
    );
    return {
        send,
        source: connectLiveSource(hydraIntegration, settings, send),
    };
};

/** What a Refresh stores: the vendor's metadata, and a name for each unnamed explore it gives. */
const refresh = async (objects: HydraObject[]) => {
    const { source } = connect(settingsWith(objects));
    const metadata = await source.scan();
    const explores = checkDiscoveredExplores(
        ApiConnectorType.HYDRA,
        extendLiveModel(hydraIntegration.model, metadata),
    );
    const modelNames = nameLiveExplores({
        connector: ApiConnectorType.HYDRA,
        explores,
        modelNames: {},
    });
    return { metadata, explores, modelNames };
};

const build = (
    { metadata, modelNames }: Awaited<ReturnType<typeof refresh>>,
    exploreEdits: LiveSourceExploreEdits = {},
) =>
    buildLiveExplores({
        connectionUuid: '9b0c3f6e-0d0a-4c55-9a26-5e6d4b7c2a11',
        sourceName: 'crm',
        name: 'CRM',
        apiSource: settingsWith([DEALS]),
        state: getRefreshedLiveState(metadata, {
            modelNames,
            explores: exploreEdits,
        }),
    });

const DEALS_ON = { deals: { inUse: true } };

describe('Hydra explores found by a Refresh', () => {
    beforeEach(() => {
        vi.stubEnv(HYDRA_ENABLED_ENV, 'true');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('finds only its declared explores, without a call, when it has no objects', async () => {
        const { send, source } = connect(settingsWith([]));
        expect(await source.discover()).toEqual([
            ...hydraIntegration.model.explores,
        ]);
        expect(send).not.toHaveBeenCalled();
    });

    it('finds one explore per object, keyed by its id, with a record id field', async () => {
        const { explores } = await refresh([DEALS]);
        const deals = explores.find(({ apiName }) => apiName === 'Deals');
        expect(deals?.name).toBeUndefined();
        expect(
            deals?.dimensions.map(({ name, onByDefault }) => [
                name,
                onByDefault,
            ]),
        ).toEqual([
            ['id', undefined],
            ['stage', undefined],
            ['amount', undefined],
            ['sync_token', false],
        ]);
    });

    it('grants a report path per object it found, and no other', async () => {
        const { explores } = await refresh([DEALS]);
        const { rules } = hydraIntegration.connection.access(
            settingsWith([DEALS]),
            explores,
        );
        expect(
            findAccessRule(rules, {
                method: 'POST',
                path: '/v1/objects/Deals/report',
            }),
        ).toBeDefined();
        expect(
            findAccessRule(rules, {
                method: 'POST',
                path: '/v1/objects/Other/report',
            }),
        ).toBeUndefined();
    });

    it('starts an object explore off', async () => {
        const refreshed = await refresh([DEALS]);
        expect(build(refreshed).map(({ name }) => name)).toEqual([
            'crm_events',
            'crm_users',
        ]);
    });

    it('builds an object explore an admin turns on, with system fields hidden, and runs it', async () => {
        const refreshed = await refresh([DEALS]);
        const explores = build(refreshed, DEALS_ON);

        // Declared explores come first and keep their names
        expect(explores.map(({ name }) => name)).toEqual([
            'crm_events',
            'crm_users',
            'crm_deals',
        ]);
        const deals = explores[2];
        expect(deals.apiSource?.apiName).toBe('Deals');
        const { dimensions } = deals.tables.crm_deals;
        expect(Object.keys(dimensions)).toEqual(
            expect.arrayContaining(['id', 'stage', 'amount']),
        );
        expect(dimensions.sync_token).toBeUndefined();

        const metricQuery: MetricQuery = {
            exploreName: deals.name,
            dimensions: ['crm_deals_stage'],
            metrics: ['crm_deals_record_count'],
            filters: {},
            sorts: [],
            limit: 100,
            tableCalculations: [],
        };
        assertLiveQuery(deals, metricQuery);
        const compiled = compileLiveMetricQuery({
            explore: deals,
            metricQuery,
            timezone: 'UTC',
            now: NOW,
        });
        const { send, source } = connect(settingsWith([DEALS]));
        const { rows } = await source.run({
            query: compiled.query,
            limit: compiled.requestLimit,
        });

        expect(send.mock.calls.map(([request]) => request.path)).toEqual([
            '/v1/objects/Deals/report',
        ]);
        expect(
            rows.reduce((sum, row) => sum + Number(row.record_count), 0),
        ).toBe(30);
    });

    it('drops the explore of an object a later Refresh no longer finds', async () => {
        const { modelNames } = await refresh([DEALS]);
        const later = await refresh([]);
        expect(
            build({ ...later, modelNames }, DEALS_ON).map(({ name }) => name),
        ).toEqual(['crm_events', 'crm_users']);
    });

    it('numbers an object whose name another explore has', async () => {
        const users: HydraObject = { ...DEALS, id: 'Users', label: 'Users' };
        const { modelNames } = await refresh([users]);
        expect(modelNames).toEqual({ Users: 'users_2' });
    });

    it('answers 404 for an object it does not have, and 400 for a field it does not know', async () => {
        const server = createHydraServer({ now: () => NOW, sleep: vi.fn() });
        const report = (path: string, body: unknown) =>
            server.fetch({
                sourceKey: 'source-1',
                settings: settingsWith([DEALS]),
                token: 'alice',
                request: { method: 'POST', path, body },
            });
        const body = {
            object: 'Deals',
            dimensions: ['stage'],
            metrics: ['record_count'],
            filters: [],
            orderBy: [],
            limit: 10,
        };
        expect((await report('/v1/objects/Deals/report', body)).status).toBe(
            200,
        );
        expect(
            (
                await report('/v1/objects/Other/report', {
                    ...body,
                    object: 'Other',
                })
            ).status,
        ).toBe(404);
        expect(
            (
                await report('/v1/objects/Deals/report', {
                    ...body,
                    dimensions: ['nope'],
                })
            ).status,
        ).toBe(400);
    });
});
