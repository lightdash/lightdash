import {
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
} from '@lightdash/common';
import type {
    ApiConnectorRequest,
    ApiConnectorResponse,
} from '../ApiConnector';
import {
    getLinkedInAdsCampaignGroupsPath,
    getLinkedInAdsCampaignsPath,
    LINKEDIN_ADS_ANALYTICS_PATH,
    LinkedInAdsConnector,
} from './LinkedInAdsConnector';

const ACCOUNT = '507404993';

const jsonResponse = (body: unknown, status = 200): ApiConnectorResponse => ({
    status,
    headers: {},
    body,
});

const element = (id: string, day: number, impressions: number) => ({
    pivotValues: [`urn:li:sponsoredCampaign:${id}`],
    dateRange: {
        start: { year: 2026, month: 10, day },
        end: { year: 2026, month: 10, day },
    },
    impressions,
    costInLocalCurrency: '19.91',
});

const createConnector = (
    respond: (request: ApiConnectorRequest) => ApiConnectorResponse,
) => {
    const send = vi.fn(async (request: ApiConnectorRequest) =>
        respond(request),
    );
    return {
        send,
        connector: new LinkedInAdsConnector({ adAccountId: ACCOUNT, send }),
    };
};

const REQUEST = {
    pivot: 'CAMPAIGN',
    timeGranularity: 'DAILY',
    dateRange: { start: '2026-10-01', end: '2026-10-03' },
    fields: ['impressions', 'costInLocalCurrency'],
    dimensions: ['day', 'campaign.id', 'campaign.name', 'campaignGroup.name'],
};

const execute = (
    connector: LinkedInAdsConnector,
    request: Record<string, unknown>,
    limit = 100,
) =>
    connector.execute({
        payload: { kind: 'query', query: JSON.stringify(request) },
        limit,
    });

