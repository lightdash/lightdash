import { type MarkLineData, type PivotReference } from '@lightdash/common';

export type ReferenceLineField = {
    fieldId?: string;
    fieldRef?: PivotReference;
    data: MarkLineData;
};

export const getMarkLineAxis = (
    xField: string | undefined,
    flipAxes: boolean | undefined,
    fieldId: string,
): string => {
    const isDefaultXAxis = xField === fieldId;
    if (flipAxes) {
        return isDefaultXAxis ? 'yAxis' : 'xAxis';
    }
    return isDefaultXAxis ? 'xAxis' : 'yAxis';
};
