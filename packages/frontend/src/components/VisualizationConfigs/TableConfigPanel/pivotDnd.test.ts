import { describe, expect, it } from 'vitest';
import {
    canDropInPivotList,
    DroppableIds,
    findPivotList,
    getPivotDrop,
} from './pivotDnd';

const lists = {
    [DroppableIds.COLUMNS]: ['c1', 'c2'],
    [DroppableIds.ROWS]: ['r1', 'r2', 'r3'],
    [DroppableIds.METRICS]: [],
};

describe('findPivotList', () => {
    it('resolves list ids and item ids', () => {
        expect(findPivotList(lists, DroppableIds.METRICS)).toBe(
            DroppableIds.METRICS,
        );
        expect(findPivotList(lists, 'r2')).toBe(DroppableIds.ROWS);
        expect(findPivotList(lists, 'unknown')).toBeNull();
    });
});

describe('getPivotDrop', () => {
    it('reorders within a list using the over item index', () => {
        expect(getPivotDrop(lists, 'r1', 'r3', false)).toEqual({
            source: { droppableId: DroppableIds.ROWS, index: 0 },
            destination: { droppableId: DroppableIds.ROWS, index: 2 },
        });
    });

    it('ignores drops on itself or on its own list container', () => {
        expect(getPivotDrop(lists, 'r1', 'r1', false)).toBeNull();
        expect(getPivotDrop(lists, 'r1', DroppableIds.ROWS, false)).toBeNull();
    });

    it('inserts before or after the over item in another list', () => {
        expect(getPivotDrop(lists, 'r2', 'c1', false)?.destination).toEqual({
            droppableId: DroppableIds.COLUMNS,
            index: 0,
        });
        expect(getPivotDrop(lists, 'r2', 'c1', true)?.destination).toEqual({
            droppableId: DroppableIds.COLUMNS,
            index: 1,
        });
    });

    it('appends when dropped on another list container, including empty ones', () => {
        expect(
            getPivotDrop(lists, 'c1', DroppableIds.ROWS, false)?.destination,
        ).toEqual({ droppableId: DroppableIds.ROWS, index: 3 });
        expect(getPivotDrop(lists, 'r1', DroppableIds.METRICS, false)).toEqual({
            source: { droppableId: DroppableIds.ROWS, index: 0 },
            destination: { droppableId: DroppableIds.METRICS, index: 0 },
        });
    });
});

describe('canDropInPivotList', () => {
    const dimension = { isDimension: true, isValueField: false };
    const metric = { isDimension: false, isValueField: true };

    it('lets dimensions move between rows and columns', () => {
        expect(
            canDropInPivotList(
                DroppableIds.ROWS,
                DroppableIds.COLUMNS,
                dimension,
            ),
        ).toBe(true);
        expect(
            canDropInPivotList(
                DroppableIds.COLUMNS,
                DroppableIds.ROWS,
                dimension,
            ),
        ).toBe(true);
        expect(
            canDropInPivotList(
                DroppableIds.ROWS,
                DroppableIds.METRICS,
                dimension,
            ),
        ).toBe(false);
    });

    it('lets value fields move between rows and metrics, never to columns', () => {
        expect(
            canDropInPivotList(DroppableIds.METRICS, DroppableIds.ROWS, metric),
        ).toBe(true);
        expect(
            canDropInPivotList(DroppableIds.ROWS, DroppableIds.METRICS, metric),
        ).toBe(true);
        expect(
            canDropInPivotList(
                DroppableIds.METRICS,
                DroppableIds.COLUMNS,
                metric,
            ),
        ).toBe(false);
    });

    it('reorders within rows and columns but not within metrics', () => {
        expect(
            canDropInPivotList(DroppableIds.ROWS, DroppableIds.ROWS, dimension),
        ).toBe(true);
        expect(
            canDropInPivotList(
                DroppableIds.METRICS,
                DroppableIds.METRICS,
                metric,
            ),
        ).toBe(false);
    });
});
