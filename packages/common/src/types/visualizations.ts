export type BarChartConfig = {
    metadata: {
        version: number;
    };
    style: {
        legend:
            | {
                  position: 'top' | 'bottom' | 'left' | 'right';
                  align: 'start' | 'center' | 'end';
              }
            | undefined;
    };
    axes: {
        x: {
            reference?: string;
            label?: string;
        };
        y: {
            reference: string;
            position: 'left' | 'right';
            label: string;
        }[];
    };
    series: {
        reference: string;
        yIndex: number;
    }[];
};

export type TableChartSqlConfig = {
    columns: Record<
        string,
        {
            visible: boolean;
            reference: string;
            label: string;
            frozen: boolean;
            order?: number;
        }
    >;
};
