import {
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import type { ApiConnectorResponse } from '../ApiConnector';
import {
    YOUTUBE_ANALYTICS_REPORTS_PATH,
    YoutubeAnalyticsConnector,
} from './YoutubeAnalyticsConnector';

const CHANNEL = 'UCabcdefghijklmnopqrstuv';

const jsonResponse = (body: unknown, status = 200): ApiConnectorResponse => ({
    status,
    headers: {},
    body,
});

const createConnector = (response: ApiConnectorResponse) => {
    const send = vi.fn().mockResolvedValue(response);
    return {
        send,
        connector: new YoutubeAnalyticsConnector({ channelId: CHANNEL, send }),
    };
};

const execute = (
    connector: YoutubeAnalyticsConnector,
    request: Record<string, unknown>,
    limit = 2,
) =>
    connector.execute({
        payload: { kind: 'query', query: JSON.stringify(request) },
        limit,
    });

const BASE = {
    startDate: '2026-10-01',
    endDate: '2026-10-28',
    metrics: 'views,averageViewDuration',
};

const header = (name: string, columnType: string) => ({
    name,
    columnType,
    dataType: 'STRING',
});

const dailyReport = {
    kind: 'youtubeAnalytics#resultTable',
    columnHeaders: [
        header('day', 'DIMENSION'),
        header('views', 'METRIC'),
        header('averageViewDuration', 'METRIC'),
    ],
    rows: [
        ['2026-10-01', 120, 41.5],
        ['2026-10-02', 80, 39],
        ['2026-10-03', 95, 44],
    ],
};

describe('YoutubeAnalyticsConnector', () => {
    it('asks for one row more than the limit on the connection channel', async () => {
        const { connector, send } = createConnector(jsonResponse(dailyReport));
        await execute(connector, { ...BASE, dimensions: 'day', sort: 'day' });
        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: YOUTUBE_ANALYTICS_REPORTS_PATH,
            query: {
                ids: `channel==${CHANNEL}`,
                ...BASE,
                dimensions: 'day',
                sort: 'day',
                maxResults: '3',
            },
            body: null,
        });
    });

    it('reads columns from the response and reports truncation', async () => {
        const { connector } = createConnector(jsonResponse(dailyReport));
        const result = await execute(connector, { ...BASE, dimensions: 'day' });
        expect(result.columns).toEqual([
            { name: 'day', type: DimensionType.DATE },
            { name: 'views', type: DimensionType.NUMBER },
            { name: 'averageViewDuration', type: DimensionType.NUMBER },
        ]);
        expect(result.rows).toEqual([
            { day: '2026-10-01', views: 120, averageViewDuration: 41.5 },
            { day: '2026-10-02', views: 80, averageViewDuration: 39 },
        ]);
        expect(result.hasMoreRows).toBe(true);
    });

    it('turns months into their first day and handles an empty report', async () => {
        const { connector } = createConnector(
            jsonResponse({
                columnHeaders: [
                    header('month', 'DIMENSION'),
                    header('views', 'METRIC'),
                ],
                rows: [['2026-10', 5]],
            }),
        );
        expect(
            (await execute(connector, { ...BASE, dimensions: 'month' })).rows,
        ).toEqual([{ month: '2026-10-01', views: 5 }]);

        const empty = createConnector(
            jsonResponse({ columnHeaders: [header('views', 'METRIC')] }),
        );
        expect(await execute(empty.connector, BASE)).toMatchObject({
            rows: [],
            hasMoreRows: false,
        });
    });

    it('rejects a request that names its own channel or a bad field', async () => {
        const { connector, send } = createConnector(jsonResponse(dailyReport));
        await expect(
            execute(connector, { ...BASE, ids: 'channel==UCother' }),
        ).rejects.toThrow(ParameterError);
        await expect(
            execute(connector, { ...BASE, filters: 'video==a&ids=x' }),
        ).rejects.toThrow('Invalid YouTube Analytics report request');
        expect(send).not.toHaveBeenCalled();
    });

    describe('top videos', () => {
        const videoRows = (count: number) => ({
            columnHeaders: [
                header('video', 'DIMENSION'),
                header('views', 'METRIC'),
            ],
            rows: Array.from({ length: count }, (_, index) => [
                `v${index}`,
                1000 - index,
            ]),
        });
        const VIDEOS = { ...BASE, metrics: 'views', dimensions: 'video' };

        it('caps maxResults at 200', async () => {
            const { connector, send } = createConnector(
                jsonResponse(videoRows(150)),
            );
            const result = await execute(connector, VIDEOS, 500);
            expect(send.mock.calls[0][0].query.maxResults).toBe('200');
            expect(result.rows).toHaveLength(150);
            expect(result.hasMoreRows).toBe(false);
        });

        it('refuses rather than cutting a channel with more than 200 videos', async () => {
            const { connector } = createConnector(jsonResponse(videoRows(200)));
            await expect(execute(connector, VIDEOS, 500)).rejects.toThrow(
                'more than 200 rows',
            );
        });

        it('returns a smaller top list and flags more rows', async () => {
            const { connector } = createConnector(jsonResponse(videoRows(11)));
            const result = await execute(connector, VIDEOS, 10);
            expect(result.rows).toHaveLength(10);
            expect(result.hasMoreRows).toBe(true);
        });
    });

    it('refuses over the row ceiling', async () => {
        const rows = Array.from({ length: 10_000 }, (_, index) => [
            `d${index}`,
            1,
            1,
        ]);
        const { connector } = createConnector(
            jsonResponse({ ...dailyReport, rows }),
        );
        await expect(
            execute(connector, { ...BASE, dimensions: 'day' }, 20_000),
        ).rejects.toThrow('more than 9999 rows');
    });

    it.each([
        [400, WarehouseQueryError, 'The query is not supported'],
        [403, WarehouseConnectionError, `channel ${CHANNEL}`],
        [429, TooManyRequestsError, 'quota exceeded'],
    ])('maps a %s response', async (status, errorClass, message) => {
        const { connector } = createConnector(
            jsonResponse(
                { error: { message: 'The query is not supported' } },
                status,
            ),
        );
        const result = execute(connector, BASE);
        await expect(result).rejects.toBeInstanceOf(errorClass);
        await expect(result).rejects.toThrow(message);
    });
});
