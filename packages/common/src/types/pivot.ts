import { FieldType } from './field';
import { ResultValue } from './results';

export type PivotConfig = {
    pivotDimensions: string[];
    metricsAsRows: boolean;
    columnOrder?: string[];
    hiddenMetricFieldIds?: string[];

    columnTotals?: boolean;
    rowTotals?: boolean;
};

type PTField =
    | { type: FieldType.METRIC; fieldId?: undefined }
    | { type: FieldType.DIMENSION; fieldId: string };

export type PTFieldLabel = {
    type: 'label';
    fieldId: string;
    value?: undefined;
};

export type PTTotalLabel = {
    type: 'total';
};

export type PTValue = {
    type: 'value';
    fieldId: string;
    value: ResultValue;
};

export type PTLabel = {
    titleDirection: 'index' | 'header';
};

export type PTTotalValue = Pick<ResultValue, 'raw'>;

export type PTTitleValue = PTFieldLabel & PTLabel;

export type PTTotalOrFieldLabel = PTLabel & (PTTotalLabel | PTFieldLabel);

export type PivotData = {
    headerValueTypes: PTField[];
    headerValues: (PTFieldLabel | PTValue)[][];

    indexValueTypes: PTField[];
    indexValues: (PTFieldLabel | PTValue)[][];

    dataColumnCount: number;
    dataValues: (ResultValue | null)[][];

    titleFields: (PTTitleValue | null)[][];

    rowTotalHeaders?: (PTTotalOrFieldLabel | null)[][];
    columnTotalHeaders?: (PTTotalOrFieldLabel | null)[][];

    rowTotals?: (PTTotalValue | null)[][];
    columnTotals?: (PTTotalValue | null)[][];

    pivotConfig: PivotConfig;
};
