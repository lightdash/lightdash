import { CompiledMetricQuery } from 'common';
import { CompileError } from './errors';
import { compileMetricQuery } from './queryCompiler';
import {
    EXPLORE,
    METRIC_QUERY_DUPLICATE_NAME,
    METRIC_QUERY_INVALID_REFERENCE_FORMAT,
    METRIC_QUERY_MISSING_REFERENCE,
    METRIC_QUERY_NO_CALCS,
    METRIC_QUERY_VALID_REFERENCES,
    METRIC_QUERY_VALID_REFERENCES_COMPILED,
    METRIC_QUERY_WITH_ADDITIONAL_METRICS,
    METRIC_QUERY_WITH_ADDITIONAL_METRICS_COMPILED,
    METRIC_QUERY_WITH_INVALID_ADDITIONAL_METRIC,
} from './queryCompiler.mock';

test('Should compile without table calculations', () => {
    const expected: CompiledMetricQuery = {
        ...METRIC_QUERY_NO_CALCS,
        compiledTableCalculations: [],
        compiledAdditionalMetrics: [],
    };
    expect(
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_NO_CALCS,
        }),
    ).toStrictEqual(expected);
});

test('Should compile table calculations', () => {
    expect(
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_VALID_REFERENCES,
        }),
    ).toStrictEqual(METRIC_QUERY_VALID_REFERENCES_COMPILED);
});

test('Should throw error when table calculation contains missing reference', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_MISSING_REFERENCE,
        }),
    ).toThrowError(CompileError);
});

test('Should throw error when table calculation has invalid reference format', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_INVALID_REFERENCE_FORMAT,
        }),
    ).toThrowError(CompileError);
});

test('Should throw error when table calculation has duplicate name', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_DUPLICATE_NAME,
        }),
    ).toThrowError(CompileError);
});

test('Should compile query with additional metrics', () => {
    expect(
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_WITH_ADDITIONAL_METRICS,
        }),
    ).toStrictEqual(METRIC_QUERY_WITH_ADDITIONAL_METRICS_COMPILED);
});

test('Should throw compile error if metric in non existent table', () => {
    expect(() =>
        compileMetricQuery({
            explore: EXPLORE,
            metricQuery: METRIC_QUERY_WITH_INVALID_ADDITIONAL_METRIC,
        }),
    ).toThrowError(CompileError);
});
