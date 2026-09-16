import { type DocumentCellV3 } from '@lightdash/common';
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

export const getDocumentHeadingId = (cellId: string, offset?: number) =>
    offset === undefined
        ? `document-chart-${encodeURIComponent(cellId)}`
        : `document-heading-${encodeURIComponent(cellId)}-${offset}`;

export const getDocumentHeadings = (cells: DocumentCellV3[]): ReportHeading[] =>
    cells.flatMap((cell) => {
        if (cell.type === 'chart') {
            return [
                {
                    id: getDocumentHeadingId(cell.id),
                    label: cell.content.chart.name,
                },
            ];
        }
        const headings: ReportHeading[] = [];
        visit(
            parser.runSync(parser.parse(cell.content.markdown)),
            'heading',
            (heading) => {
                if (
                    heading.depth <= 2 &&
                    heading.position?.start.offset !== undefined
                ) {
                    const label = getNodeText(heading);
                    if (!label.trim()) {
                        return;
                    }
                    headings.push({
                        id: getDocumentHeadingId(
                            cell.id,
                            heading.position.start.offset,
                        ),
                        label,
                    });
                }
            },
        );
        return headings;
    });
