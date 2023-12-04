import { isField } from '../types/field';
import { getFieldsFromMetricQuery } from './fields';
import { explore, metricQuery } from './fields.mock';

describe('getFieldsFromMetricQuery', () => {
    test('should return all valid fields', async () => {
        const result = getFieldsFromMetricQuery(metricQuery, explore);
        expect(Object.keys(result)).toEqual([
            'table1_dim1',
            'table1_metric1',
            'calc2',
            'custom_dimension_1',
            'table1_additional_metric_1',
        ]);

        // Check a few types of items

        expect(isField(result.table1_metric1)).toEqual(true);

        expect(
            isField(result.table1_metric1) && result.table1_metric1.fieldType,
        ).toEqual('metric');
        expect(
            isField(result.table1_metric1) && result.table1_metric1.type,
        ).toEqual('average');
    });
});
