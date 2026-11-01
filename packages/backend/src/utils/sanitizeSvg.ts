import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Lazy so importing this module doesn't construct a jsdom window.
let svgPurifier: ReturnType<typeof createDOMPurify> | null = null;
const getSvgPurifier = (): ReturnType<typeof createDOMPurify> => {
    if (svgPurifier) return svgPurifier;
    const { window } = new JSDOM('');
    svgPurifier = createDOMPurify(window);
    return svgPurifier;
};

export const sanitizeSvg = (svgText: string): string =>
    getSvgPurifier().sanitize(svgText, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });
