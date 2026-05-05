import {
    FieldReferenceError,
    NotEnoughResults,
    ThresholdOperator,
} from '@lightdash/common';
import SchedulerTask from './SchedulerTask';
import {
    resultsWithOneRow,
    resultsWithTwoDecreasingRows,
    resultsWithTwoIncreasingRows,
    thresholdIncreasedByMock,
    thresholdLessThanMock,
} from './SchedulerTask.mock';

describe('isPositiveThresholdAlert', () => {
    it('should return false if there are no results or no thresholds', () => {
        expect(
            SchedulerTask.isPositiveThresholdAlert([thresholdLessThanMock], []),
        ).toBe(false);

        expect(
            SchedulerTask.isPositiveThresholdAlert([], resultsWithOneRow),
        ).toBe(false);
    });
    it('should throw error if operation requires second row but there isnt one', () => {
        expect(() =>
            SchedulerTask.isPositiveThresholdAlert(
                [thresholdIncreasedByMock],
                resultsWithOneRow,
            ),
        ).toThrowError(NotEnoughResults);
    });
    it('should return true if condition match', () => {
        expect(
            SchedulerTask.isPositiveThresholdAlert(
                [thresholdLessThanMock],
                resultsWithOneRow,
            ),
        ).toBe(true);
    });

    it('should test threshold INCREASED_BY', () => {
        const increasedByRevenue = (value: number) => [
            {
                operator: ThresholdOperator.INCREASED_BY,
                fieldId: 'revenue',
                value,
            },
        ];

        const lowValues = [0.1, 1, 2, 5, 8, 9]; // From 0.1% to 9%
        lowValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    increasedByRevenue(value),
                    resultsWithTwoIncreasingRows,
                ),
            ).toBe(true);
        });
        const highValues = [10, 10.1, 15, 50, 100]; // From 10% to 100%
        highValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    increasedByRevenue(value),
                    resultsWithTwoIncreasingRows,
                ),
            ).toBe(false);
        });

        // Test decrease

        expect(
            SchedulerTask.isPositiveThresholdAlert(
                increasedByRevenue(0.05),
                resultsWithTwoDecreasingRows,
            ),
        ).toBe(false);
        expect(
            SchedulerTask.isPositiveThresholdAlert(
                increasedByRevenue(0.8),
                resultsWithTwoDecreasingRows,
            ),
        ).toBe(false);
    });
    it('should test threshold DECREASED_BY', () => {
        const decreasedByRevenue = (value: number) => [
            {
                operator: ThresholdOperator.DECREASED_BY,
                fieldId: 'revenue',
                value,
            },
        ];

        const lowValues = [0.1, 1, 2, 5, 8, 9]; // From 0.1% to 9%
        lowValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    decreasedByRevenue(value),
                    resultsWithTwoDecreasingRows,
                ),
            ).toBe(true);
        });
        const highValues = [10, 10.1, 15, 50, 100]; // From 10% to 100%
        highValues.forEach((value) => {
            expect(
                SchedulerTask.isPositiveThresholdAlert(
                    decreasedByRevenue(value),
                    resultsWithTwoDecreasingRows,
                ),
            ).toBe(false);
        });
    });
});

describe('evaluateThreshold', () => {
    it('should return diagnostic fields when GREATER_THAN is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.GREATER_THAN,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.GREATER_THAN,
            thresholdValue: 50,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return diagnostic fields when GREATER_THAN is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.GREATER_THAN,
                    fieldId: 'm',
                    value: 200,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.GREATER_THAN,
            thresholdValue: 200,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return diagnostic fields when LESS_THAN is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.LESS_THAN,
                    fieldId: 'm',
                    value: 200,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.LESS_THAN,
            thresholdValue: 200,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return diagnostic fields when LESS_THAN is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.LESS_THAN,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.LESS_THAN,
            thresholdValue: 50,
            rowCount: 1,
            evaluatedRawValue: 100,
            evaluatedParsedValue: 100,
        });
        expect(result.previousRawValue).toBeUndefined();
        expect(result.previousParsedValue).toBeUndefined();
    });

    it('should return previous values when INCREASED_BY is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.INCREASED_BY,
                    fieldId: 'm',
                    value: 10,
                },
            ],
            [{ m: 120 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.INCREASED_BY,
            thresholdValue: 10,
            rowCount: 2,
            evaluatedRawValue: 120,
            evaluatedParsedValue: 120,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return previous values when INCREASED_BY is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.INCREASED_BY,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 120 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.INCREASED_BY,
            thresholdValue: 50,
            rowCount: 2,
            evaluatedRawValue: 120,
            evaluatedParsedValue: 120,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return previous values when DECREASED_BY is met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.DECREASED_BY,
                    fieldId: 'm',
                    value: 10,
                },
            ],
            [{ m: 50 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: true,
            fieldId: 'm',
            operator: ThresholdOperator.DECREASED_BY,
            thresholdValue: 10,
            rowCount: 2,
            evaluatedRawValue: 50,
            evaluatedParsedValue: 50,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return previous values when DECREASED_BY is not met', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.DECREASED_BY,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [{ m: 90 }, { m: 100 }],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.DECREASED_BY,
            thresholdValue: 50,
            rowCount: 2,
            evaluatedRawValue: 90,
            evaluatedParsedValue: 90,
            previousRawValue: 100,
            previousParsedValue: 100,
        });
    });

    it('should return diagnostic fields when results are empty', () => {
        const result = SchedulerTask.evaluateThreshold(
            [
                {
                    operator: ThresholdOperator.GREATER_THAN,
                    fieldId: 'm',
                    value: 50,
                },
            ],
            [],
        );
        expect(result).toMatchObject({
            met: false,
            fieldId: 'm',
            operator: ThresholdOperator.GREATER_THAN,
            thresholdValue: 50,
            rowCount: 0,
            evaluatedRawValue: undefined,
            evaluatedParsedValue: null,
        });
    });

    it('should return null diagnostic fields when thresholds are empty', () => {
        const result = SchedulerTask.evaluateThreshold([], [{ m: 100 }]);
        expect(result).toMatchObject({
            met: false,
            fieldId: null,
            operator: null,
            thresholdValue: null,
            rowCount: 1,
            evaluatedRawValue: undefined,
            evaluatedParsedValue: null,
        });
    });

    it('should throw NotEnoughResults when INCREASED_BY has only one row', () => {
        expect(() =>
            SchedulerTask.evaluateThreshold(
                [
                    {
                        operator: ThresholdOperator.INCREASED_BY,
                        fieldId: 'm',
                        value: 5,
                    },
                ],
                [{ m: 100 }],
            ),
        ).toThrow(NotEnoughResults);
    });

    it('should throw NotEnoughResults when DECREASED_BY has only one row', () => {
        expect(() =>
            SchedulerTask.evaluateThreshold(
                [
                    {
                        operator: ThresholdOperator.DECREASED_BY,
                        fieldId: 'm',
                        value: 5,
                    },
                ],
                [{ m: 100 }],
            ),
        ).toThrow(NotEnoughResults);
    });

    it('should throw FieldReferenceError when fieldId is unknown', () => {
        expect(() =>
            SchedulerTask.evaluateThreshold(
                [
                    {
                        operator: ThresholdOperator.GREATER_THAN,
                        fieldId: 'unknown',
                        value: 5,
                    },
                ],
                [{ m: 100 }],
            ),
        ).toThrow(FieldReferenceError);
    });
});
