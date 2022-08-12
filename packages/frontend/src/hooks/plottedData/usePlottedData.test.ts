import { getPivotedData } from './usePlottedData';
import {
    EXPECTED_PIVOT_RESULTS_WITH_ALL_DIMENSIONS,
    EXPECTED_PIVOT_RESULTS_WITH_SOME_DIMENSIONS,
    EXPECTED_SIMPLE_PIVOT_RESULTS,
    RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS,
    RESULTS_FOR_SIMPLE_PIVOT,
} from './usePlottedData.mock';

describe('usePlottedData', () => {
    it('should pivot data with 1 dimension and 1 metric', () => {
        expect(
            getPivotedData(
                RESULTS_FOR_SIMPLE_PIVOT,
                'dim2',
                ['metric1'],
                ['dim1'],
            ),
        ).toEqual(EXPECTED_SIMPLE_PIVOT_RESULTS);
    });
    it('should pivot data with all dimension and 1 metric', () => {
        expect(
            getPivotedData(
                RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS,
                'dim3',
                ['metric1'],
                ['dim1', 'dim2'],
            ),
        ).toEqual(EXPECTED_PIVOT_RESULTS_WITH_ALL_DIMENSIONS);
    });
    it('should pivot data with some dimension and 1 metric', () => {
        expect(
            getPivotedData(
                RESULTS_FOR_PIVOT_WITH_MULTIPLE_DIMENSIONS,
                'dim3',
                ['metric1'],
                ['dim1'],
            ),
        ).toEqual(EXPECTED_PIVOT_RESULTS_WITH_SOME_DIMENSIONS);
    });
});
