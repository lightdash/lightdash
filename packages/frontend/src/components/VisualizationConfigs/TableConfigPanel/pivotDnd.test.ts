import { describe, expect, it } from 'vitest';
import { DroppableIds, findPivotList, getPivotDrop } from './pivotDnd';

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
