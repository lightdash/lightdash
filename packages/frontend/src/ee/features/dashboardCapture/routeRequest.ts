import {
    type ApiCaptureRouteRequest,
    type CaptureRoutePlace,
    type CaptureRouteTile,
} from '@lightdash/common';
import { assignSpeech } from '../capture/buildSummary';
import {
    type CaptureMark,
    type CaptureTarget,
    type TranscriptPhrase,
} from '../capture/types';

type Cell = { x: number; y: number };

export const tileTarget = (tileUuid: string, title: string): CaptureTarget => ({
    kind: 'tile',
    id: tileUuid,
    label: title,
});

export const cellTarget = (cell: Cell): CaptureTarget => ({
    kind: 'cell',
    id: `${cell.x},${cell.y}`,
    label: `empty space at column ${cell.x}, row ${cell.y}`,
});

/** Viewport point to dashboard grid cell, clamped to the grid. */
export const cellAtPoint = (
    point: { x: number; y: number },
    grid: { left: number; top: number; width: number },
    columns: number,
    rowPx: number,
): Cell => {
    const columnPx = grid.width / columns;
    return {
        x: Math.min(
            columns - 1,
            Math.max(0, Math.floor((point.x - grid.left) / columnPx)),
        ),
        y: Math.max(0, Math.floor((point.y - grid.top) / rowPx)),
    };
};

export const placeFromTarget = (
    target: CaptureTarget | null,
): CaptureRoutePlace => {
    if (target?.kind === 'tile') return { tileUuid: target.id, cell: null };
    if (target?.kind === 'cell') {
        const [x, y] = target.id.split(',').map(Number);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            return { tileUuid: null, cell: { x, y } };
        }
    }
    return { tileUuid: null, cell: null };
};

export const buildRouteRequest = (input: {
    dashboardName: string;
    gridColumns: number;
    tiles: CaptureRouteTile[];
    marks: CaptureMark[];
    transcript: TranscriptPhrase[];
}): ApiCaptureRouteRequest => {
    const { speechByMark, loose } = assignSpeech(input.marks, input.transcript);
    return {
        dashboardName: input.dashboardName,
        gridColumns: input.gridColumns,
        tiles: input.tiles,
        marks: input.marks.map((mark) => ({
            number: mark.number,
            shape: mark.shape,
            at: placeFromTarget(mark.target),
            arrowTo:
                mark.shape === 'arrow' ? placeFromTarget(mark.arrowTo) : null,
            speech: (speechByMark.get(mark.number) ?? []).join(' '),
        })),
        looseSpeech: loose.map((phrase) => phrase.text),
    };
};
