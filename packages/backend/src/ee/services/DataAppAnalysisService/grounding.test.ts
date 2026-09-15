import { anomalyId, groundAnomalies, type GroundingSource } from './grounding';

const source: GroundingSource = {
    queryUuid: 'q1',
    fieldIds: new Set(['orders_status', 'orders_total']),
    rows: [
        {
            orders_status: new Set(['completed']),
            orders_total: new Set(['1594', '1,594']),
        },
        {
            orders_status: new Set(['returned']),
            orders_total: new Set(['12']),
        },
    ],
};

const anomaly = {
    severity: 'high' as const,
    text: 'Returned orders are up',
    queryUuid: 'q1',
    fieldId: 'orders_total',
    dimensionValues: { orders_status: 'returned' },
    expected: null,
    actual: '12',
};

describe('groundAnomalies', () => {
    it('keeps an anomaly whose query, field and row all exist', () => {
        const result = groundAnomalies([anomaly], [source]);
        expect(result.droppedCount).toBe(0);
        expect(result.anomalies).toHaveLength(1);
        expect(result.anomalies[0].id).toBe(anomalyId(anomaly));
    });

    it('matches formatted values the model copied from the CSV', () => {
        const result = groundAnomalies(
            [
                {
                    ...anomaly,
                    dimensionValues: { orders_total: '1,594' },
                    fieldId: 'orders_status',
                },
            ],
            [source],
        );
        expect(result.anomalies).toHaveLength(1);
    });

    it('keeps a table-level anomaly with no dimension values', () => {
        const result = groundAnomalies(
            [{ ...anomaly, dimensionValues: {} }],
            [source],
        );
        expect(result.anomalies).toHaveLength(1);
    });

    it.each([
        ['unknown query', { ...anomaly, queryUuid: 'nope' }],
        ['unknown field', { ...anomaly, fieldId: 'orders_margin' }],
        [
            'unknown dimension field',
            { ...anomaly, dimensionValues: { orders_region: 'north' } },
        ],
        [
            'value matching no row',
            { ...anomaly, dimensionValues: { orders_status: 'shipped' } },
        ],
    ])('drops an anomaly with an %s', (_label, ungrounded) => {
        const result = groundAnomalies([ungrounded], [source]);
        expect(result.anomalies).toHaveLength(0);
        expect(result.droppedCount).toBe(1);
    });

    it('gives the same id regardless of dimension key order', () => {
        const a = anomalyId({
            queryUuid: 'q1',
            fieldId: 'f',
            text: 'x',
            dimensionValues: { a: '1', b: '2' },
        });
        const b = anomalyId({
            queryUuid: 'q1',
            fieldId: 'f',
            text: 'y',
            dimensionValues: { b: '2', a: '1' },
        });
        expect(a).toBe(b);
    });

    it('keys table-level findings on their text so two on one metric differ', () => {
        const base = { queryUuid: 'q1', fieldId: 'f', dimensionValues: {} };
        expect(anomalyId({ ...base, text: 'peak on Jan 3' })).not.toBe(
            anomalyId({ ...base, text: 'peak on Jan 23' }),
        );
    });

    it('collapses duplicate findings to one', () => {
        const result = groundAnomalies([anomaly, { ...anomaly }], [source]);
        expect(result.anomalies).toHaveLength(1);
        expect(result.droppedCount).toBe(0);
    });
});
