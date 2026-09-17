import { type DocumentCell } from '@lightdash/common';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { type ReportHeading } from './presentation/DocumentReportLayout';

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkEmoji);

const getNodeText = (node: unknown): string => {
    if (!node || typeof node !== 'object') {
        return '';
    }
    if ('type' in node && node.type === 'html') {
        return '';
    }
    if ('value' in node && typeof node.value === 'string') {
        return node.value;
    }
    if ('alt' in node && typeof node.alt === 'string') {
        return node.alt;
    }
    return 'children' in node && Array.isArray(node.children)
        ? node.children.map(getNodeText).join('')
        : '';
};

export const getDocumentHeadingId = (cellIndex: number, offset: number) =>
    `document-heading-${cellIndex}-${offset}`;

export const getDocumentHeadings = (cells: DocumentCell[]): ReportHeading[] =>
    cells.flatMap((cell, cellIndex) => {
        if (cell.type === 'chart') {
            return [];
        }
        const headings: ReportHeading[] = [];
        visit(
            parser.runSync(parser.parse(cell.content.markdown)),
            'heading',
            (heading) => {
                if (
                    heading.depth === 1 &&
                    heading.position?.start.offset !== undefined
                ) {
                    const label = getNodeText(heading);
                    if (!label.trim()) {
                        return;
                    }
                    headings.push({
                        id: getDocumentHeadingId(
                            cellIndex,
                            heading.position.start.offset,
                        ),
                        label,
                    });
                }
            },
        );
        return headings;
    });
