import { describe, expect, it } from 'vitest';
import { getNextSourceStep, type SourceStep } from './sourceSteps';

const ALL = { warehouse: true, models: true, views: true, live: true };
const NONE = { warehouse: false, models: false, views: false, live: false };

describe('getNextSourceStep', () => {
    it.each<[string, typeof ALL, typeof ALL, SourceStep | null]>([
        ['nothing yet', NONE, ALL, 'connectWarehouse'],
        [
            'views left after the warehouse went',
            { ...NONE, views: true },
            ALL,
            'connectWarehouse',
        ],
        [
            'no warehouse, cannot connect one',
            NONE,
            { ...ALL, warehouse: false },
            'addLiveSource',
        ],
        [
            'no warehouse, cannot connect, has live',
            { ...NONE, live: true },
            { ...ALL, warehouse: false },
            null,
        ],
        [
            'warehouse, nothing modelled',
            { ...NONE, warehouse: true, views: true },
            ALL,
            'modelFirstTable',
        ],
        [
            'warehouse, nothing modelled, cannot model here',
            { ...NONE, warehouse: true, views: true },
            { ...ALL, models: false },
            'addLiveSource',
        ],
        [
            'warehouse, no views',
            { ...NONE, warehouse: true, models: true },
            ALL,
            'addVirtualView',
        ],
        [
            'warehouse, no views, cannot add them',
            { ...NONE, warehouse: true, models: true },
            { ...ALL, views: false },
            'addLiveSource',
        ],
        [
            'warehouse and views, no live',
            { ...ALL, live: false },
            ALL,
            'addLiveSource',
        ],
        [
            'warehouse and views, cannot add live',
            { ...ALL, live: false },
            { ...ALL, live: false },
            null,
        ],
        ['everything', ALL, ALL, null],
        ['no permissions', NONE, NONE, null],
    ])('%s', (_, has, can, step) => {
        expect(getNextSourceStep({ has, can })).toBe(step);
    });
});
