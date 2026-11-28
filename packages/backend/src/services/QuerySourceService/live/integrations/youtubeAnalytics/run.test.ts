import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { youtubeAnalyticsIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { YOUTUBE_ANALYTICS_REPORTS_PATH } from './api';

const CHANNEL = 'UCabcdefghijklmnopqrstuv';

const jsonResponse = (body: unknown, status = 200): LiveHttpResponse => ({
    status,
    headers: {},
    body,
});

type LiveSource = ReturnType<typeof connectLiveSource>;

const connect = (response: LiveHttpResponse) => {
    const send = vi.fn().mockResolvedValue(response);
    return {
        send,
        source: connectLiveSource(
            youtubeAnalyticsIntegration,
            {
                connector: ApiConnectorType.YOUTUBE_ANALYTICS,
                channelId: CHANNEL,
            },
            send,
        ),
    };
};

const execute = (
    source: LiveSource,
    request: Record<string, unknown>,
    limit = 2,
) =>
    source.run({
        query: JSON.stringify(request),
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

describe('youtubeAnalyticsIntegration run', () => {
    it('asks for one row more than the limit on the connection channel', async () => {
        const { source, send } = connect(jsonResponse(dailyReport));
        await execute(source, { ...BASE, dimensions: 'day', sort: 'day' });
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
        const { source } = connect(jsonResponse(dailyReport));
        const result = await execute(source, { ...BASE, dimensions: 'day' });
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
        const { source } = connect(
            jsonResponse({
                columnHeaders: [
                    header('month', 'DIMENSION'),
                    header('views', 'METRIC'),
                ],
                rows: [['2026-10', 5]],
            }),
        );
        expect(
            (await execute(source, { ...BASE, dimensions: 'month' })).rows,
        ).toEqual([{ month: '2026-10-01', views: 5 }]);

        const empty = connect(
            jsonResponse({ columnHeaders: [header('views', 'METRIC')] }),
        );
        expect(await execute(empty.source, BASE)).toMatchObject({
            rows: [],
            hasMoreRows: false,
        });
    });

    it('rejects a request that names its own channel or a bad field', async () => {
        const { source, send } = connect(jsonResponse(dailyReport));
        await expect(
            execute(source, { ...BASE, ids: 'channel==UCother' }),
        ).rejects.toThrow(ParameterError);
        await expect(
            execute(source, { ...BASE, filters: 'video==a&ids=x' }),
        ).rejects.toThrow('Invalid YouTube Analytics request');
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
            const { source, send } = connect(jsonResponse(videoRows(150)));
            const result = await execute(source, VIDEOS, 500);
            expect(send.mock.calls[0][0].query.maxResults).toBe('200');
            expect(result.rows).toHaveLength(150);
            expect(result.hasMoreRows).toBe(false);
        });

        it('refuses rather than cutting a channel with more than 200 videos', async () => {
            const { source } = connect(jsonResponse(videoRows(200)));
            await expect(execute(source, VIDEOS, 500)).rejects.toThrow(
                'more than 200 rows',
            );
        });

        it('returns a smaller top list and flags more rows', async () => {
            const { source } = connect(jsonResponse(videoRows(11)));
            const result = await execute(source, VIDEOS, 10);
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
        const { source } = connect(jsonResponse({ ...dailyReport, rows }));
        await expect(
            execute(source, { ...BASE, dimensions: 'day' }, 20_000),
        ).rejects.toThrow('more than 9,999 rows');
    });

    it.each([
        [400, WarehouseQueryError, 'The query is not supported'],
        [403, WarehouseConnectionError, `channel ${CHANNEL}`],
        [429, TooManyRequestsError, 'quota exceeded'],
    ])('maps a %s response', async (status, errorClass, message) => {
        const { source } = connect(
            jsonResponse(
                { error: { message: 'The query is not supported' } },
                status,
            ),
        );
        const result = execute(source, BASE);
        await expect(result).rejects.toBeInstanceOf(errorClass);
        await expect(result).rejects.toThrow(message);
    });
});
