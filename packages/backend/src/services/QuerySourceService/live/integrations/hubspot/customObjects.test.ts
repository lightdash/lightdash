import {
    ApiConnectorType,
    FilterOperator,
    type HubspotApiSource,
    type MetricQuery,
} from '@lightdash/common';
import { hubspotIntegration } from '.';
import {
    buildLiveExplores,
    compileLiveMetricQuery,
} from '../../explores/build';
import { assertLiveQuery } from '../../explores/definition';
import { getLiveExtension } from '../../explores/source';
import { findAccessRule } from '../../integration';
import {
    connectLiveSource,
    getRefreshedLiveState,
} from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import {
    HUBSPOT_CUSTOM_OBJECT_SCHEMAS,
    hubspotSearchPage,
} from './hubspot.fixtures';

const NOW = new Date('2026-11-27T12:00:00Z');

const SETTINGS: HubspotApiSource = { connector: ApiConnectorType.HUBSPOT };

const response = (body: unknown, status = 200): LiveHttpResponse => ({
    status,
    headers: {},
    body,
});

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(hubspotIntegration, SETTINGS, send),
    };
};

/** What a Refresh stores when the account's only finding is its custom objects. */
const refresh = async () => {
    const { source } = connect(
        // Five property lists
        ...Array.from({ length: 5 }, () => response({ results: [] })),
        response(HUBSPOT_CUSTOM_OBJECT_SCHEMAS),
    );
    return source.scan();
};

const SUBSCRIPTIONS_ON = { subscriptions: { inUse: true } };

const buildSubscriptions = (metadata: unknown) => {
    const explores = buildLiveExplores({
        connectionUuid: '9b0c3f6e-0d0a-4c55-9a26-5e6d4b7c2a11',
        sourceName: 'crm',
        name: 'CRM',
        apiSource: SETTINGS,
        state: getRefreshedLiveState(metadata, {
            explores: SUBSCRIPTIONS_ON,
        }),
    });
    const subscriptions = explores.find(
        ({ name }) => name === 'crm_subscriptions',
    );
    if (!subscriptions) throw new Error('No subscriptions explore');
    return { explores, subscriptions };
};

describe('HubSpot custom objects', () => {
    it('grants a search path per custom object a Refresh found, and no other', async () => {
        const { explores } = getLiveExtension(
            ApiConnectorType.HUBSPOT,
            getRefreshedLiveState(await refresh()),
        );
        const { rules } = hubspotIntegration.connection.access(SETTINGS, [
            ...hubspotIntegration.model.explores,
            ...explores,
        ]);
        expect(
            findAccessRule(rules, {
                method: 'POST',
                path: '/crm/v3/objects/2-123456/search',
            }),
        ).toMatchObject({ entry: '2-123456' });
        expect(
            findAccessRule(rules, {
                method: 'POST',
                path: '/crm/v3/objects/2-999/search',
            }),
        ).toBeUndefined();
        expect(
            findAccessRule(rules, { method: 'GET', path: '/crm/v3/schemas' }),
        ).toBeDefined();
    });

    it('starts a custom object explore off', async () => {
        const explores = buildLiveExplores({
            connectionUuid: '9b0c3f6e-0d0a-4c55-9a26-5e6d4b7c2a11',
            sourceName: 'crm',
            name: 'CRM',
            apiSource: SETTINGS,
            state: getRefreshedLiveState(await refresh()),
        });
        expect(explores.map(({ name }) => name)).not.toContain(
            'crm_subscriptions',
        );
    });

    it('builds a custom object explore an admin turns on, with its properties, system ones hidden', async () => {
        const { explores, subscriptions } = buildSubscriptions(await refresh());

        // Declared explores come first and keep their names
        expect(explores.map(({ name }) => name)).toEqual([
            ...hubspotIntegration.model.explores.map(
                ({ name }) => `crm_${name}`,
            ),
            'crm_subscriptions',
        ]);
        expect(subscriptions.label).toBe('Subscriptions');
        expect(subscriptions.apiSource?.apiName).toBe('2-123456');
        const { dimensions, metrics } = subscriptions.tables.crm_subscriptions;
        expect(Object.keys(dimensions)).toEqual(
            expect.arrayContaining([
                'record_id',
                'created_at',
                'updated_at',
                'plan',
                'plan_label',
                'seats',
            ]),
        );
        expect(dimensions.secret_note).toBeUndefined();
        expect(dimensions.hs_merged_object_ids).toBeUndefined();
        expect(dimensions.seats.type).toBe('number');
        expect(Object.keys(metrics)).toEqual(['count']);
    });

    it('searches the custom object by its id, with its own created-date property', async () => {
        const { subscriptions } = buildSubscriptions(await refresh());
        const metricQuery: MetricQuery = {
            exploreName: subscriptions.name,
            dimensions: ['crm_subscriptions_plan', 'crm_subscriptions_seats'],
            metrics: [],
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'created',
                            target: {
                                fieldId: 'crm_subscriptions_created_at',
                            },
                            operator: FilterOperator.IN_THE_PAST,
                            values: [7],
                            settings: { unitOfTime: 'days' },
                        },
                    ],
                },
            },
            sorts: [],
            limit: 100,
            tableCalculations: [],
        };
        assertLiveQuery(subscriptions, metricQuery);
        const compiled = compileLiveMetricQuery({
            explore: subscriptions,
            metricQuery,
            timezone: 'UTC',
            now: NOW,
        });
        const { source, send } = connect(
            response(
                hubspotSearchPage(
                    [
                        {
                            id: '1',
                            properties: { plan: 'pro', seats: '12' },
                            createdAt: '2026-11-25T10:00:00Z',
                            updatedAt: '2026-11-26T10:00:00Z',
                        },
                    ],
                    1,
                ),
            ),
        );

        const { rows } = await source.run({
            query: compiled.query,
            limit: compiled.requestLimit,
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toMatchObject({
            method: 'POST',
            path: '/crm/v3/objects/2-123456/search',
            body: {
                properties: ['plan', 'seats'],
                filterGroups: [
                    {
                        filters: [
                            expect.objectContaining({
                                propertyName: 'hs_createdate',
                            }),
                            expect.objectContaining({
                                propertyName: 'hs_createdate',
                            }),
                        ],
                    },
                ],
            },
        });
        expect(rows).toEqual([{ plan: 'pro', seats: 12 }]);
    });

    it('refuses a request for an object id that is not a custom object id', async () => {
        const { source } = connect();
        await expect(
            source.run({
                query: JSON.stringify({
                    kind: 'count',
                    object: '../owners',
                    filters: [],
                }),
                limit: 1,
            }),
        ).rejects.toThrow();
    });
});
