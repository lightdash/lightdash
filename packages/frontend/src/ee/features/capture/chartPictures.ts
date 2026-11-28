import { CAPTURE_IGNORE_ATTRIBUTE } from './frameSource';

// A chart drawn as SVG. Drawing the page copies every style of every node of
// one, which is most of the time a picture takes.
const CHART_SELECTOR = '[_echarts_instance_] svg';
/** Marks where a lifted chart goes back, on the page and on its copy. */
export const CHART_SLOT_ATTRIBUTE = 'data-capture-chart-slot';

type Lifted = {
    slot: string;
    /** How many elements come before the chart in its parent. */
    index: number;
    url: string;
    width: number;
    height: number;
    position: string;
    left: string;
    top: string;
};

export type LiftedCharts = {
    /** True for a chart the page drawing leaves out. */
    isLifted: (element: Element) => boolean;
    /** Puts each chart's own picture where it was, in the page's copy. */
    placeIn: (copy: Document) => Promise<void>;
    /** Takes the slot marks off the page again. */
    release: () => void;
};

const pictureUrl = (svg: SVGSVGElement): string =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        new XMLSerializer().serializeToString(svg),
    )}`;

/**
 * Takes the SVG charts out of the page drawing. Each one in view is turned
 * into a picture of itself instead, which costs almost nothing.
 */
export const liftCharts = (
    page: Document,
    inView: (element: Element) => boolean,
): LiftedCharts => {
    const charts = new Set<Element>();
    const slots: Element[] = [];
    const lifted: Lifted[] = [];
    page.querySelectorAll<SVGSVGElement>(CHART_SELECTOR).forEach((svg) => {
        const parent = svg.parentElement;
        if (!parent || parent.closest('svg')) return;
        if (svg.closest(`[${CAPTURE_IGNORE_ATTRIBUTE}]`)) return;
        // One chart to a slot: a second one is drawn with the page.
        if (parent.hasAttribute(CHART_SLOT_ATTRIBUTE)) return;
        charts.add(svg);
        if (!inView(svg)) return;
        const box = svg.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return;
        const style = getComputedStyle(svg);
        const slot = String(lifted.length);
        parent.setAttribute(CHART_SLOT_ATTRIBUTE, slot);
        slots.push(parent);
        lifted.push({
            slot,
            index: [...parent.children].indexOf(svg),
            url: pictureUrl(svg),
            width: box.width,
            height: box.height,
            position: style.position,
            left: style.left,
            top: style.top,
        });
    });
    return {
        isLifted: (element) => charts.has(element),
        placeIn: async (copy) => {
            const images = lifted.flatMap((chart) => {
                const parent = copy.querySelector(
                    `[${CHART_SLOT_ATTRIBUTE}="${chart.slot}"]`,
                );
                if (!parent) return [];
                const image = copy.createElement('img');
                image.width = chart.width;
                image.height = chart.height;
                image.style.display = 'block';
                image.style.position = chart.position;
                image.style.left = chart.left;
                image.style.top = chart.top;
                image.style.width = `${chart.width}px`;
                image.style.height = `${chart.height}px`;
                image.style.maxWidth = 'none';
                image.src = chart.url;
                parent.insertBefore(
                    image,
                    parent.children[chart.index] ?? null,
                );
                return [image];
            });
            // The drawing skips a picture whose size it cannot read yet.
            await Promise.all(
                images.map((image) =>
                    Promise.resolve()
                        .then(() => image.decode())
                        .catch(() => undefined),
                ),
            );
        },
        release: () =>
            slots.forEach((slot) => slot.removeAttribute(CHART_SLOT_ATTRIBUTE)),
    };
};
