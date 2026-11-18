import {
    attachNativeMaterializationDocument,
    getNativeMaterializationDocument,
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

it('preserves the opt-out on the source when pre-aggregates replace its explore', () => {
    const orders = source('orders');
    const document = { name: 'orders', content: null };
    attachNativeMaterializationDocument(orders, document);
    vi.mocked(generatePreAggregateExplores).mockReturnValueOnce([
        { ...orders },
        source('summary'),
    ]);
    const enhanced = enhanceExploresForPreAggregates({
        explores: [orders],
        enabled: true,
        startOfWeek: null,
    });
    expect(enhanced.map(getNativeMaterializationDocument)).toEqual([
        document,
        null,
    ]);
});
