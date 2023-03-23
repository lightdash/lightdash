type ValueType = {
    type: 'dimension' | 'metrics';
    field?: string;
};

type ColumnType = {
    type: 'dimensionIndex' | 'metricIndex' | 'value';
    field?: string;
    freeze?: boolean;
};

type FormatterFunction = (val: any) => string;
type StyleFunction = (val: any) => object;

interface Dimension {
    label: string;
    valueFormatter?: FormatterFunction;
    styleFormatter?: StyleFunction;
    visible: boolean;
}

interface Metric {
    label: string;
    valueFormatter?: FormatterFunction;
    styleFormatter?: StyleFunction;
    visible: boolean;
}

export interface PivotData {
    dimensions: Record<string, Dimension>;
    metrics: Record<string, Metric>;
    headerValueTypes: ValueType[];
    headerValues: (string | number)[][];
    columnTypes: ColumnType[];
    rowValues: (string | number)[][];
    columnTotals?: (string | number | null)[];
    rowTotals?: (string | number | null)[];
}
