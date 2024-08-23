import {
    assertUnreachable,
    DbtDimensionType,
    DbtMetricType,
    DbtTimeGranularity,
    SemanticLayerFieldType,
    SemanticLayerTimeGranularity,
} from '@lightdash/common';

export function getSemanticLayerTypeFromDbtType(
    dbtType: DbtDimensionType | DbtMetricType,
): SemanticLayerFieldType {
    switch (dbtType) {
        case DbtDimensionType.CATEGORICAL:
            return SemanticLayerFieldType.STRING;
        case DbtDimensionType.TIME:
            return SemanticLayerFieldType.TIME;
        case DbtMetricType.CONVERSION:
        case DbtMetricType.CUMULATIVE:
        case DbtMetricType.RATIO:
        case DbtMetricType.DERIVED:
        case DbtMetricType.SIMPLE:
            return SemanticLayerFieldType.NUMBER;
        default:
            return assertUnreachable(dbtType, `Unknown dbt type: ${dbtType}`);
    }
}

export const getSemanticLayerTimeGranularity = (
    granularity: DbtTimeGranularity,
): SemanticLayerTimeGranularity => {
    switch (granularity) {
        case DbtTimeGranularity.NANOSECOND:
            return SemanticLayerTimeGranularity.NANOSECOND;
        case DbtTimeGranularity.MICROSECOND:
            return SemanticLayerTimeGranularity.MICROSECOND;
        case DbtTimeGranularity.MILLISECOND:
            return SemanticLayerTimeGranularity.MILLISECOND;
        case DbtTimeGranularity.SECOND:
            return SemanticLayerTimeGranularity.SECOND;
        case DbtTimeGranularity.MINUTE:
            return SemanticLayerTimeGranularity.MINUTE;
        case DbtTimeGranularity.HOUR:
            return SemanticLayerTimeGranularity.HOUR;
        case DbtTimeGranularity.DAY:
            return SemanticLayerTimeGranularity.DAY;
        case DbtTimeGranularity.WEEK:
            return SemanticLayerTimeGranularity.WEEK;
        case DbtTimeGranularity.MONTH:
            return SemanticLayerTimeGranularity.MONTH;
        case DbtTimeGranularity.QUARTER:
            return SemanticLayerTimeGranularity.QUARTER;
        case DbtTimeGranularity.YEAR:
            return SemanticLayerTimeGranularity.YEAR;
        default:
            return assertUnreachable(
                granularity,
                `Unknown dbt time granularity: ${granularity}`,
            );
    }
};

export const getDbtTimeGranularity = (
    granularity: SemanticLayerTimeGranularity,
) => {
    switch (granularity) {
        case SemanticLayerTimeGranularity.NANOSECOND:
            return DbtTimeGranularity.NANOSECOND;
        case SemanticLayerTimeGranularity.MICROSECOND:
            return DbtTimeGranularity.MICROSECOND;
        case SemanticLayerTimeGranularity.MILLISECOND:
            return DbtTimeGranularity.MILLISECOND;
        case SemanticLayerTimeGranularity.SECOND:
            return DbtTimeGranularity.SECOND;
        case SemanticLayerTimeGranularity.MINUTE:
            return DbtTimeGranularity.MINUTE;
        case SemanticLayerTimeGranularity.HOUR:
            return DbtTimeGranularity.HOUR;
        case SemanticLayerTimeGranularity.DAY:
            return DbtTimeGranularity.DAY;
        case SemanticLayerTimeGranularity.WEEK:
            return DbtTimeGranularity.WEEK;
        case SemanticLayerTimeGranularity.MONTH:
            return DbtTimeGranularity.MONTH;
        case SemanticLayerTimeGranularity.QUARTER:
            return DbtTimeGranularity.QUARTER;
        case SemanticLayerTimeGranularity.YEAR:
            return DbtTimeGranularity.YEAR;
        default:
            return assertUnreachable(
                granularity,
                `Unknown semantic layer time granularity: ${granularity}`,
            );
    }
};
