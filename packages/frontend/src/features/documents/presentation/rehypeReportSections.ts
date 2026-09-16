import type { Element, Root } from 'hast';

const getText = (node: Element['children'][number]): string =>
    node.type === 'text'
        ? node.value
        : node.type === 'element'
          ? node.children.map(getText).join('')
          : '';

const rehypeReportSections = () => (root: Root) => {
    const sections: Element[] = [];
    for (const node of root.children) {
        if (
            sections.length === 0 &&
            node.type === 'text' &&
            !node.value.trim()
        ) {
            continue;
        }
        const isHeading =
            node.type === 'element' &&
            (node.tagName === 'h1' || node.tagName === 'h2');
        if (isHeading || sections.length === 0) {
            sections.push({
                type: 'element',
                tagName: isHeading ? 'report-section' : 'report-introduction',
                properties: {},
                children: [],
            });
        }
        const section = sections.at(-1);
        if (section && node.type !== 'doctype') {
            section.children.push(node);
        }
    }
    const lastSection = sections.at(-1);
    const lastHeading = lastSection?.children[0];
    if (
        lastSection?.tagName === 'report-section' &&
        lastHeading &&
        getText(lastHeading).trim().toLowerCase() === 'conclusion'
    ) {
        lastSection.tagName = 'report-conclusion';
    }
    for (const section of sections) {
        if (section.tagName !== 'report-introduction') {
            const [heading, ...body] = section.children;
            section.children = [
                heading,
                {
                    type: 'element',
                    tagName: 'report-narrative',
                    properties: {},
                    children: body,
                },
            ];
        }
    }
    root.children = sections;
};

export default rehypeReportSections;
