import { getPivotedFieldKey, parsePivotedFieldKey } from './savedCharts';
import { PIVOT_KEYS } from './savedCharts.mock';

describe('Escape and parse pivot keys', () => {
    it.each(Object.entries(PIVOT_KEYS))(
        'should generate key %s from values %j and parse the key back to same values',
        (key, values) => {
            const pivotFieldKey = getPivotedFieldKey(...values);
            expect(pivotFieldKey).toEqual(key);
            expect(parsePivotedFieldKey(pivotFieldKey)).toEqual(values);
        },
    );
});
