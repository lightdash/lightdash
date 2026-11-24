import {
    ExploreType,
    SupportedDbtAdapter,
    WeekDay,
    type Explore,
} from '@lightdash/common';
import { enhanceExploresForPreAggregates } from './enhanceExploresForPreAggregates';
import { generatePreAggregateExplores } from './generatePreAggregateExplores';

vi.mock('./generatePreAggregateExplores', () => ({
    generatePreAggregateExplores: vi.fn(
        ({ compiledExplores }) => compiledExplores,
    ),
}));

const source = (name: string): Explore => ({
    name,
    label: name,
    baseTable: name,
    tags: [],
    joinedTables: [],
    tables: {},
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    preAggregates: [{ name: 'summary', dimensions: [], metrics: [] }],
});

describe('pre-aggregate connection week starts', () => {
    it('passes each source connection week start, including an explicit default', () => {
        vi.mocked(generatePreAggregateExplores).mockClear();
        const explores = [
            source('postgres'),
            source('trino'),
            source('default'),
        ];
        enhanceExploresForPreAggregates({
            explores,
            enabled: true,
            startOfWeek: WeekDay.SUNDAY,
            startOfWeekByExplore: new Map([
                ['postgres', WeekDay.MONDAY],
                ['trino', WeekDay.WEDNESDAY],
                ['default', null],
            ]),
        });
        expect(
            vi
                .mocked(generatePreAggregateExplores)
                .mock.calls.map(([args]) => args.startOfWeek),
        ).toEqual([WeekDay.MONDAY, WeekDay.WEDNESDAY, null]);
    });
});

describe('pre-aggregates on live explores', () => {
    it('drops them with a warning instead of generating explores', () => {
        vi.mocked(generatePreAggregateExplores).mockClear();
        const [explore, ...rest] = enhanceExploresForPreAggregates({
            explores: [{ ...source('ga4'), type: ExploreType.API_SOURCE }],
            enabled: true,
            startOfWeek: null,
        });
        expect(rest).toEqual([]);
        expect(generatePreAggregateExplores).not.toHaveBeenCalled();
        expect(explore).toMatchObject({
            preAggregates: [],
            warnings: [
                {
                    message: expect.stringContaining(
                        "Pre-aggregates aren't supported on live explores",
                    ),
                },
            ],
        });
    });
});
