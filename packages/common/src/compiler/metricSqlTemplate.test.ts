import { type CompiledMetricSqlTemplate } from '../types/field';
import { FilterOperator, UnitOfTime } from '../types/filter';
import { transformMetricSqlTemplate } from './metricSqlTemplate';

const slot: CompiledMetricSqlTemplate[number] = {
    type: 'filter',
    metricId: 'orders_recent',
    position: 0,
    fieldId: 'orders_created_at',
    filter: {
        id: 'filter',
        operator: FilterOperator.IN_THE_PAST,
        target: { fieldRef: 'created_at' },
        values: [7],
        settings: { unitOfTime: UnitOfTime.days },
    },
    compiledSql: "created_at >= '2026-09-01'",
};

test('warehouse wrapping preserves duplicate slots and authored identical SQL', () => {
    const template: CompiledMetricSqlTemplate = [
        { type: 'sql', sql: "CASE WHEN created_at >= '2026-09-01' AND " },
        slot,
        { type: 'sql', sql: ' THEN amount END' },
    ];
    const wrapped = transformMetricSqlTemplate(
        template,
        (sql) => `SUM(${sql}) + SUM(${sql})`,
    );
    expect(wrapped.filter((part) => part.type === 'filter')).toEqual([
        slot,
        slot,
    ]);
    expect(
        wrapped
            .filter((part) => part.type === 'sql')
            .map((part) => part.sql)
            .join(''),
    ).toContain("CASE WHEN created_at >= '2026-09-01' AND ");
});

test('internal tokens cannot collide with authored SQL', () => {
    const literal = '__lightdash_metric_filter_1__';
    const template: CompiledMetricSqlTemplate = [
        { type: 'sql', sql: `${literal} AND ` },
        slot,
    ];
    const wrapped = transformMetricSqlTemplate(
        template,
        (sql) => `COUNT(${sql})`,
    );
    expect(wrapped).toEqual([
        { type: 'sql', sql: `COUNT(${literal} AND ` },
        slot,
        { type: 'sql', sql: ')' },
    ]);
});
