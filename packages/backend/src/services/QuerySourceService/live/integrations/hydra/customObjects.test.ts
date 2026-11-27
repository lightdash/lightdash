import {
    ApiConnectorType,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_ENABLED_ENV,
    type HydraApiSource,
    type HydraCustomObject,
    type MetricQuery,
} from '@lightdash/common';
import { hydraIntegration } from '.';
import {
    buildLiveExplores,
    compileLiveMetricQuery,
} from '../../explores/build';
import { getLiveCustomModels } from '../../explores/catalog';
import { assertLiveQuery } from '../../explores/definition';
import { getInitialLiveSourceFieldEdits } from '../../explores/fields';
import { findAccessRule } from '../../integration';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveCatalog, type LiveObjectCatalog } from '../../types';
import { createHydraServer } from './fake/server';

const NOW = new Date('2026-11-23T12:00:00Z');

const DEALS: HydraCustomObject = {
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
            internal: true,
        },
    ],
};

const settingsWith = (customObjects: HydraCustomObject[]): HydraApiSource => ({
    ...HYDRA_DEFAULT_SOURCE,
    customObjects,
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

// What a Refresh stores of a discovered catalog
const toObjectCatalog = (catalog: LiveCatalog): LiveObjectCatalog => ({
    entries: catalog.entries ?? [],
});

const buildDeals = (catalog: LiveObjectCatalog) => {
    const apiSource = settingsWith([DEALS]);
    const customModels = getLiveCustomModels({
        connector: ApiConnectorType.HYDRA,
        catalog,
        configured: { objects: { Deals: { name: 'deals' } } },
    });
    const explores = buildLiveExplores({
        connectionUuid: '9b0c3f6e-0d0a-4c55-9a26-5e6d4b7c2a11',
        sourceName: 'crm',
        name: 'CRM',
        apiSource,
        scannedFields: [],
        customModels,
        edits: getInitialLiveSourceFieldEdits({
            scannedFields: [],
            isExistingSource: true,
        }),
    });
    const deals = explores.find(({ name }) => name === 'crm_deals');
    if (!deals) throw new Error('No deals explore');
    return { explores, deals };
};

describe('Hydra custom objects', () => {
    beforeEach(() => {
        vi.stubEnv(HYDRA_ENABLED_ENV, 'true');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('discovers nothing, without a call, when it has no custom objects', async () => {
        const { send, source } = connect(settingsWith([]));
        expect(await source.discover()).toEqual({ entries: [] });
        expect(send).not.toHaveBeenCalled();
    });

    it('discovers each object with a record id and its fields', async () => {
        const { source } = connect(settingsWith([DEALS]));
        const { entries } = toObjectCatalog(await source.discover());
        expect(entries).toEqual([
            {
                id: 'Deals',
                label: 'Deals',
                builtIn: false,
                recordIdField: 'id',
                fields: [
                    { id: 'id', label: 'ID', vendorType: 'string' },
                    { id: 'stage', label: 'Stage', vendorType: 'string' },
                    { id: 'amount', label: 'Amount', vendorType: 'number' },
                    {
                        id: 'sync_token',
                        label: 'Sync token',
                        vendorType: 'string',
                        internal: true,
                    },
                ],
            },
        ]);
    });

    it('grants a report path per object in its catalog, and no other', async () => {
        const { source } = connect(settingsWith([DEALS]));
        const catalog = toObjectCatalog(await source.discover());
        const { rules } = hydraIntegration.connection.access(
            settingsWith([DEALS]),
            catalog,
        );
        expect(
            findAccessRule(rules, {
                method: 'POST',
                path: '/v1/objects/Deals/report',
            }),
        ).toMatchObject({ entry: 'Deals' });
        expect(
            findAccessRule(rules, {
                method: 'POST',
                path: '/v1/objects/Other/report',
            }),
        ).toBeUndefined();
    });

    it('builds an object explore, with internal fields hidden, and runs it', async () => {
        const { send, source } = connect(settingsWith([DEALS]));
        const catalog = toObjectCatalog(await source.discover());
        const { explores, deals } = buildDeals(catalog);

        // Built-in explores come first and keep their names
        expect(explores.map(({ name }) => name)).toEqual([
            ...hydraIntegration.model.explores.map(({ name }) => `crm_${name}`),
            'crm_deals',
        ]);
        expect(deals.apiSource?.object).toBe('Deals');
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
        send.mockClear();
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
