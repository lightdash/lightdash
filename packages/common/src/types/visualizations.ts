export type BarChartConfig = {
    metadata: {
        version: number;
    };
    // TODO: There was some back and forth about whether this should be 'defaultType'
    // I'm not sure
    type: 'barChart';
    style: {
        legend:
            | {
                  position: 'top' | 'bottom' | 'left' | 'right';
                  align: 'start' | 'center' | 'end';
              }
            | undefined;
    };
    axis: {
        x: {
            reference: string;
            label: string;
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
