export interface VizConfiguration {
    libType: string; // echarts, vega
    vizType: string;
}

export interface CartesianConfig extends VizConfiguration {
    xField?: string;
    yFields?: string[];
    pivotFields?: string[];
}

export interface BarConfig extends CartesianConfig {
    vizType: 'bar';
}

export interface LineConfig extends CartesianConfig {
    vizType: 'line';
}

export interface TableConfig extends VizConfiguration {
    vizType: 'table';
    rows?: string[];
    columns?: string[];
}
