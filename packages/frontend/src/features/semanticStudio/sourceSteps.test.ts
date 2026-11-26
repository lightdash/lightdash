import { describe, expect, it } from 'vitest';
import { getNextSourceStep, type SourceStep } from './sourceSteps';

const ALL = { warehouse: true, models: true, views: true, live: true };
const NONE = { warehouse: false, models: false, views: false, live: false };
// Every warehouse table already modelled
const MODELLED = { ...ALL, models: false };

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
            'some modelled, tables left',
            { ...NONE, warehouse: true, models: true },
            ALL,
            'modelAnotherTable',
        ],
        [
            'every table modelled, no views',
            { ...NONE, warehouse: true, models: true },
            MODELLED,
            'addVirtualView',
        ],
        [
            'every table modelled, no views, cannot add them',
            { ...NONE, warehouse: true, models: true },
            { ...MODELLED, views: false },
            'addLiveSource',
        ],
        [
            'everything but live',
            { ...ALL, live: false },
            MODELLED,
            'addLiveSource',
        ],
        [
            'everything but live, cannot add it',
            { ...ALL, live: false },
            { ...MODELLED, live: false },
            null,
        ],
        ['everything', ALL, MODELLED, null],
        ['no permissions', NONE, NONE, null],
    ])('%s', (_, has, can, step) => {
        expect(getNextSourceStep({ has, can })).toBe(step);
    });
});
