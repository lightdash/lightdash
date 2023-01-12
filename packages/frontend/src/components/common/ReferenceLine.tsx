import { MarkLineData } from '@lightdash/common';

export type ReferenceLineField = {
    fieldId?: string;
    data: MarkLineData;
};

export const getMarkLineAxis = (
    xField: string | undefined,
    flipAxes: boolean,
    fieldId: string,
): string => {
    const reverseFlippedAxis = (defaultAxis: string) => {
        if (flipAxes) return defaultAxis === 'xAxis' ? 'yAxis' : 'xAxis';
        return defaultAxis;
    };

    return reverseFlippedAxis(xField === fieldId ? 'xAxis' : 'yAxis');
};
