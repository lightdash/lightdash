import { AnyType } from '@lightdash/common';
import { createCanvas } from 'canvas';
import * as echarts from 'echarts';

export const renderEcharts = async (eChartOptions: AnyType) => {
    const canvas = createCanvas(800, 600);
    // @ts-ignore
    const chart = echarts.init(canvas, null, {
        renderer: 'canvas',
        devicePixelRatio: 2,
    });
    chart.setOption(eChartOptions);
    return canvas.toBuffer('image/png');
};
