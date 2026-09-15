import { type DocumentCellV1 } from '@lightdash/common';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { type ReportHeading } from './presentation/DocumentReportLayout';

const parser = unified().use(remarkParse).use(remarkGfm);

const getNodeText = (node: unknown): string => {
    if (!node || typeof node !== 'object') {
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

export const getDocumentHeadingId = (cellId: string, offset: number) =>
    `document-${encodeURIComponent(cellId)}-${offset}`;

export const getDocumentHeadings = (cells: DocumentCellV1[]): ReportHeading[] =>
    cells.flatMap((cell) => {
        if (cell.type !== 'markdown') {
            return [];
        }
        const headings: ReportHeading[] = [];
        visit(parser.parse(cell.content), 'heading', (heading) => {
            if (
                heading.depth <= 2 &&
                heading.position?.start.offset !== undefined
            ) {
                headings.push({
                    id: getDocumentHeadingId(
                        cell.id,
                        heading.position.start.offset,
                    ),
                    label: getNodeText(heading),
                });
            }
        });
        return headings;
    });