describe('LinkedInAdsConnector', () => {
    it('sends Rest.li syntax with the connection account and joins names', async () => {
        const { connector, send } = createConnector((request) => {
            if (request.path === LINKEDIN_ADS_ANALYTICS_PATH) {
                return jsonResponse({ elements: [element('11', 1, 54)] });
            }
            if (request.path === getLinkedInAdsCampaignsPath(ACCOUNT)) {
                return jsonResponse({
                    elements: [
                        {
                            id: 11,
                            name: 'Launch',
                            campaignGroup: 'urn:li:sponsoredCampaignGroup:7',
                        },
                    ],
                });
            }
            return jsonResponse({ elements: [{ id: 7, name: 'Brand' }] });
        });
        const result = await execute(connector, {
            ...REQUEST,
            campaigns: ['11'],
        });

        expect(send.mock.calls[0][0]).toEqual({
            method: 'GET',
            path: LINKEDIN_ADS_ANALYTICS_PATH,
            rawQuery:
                'q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&dateRange=(start:(year:2026,month:10,day:1),end:(year:2026,month:10,day:3))&accounts=List(urn%3Ali%3AsponsoredAccount%3A507404993)&campaigns=List(urn%3Ali%3AsponsoredCampaign%3A11)&fields=impressions,costInLocalCurrency,dateRange,pivotValues',
            body: null,
        });
        expect(result.columns).toContainEqual({
            name: 'day',
            type: DimensionType.DATE,
        });
        expect(result.rows).toEqual([
            {
                day: '2026-10-01',
                'campaign.id': '11',
                'campaign.name': 'Launch',
                'campaignGroup.name': 'Brand',
                impressions: 54,
                costInLocalCurrency: 19.91,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('makes no lookup when only ids are selected', async () => {
        const { connector, send } = createConnector(() =>
            jsonResponse({ elements: [element('11', 1, 5)] }),
        );
        await execute(connector, {
            ...REQUEST,
            dimensions: ['campaign.id'],
        });
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('pages through campaigns', async () => {
        const { connector, send } = createConnector((request) => {
            if (request.path === LINKEDIN_ADS_ANALYTICS_PATH) {
                return jsonResponse({ elements: [element('12', 1, 5)] });
            }
            return request.rawQuery?.includes('pageToken')
                ? jsonResponse({ elements: [{ id: 12, name: 'Second' }] })
                : jsonResponse({
                      elements: [{ id: 11, name: 'First' }],
                      metadata: { nextPageToken: 'tok/en' },
                  });
        });
        const result = await execute(connector, {
            ...REQUEST,
            dimensions: ['campaign.name'],
        });
        expect(send.mock.calls[2][0].rawQuery).toContain('pageToken=tok%2Fen');
        expect(result.rows[0]['campaign.name']).toBe('Second');
    });

    it('turns months into their first day and keeps group pivots', async () => {
        const { connector } = createConnector(() =>
            jsonResponse({
                elements: [
                    {
                        pivotValues: ['urn:li:sponsoredCampaignGroup:7'],
                        dateRange: { start: { year: 2026, month: 3, day: 15 } },
                        impressions: 1,
                    },
                ],
            }),
        );
        const result = await execute(connector, {
            ...REQUEST,
            pivot: 'CAMPAIGN_GROUP',
            timeGranularity: 'MONTHLY',
            fields: ['impressions'],
            dimensions: ['month', 'campaignGroup.id'],
        });
        expect(result.rows).toEqual([
            { month: '2026-03-01', 'campaignGroup.id': '7', impressions: 1 },
        ]);
    });

    it('rejects a request naming another account', async () => {
        const { connector, send } = createConnector(() => jsonResponse({}));
        await expect(
            execute(connector, { ...REQUEST, accounts: ['1'] }),
        ).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses rather than cutting 15,000 elements, and flags a smaller limit', async () => {
        const full = createConnector(() =>
            jsonResponse({
                elements: Array.from({ length: 15_000 }, () =>
                    element('1', 1, 1),
                ),
            }),
        );
        await expect(
            execute(full.connector, {
                ...REQUEST,
                dimensions: ['campaign.id'],
            }),
        ).rejects.toThrow('more than 14,999 rows');

        const small = createConnector(() =>
            jsonResponse({
                elements: [element('1', 1, 1), element('1', 2, 1)],
            }),
        );
        const result = await execute(
            small.connector,
            { ...REQUEST, dimensions: ['campaign.id'] },
            1,
        );
        expect(result.rows).toHaveLength(1);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses an account with too many campaigns to look up', async () => {
        const { connector } = createConnector((request) =>
            request.path === LINKEDIN_ADS_ANALYTICS_PATH
                ? jsonResponse({ elements: [element('1', 1, 1)] })
                : jsonResponse({
                      elements: [],
                      metadata: { nextPageToken: 'more' },
                  }),
        );
        await expect(
            execute(connector, { ...REQUEST, dimensions: ['campaign.name'] }),
        ).rejects.toThrow('more campaigns than one query can look up');
    });

    it.each([
        [401, WarehouseConnectionError, 'Reconnect'],
        [403, WarehouseConnectionError, `ad account ${ACCOUNT}`],
        [429, TooManyRequestsError, 'rate limit'],
    ])('maps a %s response', async (status, errorClass, message) => {
        const { connector } = createConnector(() =>
            jsonResponse({ message: 'nope', status }, status),
        );
        const result = execute(connector, REQUEST);
        await expect(result).rejects.toBeInstanceOf(errorClass);
        await expect(result).rejects.toThrow(message);
    });

    it('looks up campaign groups only when a name is asked for', async () => {
        const { connector, send } = createConnector(() =>
            jsonResponse({ elements: [] }),
        );
        await execute(connector, { ...REQUEST, dimensions: ['campaign.id'] });
        expect(
            send.mock.calls.some(
                ([request]) =>
                    request.path === getLinkedInAdsCampaignGroupsPath(ACCOUNT),
            ),
        ).toBe(false);
    });
});
