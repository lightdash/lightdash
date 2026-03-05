import { AnyType } from '@lightdash/common';
import { createCanvas } from 'canvas';
import * as echarts from 'echarts';

export const renderEcharts = async (eChartOptions: AnyType) => {
    const canvas = createCanvas(800, 600);
    // @ts-expect-error node-canvas Canvas is not a DOM HTMLElement but works with echarts
    const chart = echarts.init(canvas, null, {
        renderer: 'canvas',
        devicePixelRatio: 2,
    });
    chart.setOption(eChartOptions);
    return canvas.toBuffer('image/png');
};
