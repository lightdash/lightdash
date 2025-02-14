export const chartConfigs = (chartInstance: any) => {
    const isPieChat = chartInstance._chartsViews.some(
        (view: { constructor: { name: string } }) =>
            view.constructor.name === 'PieView2',
    );
    if (!isPieChat) {
        const svgBase64 = chartInstance.getDataURL();
        const width = chartInstance.getWidth();
        const height = chartInstance.getHeight();
        return { svgBase64, width, height };
    } else {
        const dataHeader = 'data:image/svg+xml;charset=utf-8';

        const serializeAsXML = ($e: Node) =>
            new XMLSerializer().serializeToString($e);

        const encodeAsUTF8 = (s: string | number | boolean) =>
            `${dataHeader},${encodeURIComponent(s)}`;

        const $svg = chartInstance.getDom().querySelector('svg');

        const svgData = encodeAsUTF8(serializeAsXML($svg));

        const getSvgDimensions = (): { width: number; height: number } => {
            const widthAttr = $svg.getAttribute('width');
            const heightAttr = $svg.getAttribute('height');

            if (widthAttr && heightAttr) {
                const width = parseFloat(widthAttr);
                const height = parseFloat(heightAttr);
                if (!isNaN(width) && !isNaN(height)) {
                    return { width, height };
                }
            }

            const viewBox = $svg.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(/[\s,]+/).map(Number);
                if (parts.length >= 4 && !parts.some(isNaN)) {
                    return { width: parts[2], height: parts[3] };
                }
            }

            return {
                width: $svg.clientWidth,
                height: $svg.clientHeight,
            };
        };
        const svgBase64 = svgData;
        const { width, height } = getSvgDimensions();
        return { svgBase64, width, height };
    }
};
