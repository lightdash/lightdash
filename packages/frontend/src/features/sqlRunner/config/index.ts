import {
    AggregationOptions,
    DimensionType,
    type SqlColumn,
} from '@lightdash/common';

enum XLayoutType {
    TIME = 'time',
    CATEGORY = 'category',
}

export type XLayoutOptions = {
    type: XLayoutType;
    reference: string;
};
export const getXLayoutOptions = (columns: SqlColumn[]): XLayoutOptions[] => {
    let options: XLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.DATE:
            case DimensionType.TIMESTAMP:
                options.push({
                    type: XLayoutType.TIME,
                    reference: column.reference,
                });
                break;
            case DimensionType.STRING:
            case DimensionType.NUMBER:
            case DimensionType.BOOLEAN:
                options.push({
                    type: XLayoutType.CATEGORY,
                    reference: column.reference,
                });
                break;
        }
    }
    return options;
};

export type YLayoutOptions = {
    columnId: string;
    aggregationOptions: AggregationOptions[];
};
export const getYLayoutOptions = (columns: SqlColumn[]): YLayoutOptions[] => {
    let options: YLayoutOptions[] = [];
    for (const column of columns) {
        switch (column.type) {
            case DimensionType.NUMBER:
                options.push({
                    columnId: column.reference,
                    aggregationOptions: [
                        AggregationOptions.PERCENTILE,
                        AggregationOptions.AVERAGE,
                        AggregationOptions.COUNT,
                        AggregationOptions.COUNT_DISTINCT,
                        AggregationOptions.SUM,
                        AggregationOptions.MIN,
                        AggregationOptions.MAX,
                        AggregationOptions.NUMBER,
                        AggregationOptions.MEDIAN,
                    ],
                });
                break;
            case DimensionType.STRING:
            case DimensionType.BOOLEAN:
                options.push({
                    columnId: column.reference,
                    aggregationOptions: [
                        AggregationOptions.COUNT,
                        AggregationOptions.COUNT_DISTINCT,
                    ],
                });
                break;
        }
    }
    return options;
};
