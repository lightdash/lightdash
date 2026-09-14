import remarkParse from 'remark-parse';
import { unified } from 'unified';

export type DeepResearchReportHeading = {
    id: string;
    value: string;
    depth: number;
};

const markdownParser = unified().use(remarkParse);

const getMarkdownNodeText = (node: unknown): string => {
    if (!node || typeof node !== 'object') return '';

    if (
        'type' in node &&
        (node.type === 'text' || node.type === 'inlineCode') &&
        'value' in node &&
        typeof node.value === 'string'
    ) {
        return node.value;
    }

    if (
        'type' in node &&
        node.type === 'image' &&
        'alt' in node &&
        typeof node.alt === 'string'
    ) {
        return node.alt;
    }

    if ('children' in node && Array.isArray(node.children)) {
        return node.children.map(getMarkdownNodeText).join('');
    }

    return '';
};

const getDeepResearchReportHeadingId = (
    title: string,
    index: number,
): string => {
    const slug = title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 56);

    return `report-${slug || 'section'}-${index + 1}`;
};

export const getDeepResearchReportHeadings = (
    markdown: string,
): DeepResearchReportHeading[] =>
    markdownParser
        .parse(markdown)
        .children.filter((node) => node.type === 'heading' && node.depth === 2)
        .map((heading, index) => {
            const value = getMarkdownNodeText(heading).trim();

            return {
                id: getDeepResearchReportHeadingId(value, index),
                value,
                depth: 1,
            };
        });

export const getDeepResearchReportSourceCount = (
    markdown: string,
): number | undefined => {
    const sourcesSection = markdown.match(/^##\s+Sources\s*$([\s\S]*)/im)?.[1];
    const sourceNumbers = [
        ...(sourcesSection?.matchAll(/(?:^|\s)(?:\[(\d+)]|(\d+)[.)])\s+/gm) ??
            []),
    ].map((match) => match[1] ?? match[2]);
    const count = new Set(sourceNumbers).size;

    return count && count > 0 ? count : undefined;
};
