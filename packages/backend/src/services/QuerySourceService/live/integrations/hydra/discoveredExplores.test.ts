import {
    ApiConnectorType,
    HYDRA_DEFAULT_SOURCE,
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
import { checkLiveExtension, getLiveExtension } from '../../explores/source';
import { extendLiveModel } from '../../integration';
import {
    connectLiveSource,
    getRefreshedLiveState,
} from '../../liveSource.mock';

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
    const send = vi.fn();
    return {
        send,
        source: connectLiveSource(hydraIntegration, settings, send),
    };
};

/** What a Refresh stores: the vendor's metadata, with the explores it gives and the ones left out. */
const refresh = async (objects: HydraObject[]) => {
    const { source } = connect(settingsWith(objects));
    const metadata = await source.scan();
    const { dropped } = checkLiveExtension(
        ApiConnectorType.HYDRA,
        extendLiveModel(hydraIntegration.model, metadata),
    );
    const { explores } = getLiveExtension(
        ApiConnectorType.HYDRA,
        getRefreshedLiveState(metadata),
    );
    return { metadata, explores, dropped };
};

const build = (
    { metadata }: Awaited<ReturnType<typeof refresh>>,
    exploreEdits: LiveSourceExploreEdits = {},
) =>
    buildLiveExplores({
        connectionUuid: '9b0c3f6e-0d0a-4c55-9a26-5e6d4b7c2a11',
        sourceName: 'crm',
        name: 'CRM',
        apiSource: settingsWith([DEALS]),
        state: getRefreshedLiveState(metadata, { explores: exploreEdits }),
    });

const DEALS_ON = { deals: { inUse: true } };

describe('Hydra explores found by a Refresh', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('finds only its declared explores, without a call, when it has no objects', async () => {
        const { send, source } = connect(settingsWith([]));
        expect(await source.discover()).toEqual([
            ...hydraIntegration.model.explores,
        ]);
        expect(send).not.toHaveBeenCalled();
    });

    it('finds one explore per object, named from its id, with a record id field', async () => {
        const { explores } = await refresh([DEALS]);
        const deals = explores.find(({ apiName }) => apiName === 'Deals');
        expect(deals?.name).toBe('deals');
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

        expect(send).not.toHaveBeenCalled();
        expect(
            rows.reduce((sum, row) => sum + Number(row.record_count), 0),
        ).toBe(30);
    });

    it('drops the explore of an object a later Refresh no longer finds', async () => {
        await refresh([DEALS]);
        const later = await refresh([]);
        expect(build(later, DEALS_ON).map(({ name }) => name)).toEqual([
            'crm_events',
            'crm_users',
        ]);
    });

    it('leaves out an object whose name a declared explore has', async () => {
        const users: HydraObject = { ...DEALS, id: 'Users', label: 'Users' };
        const refreshed = await refresh([users, DEALS]);
        expect(refreshed.dropped).toEqual(['users']);
        expect(
            build(refreshed, { users: { inUse: true }, ...DEALS_ON }).map(
                ({ name }) => name,
            ),
        ).toEqual(['crm_events', 'crm_users', 'crm_deals']);
    });

    it('refuses an object it does not have, and a field it does not know', async () => {
        const { source } = connect(settingsWith([DEALS]));
        const report = (request: Record<string, unknown>) =>
            source.run({
                query: JSON.stringify({
                    dimensions: ['stage'],
                    metrics: ['record_count'],
                    filters: [],
                    orderBy: [],
                    limit: 10,
                    ...request,
                }),
                limit: 10,
            });
        await expect(report({ object: 'Deals' })).resolves.toMatchObject({
            hasMoreRows: false,
        });
        await expect(report({ object: 'Other' })).rejects.toThrow(
            'Hydra has no object Other',
        );
        await expect(
            report({ object: 'Deals', dimensions: ['nope'] }),
        ).rejects.toThrow('Deals has no field nope');
    });
});
