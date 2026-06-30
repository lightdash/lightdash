import {
    DimensionType,
    FieldType,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import { getGetMetadata } from './getMetadata';

// A description that enumerates valid filter values, longer than the old 240
// cap. This is the exact pattern that used to be silently cut off, leaving the
// agent unable to see (and therefore filter on) the later values.
const longDescription = `Allowed values: ${Array.from(
    { length: 40 },
    (_, i) => `'value_${i}'`,
).join(', ')}.`;

const makeExplore = (overrides: {
    baseTableDescription?: string;
    fieldDescription?: string;
}): Explore => ({
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'sales',
    label: 'Sales',
    tags: [],
    spotlight: { visibility: 'show', categories: [] },
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'test_db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            description: overrides.baseTableDescription,
            dimensions: {
                status: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.status',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.status',
                    tablesReferences: ['orders'],
                    description: overrides.fieldDescription,
                },
            },
            metrics: {},
            lineageGraph: {},
        },
    },
});

type ExecuteResult = { result: string; metadata: { status: string } };

const execute = async (
    explore: Explore,
    requests: Parameters<
        NonNullable<ReturnType<typeof getGetMetadata>['execute']>
    >[0]['requests'],
): Promise<ExecuteResult> => {
    const tool = getGetMetadata({ availableExplores: [explore] });
    const result = await tool.execute!(
        { requests },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
    );
    return result as ExecuteResult;
};

describe('getMetadata description truncation', () => {
    it('returns a long field description in full (above the old 240 cap)', async () => {
        expect(longDescription.length).toBeGreaterThan(240);

        const explore = makeExplore({ fieldDescription: longDescription });
        const result = await execute(explore, [
            {
                type: 'field',
                fields: [{ exploreId: 'sales', fieldId: 'orders_status' }],
            },
        ]);

        expect(result.metadata).toEqual({ status: 'success' });
        // The full enumerated list must be present — including the last value,
        // which the old 240-char cap dropped.
        expect(result.result).toContain(`description: ${longDescription}`);
        expect(result.result).toContain("'value_39'");
    });

    it('keeps the explore-level summary terse (caps the base table description)', async () => {
        const explore = makeExplore({ baseTableDescription: longDescription });
        const result = await execute(explore, [
            { type: 'explore', exploreIds: ['sales'] },
        ]);

        expect(result.metadata).toEqual({ status: 'success' });
        const descriptionLine = result.result
            .split('\n')
            .find((line) => line.includes('description:'));
        expect(descriptionLine).toBeDefined();
        // Explore summaries stay compact: the description is capped at 240 chars.
        expect(descriptionLine).not.toContain("'value_39'");
    });
});
