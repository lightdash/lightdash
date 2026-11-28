import { describe, expect, it } from 'vitest';
import { CHART_SLOT_ATTRIBUTE, liftCharts } from './chartPictures';
import { CAPTURE_IGNORE_ATTRIBUTE } from './frameSource';

const sized = (element: Element, width: number, height: number) => {
    element.getBoundingClientRect = () => new DOMRect(0, 0, width, height);
};

const chartIn = (host: HTMLElement): SVGSVGElement => {
    host.innerHTML = `
        <div _echarts_instance_="ec_1">
            <div><span>before</span><svg width="100" height="50"><rect width="10" height="10"></rect></svg></div>
        </div>`;
    const svg = host.querySelector('svg')!;
    sized(svg, 100, 50);
    return svg;
};

const copyWithout = (svg: Element): Document => {
    const copy = document.implementation.createHTMLDocument('copy');
    copy.body.innerHTML = document.body.innerHTML;
    copy.querySelector('svg')?.remove();
    expect(svg.isConnected).toBe(true);
    return copy;
};

describe('liftCharts', () => {
    it('leaves a chart out of the drawing and puts its picture in its place', async () => {
        const svg = chartIn(document.body);
        const charts = liftCharts(document, () => true);
        expect(charts.isLifted(svg)).toBe(true);
        expect(charts.isLifted(svg.parentElement!)).toBe(false);

        const copy = copyWithout(svg);
        await charts.placeIn(copy);
        const image = copy.querySelector('img')!;
        expect(image.src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        expect(decodeURIComponent(image.src)).toContain('<rect');
        expect(image.style.width).toBe('100px');
        expect(image.style.height).toBe('50px');
        // Where the chart was: after the element that came before it.
        expect(image.previousElementSibling?.textContent).toBe('before');

        charts.release();
        expect(document.querySelector(`[${CHART_SLOT_ATTRIBUTE}]`)).toBeNull();
    });

    it('draws nothing for a chart that is out of view', async () => {
        const svg = chartIn(document.body);
        const charts = liftCharts(document, () => false);
        expect(charts.isLifted(svg)).toBe(true);
        expect(document.querySelector(`[${CHART_SLOT_ATTRIBUTE}]`)).toBeNull();
        const copy = copyWithout(svg);
        await charts.placeIn(copy);
        expect(copy.querySelector('img')).toBeNull();
    });

    it('leaves alone a chart the picture already ignores', () => {
        const svg = chartIn(document.body);
        document.body.firstElementChild!.setAttribute(
            CAPTURE_IGNORE_ATTRIBUTE,
            '',
        );
        const charts = liftCharts(document, () => true);
        expect(charts.isLifted(svg)).toBe(false);
    });

    it('leaves an icon alone', () => {
        document.body.innerHTML = '<button><svg><path></path></svg></button>';
        const charts = liftCharts(document, () => true);
        expect(charts.isLifted(document.querySelector('svg')!)).toBe(false);
    });
});
