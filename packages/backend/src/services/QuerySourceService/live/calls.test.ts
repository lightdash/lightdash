import { ApiConnectorType } from '@lightdash/common';
import { countLiveResponseRows } from './calls';

/**
 * One successful query response per integration, in the shape its `run`
 * reads, holding three rows. A new integration adds its own; one whose rows
 * sit elsewhere needs `countLiveResponseRows` taught where.
 */
const QUERY_RESPONSES: { [C in ApiConnectorType]: unknown[] } = {
    [ApiConnectorType.POSTHOG]: [
        {
            columns: ['a'],
            types: [['a', 'UInt64']],
            results: [[1], [2], [3]],
        },
    ],
    [ApiConnectorType.SEARCH_CONSOLE]: [{ rows: [{}, {}, {}] }],
    [ApiConnectorType.GA4]: [
        { dimensionHeaders: [{}], rows: [{}, {}, {}], rowCount: 40 },
    ],
    [ApiConnectorType.META_ADS]: [
        { data: [{}, {}, {}], paging: { cursors: { after: 'next' } } },
    ],
    [ApiConnectorType.GOOGLE_ADS]: [
        { results: [{}, {}, {}], fieldMask: 'campaign.name' },
    ],
    [ApiConnectorType.YOUTUBE_ANALYTICS]: [
        { columnHeaders: [{}, {}], rows: [[], [], []] },
    ],
    [ApiConnectorType.LINKEDIN_ADS]: [
        { elements: [{}, {}, {}], metadata: { nextPageToken: 'next' } },
    ],
    [ApiConnectorType.GITHUB]: [
        // Search, then contributor statistics
        { total_count: 40, items: [{}, {}, {}] },
        [{}, {}, {}],
    ],
    [ApiConnectorType.PYLON]: [
        { data: [{}, {}, {}], pagination: { has_next_page: true } },
    ],
    [ApiConnectorType.ATTIO]: [{ data: [{}, {}, {}] }],
};

describe('countLiveResponseRows', () => {
    it.each(Object.entries(QUERY_RESPONSES))(
        'counts the rows in every %s query response',
        (_connector, responses) => {
            responses.forEach((response) => {
                expect(
                    countLiveResponseRows({ status: 200, body: response }),
                ).toBe(3);
            });
        },
    );

    it('counts an empty page, or a report that leaves its rows out, as zero', () => {
        expect(countLiveResponseRows({ status: 200, body: { data: [] } })).toBe(
            0,
        );
        expect(countLiveResponseRows({ status: 200, body: [] })).toBe(0);
        expect(
            countLiveResponseRows({ status: 200, body: { rowCount: 0 } }),
        ).toBe(0);
        // GitHub answers 204 with no body for an empty repository
        expect(countLiveResponseRows({ status: 204, body: '' })).toBe(0);
    });

    it('is null for a response outside 2xx', () => {
        expect(
            countLiveResponseRows({
                status: 401,
                body: { detail: 'Invalid key', data: [] },
            }),
        ).toBeNull();
        expect(
            countLiveResponseRows({ status: 502, body: 'Bad gateway' }),
        ).toBeNull();
    });
});
