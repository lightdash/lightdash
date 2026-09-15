import { type DocumentCellV2 } from '@lightdash/common';
import { type ReportHeading } from './presentation/DocumentReportLayout';

export const getDocumentHeadingId = (cellId: string) =>
    `document-${encodeURIComponent(cellId)}`;

export const getDocumentHeadings = (cells: DocumentCellV2[]): ReportHeading[] =>
    cells.flatMap((cell) =>
        cell.content.title
            ? [{ id: getDocumentHeadingId(cell.id), label: cell.content.title }]
            : [],
    );
