import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
} from '@lightdash/common';
import { linkedInAdsIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpRequest, type LiveHttpResponse } from '../../types';
import { LINKEDIN_ADS_ANALYTICS_PATH } from './api';

const ACCOUNT = '507404993';

const jsonResponse = (body: unknown, status = 200): LiveHttpResponse => ({
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

type LiveSource = ReturnType<typeof connectLiveSource>;

const connect = (respond: (request: LiveHttpRequest) => LiveHttpResponse) => {
    const send = vi.fn(async (request: LiveHttpRequest) => respond(request));
    return {
        send,
        source: connectLiveSource(
            linkedInAdsIntegration,
            { connector: ApiConnectorType.LINKEDIN_ADS, adAccountId: ACCOUNT },
            send,
        ),
    };
};

const REQUEST = {
    pivot: 'CAMPAIGN',
    timeGranularity: 'DAILY',
    dateRange: { start: '2026-10-01', end: '2026-10-03' },
    fields: ['impressions', 'costInLocalCurrency'],
    dimensions: ['day', 'campaign.id'],
};

const execute = (
    source: LiveSource,
    request: Record<string, unknown>,
    limit = 100,
) =>
    source.run({
        query: JSON.stringify(request),
        limit,
    });

describe('linkedInAdsIntegration run', () => {
    it('sends Rest.li syntax with the connection account in one call', async () => {
        const { source, send } = connect(() =>
            jsonResponse({ elements: [element('11', 1, 54)] }),
        );
        const result = await execute(source, {
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
                impressions: 54,
                costInLocalCurrency: 19.91,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('turns months into their first day and keeps group pivots', async () => {
        const { source } = connect(() =>
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
        const result = await execute(source, {
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

    it('rejects names, which adAnalytics does not report', async () => {
        const { source, send } = connect(() => jsonResponse({}));
        await expect(
            execute(source, { ...REQUEST, dimensions: ['campaign.name'] }),
        ).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects a request naming another account', async () => {
        const { source, send } = connect(() => jsonResponse({}));
        await expect(
            execute(source, { ...REQUEST, accounts: ['1'] }),
        ).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses rather than cutting 15,000 elements, and flags a smaller limit', async () => {
        const full = connect(() =>
            jsonResponse({
                elements: Array.from({ length: 15_000 }, () =>
                    element('1', 1, 1),
                ),
            }),
        );
        await expect(
            execute(full.source, {
                ...REQUEST,
                dimensions: ['campaign.id'],
            }),
        ).rejects.toThrow('more than 14,999 rows');

        const small = connect(() =>
            jsonResponse({
                elements: [element('1', 1, 1), element('1', 2, 1)],
            }),
        );
        const result = await execute(
            small.source,
            { ...REQUEST, dimensions: ['campaign.id'] },
            1,
        );
        expect(result.rows).toHaveLength(1);
        expect(result.hasMoreRows).toBe(true);
    });

    it.each([
        [401, WarehouseConnectionError, 'Reconnect'],
        [403, WarehouseConnectionError, `ad account ${ACCOUNT}`],
        [429, TooManyRequestsError, 'rate limit'],
    ])('maps a %s response', async (status, errorClass, message) => {
        const { source } = connect(() =>
            jsonResponse({ message: 'nope', status }, status),
        );
        const result = execute(source, REQUEST);
        await expect(result).rejects.toBeInstanceOf(errorClass);
        await expect(result).rejects.toThrow(message);
    });
});
