import { type DateZoomConfig } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyZoomDraft,
    getEmptiedZooms,
    removeZoom,
    setZoomSection,
} from './dateZoomControls';

const target = (controlUuid: string) => ({
    controlUuid,
    fieldId: 'orders_date',
    tableName: 'orders',
});

const config: DateZoomConfig = {
    controls: [
        { uuid: 'z1', name: 'Revenue', granularity: 'Week', sectionId: 's' },
        { uuid: 'z2', name: 'Orders', granularity: 'Month' },
        { uuid: 'z3', name: 'Empty', granularity: 'Day' },
    ],
    tileTargets: { t1: target('z1'), t2: target('z2') },
};

describe('date zoom config writes', () => {
    it('applies the draft with its section as the dashboard has it', () => {
        const next = applyZoomDraft({
            config,
            draft: { uuid: 'z1', name: 'Sales', granularity: 'Day' },
            snapshotTargets: config.tileTargets,
            draftTargets: { ...config.tileTargets, t3: target('z1') },
        });
        expect(next.controls[0]).toEqual({
            uuid: 'z1',
            name: 'Sales',
            granularity: 'Day',
            sectionId: 's',
        });
        expect(Object.keys(next.tileTargets)).toEqual(['t1', 't2', 't3']);
    });

    it('removes a zoom whose last tile the draft took, and only that one', () => {
        const draftTargets = { t1: target('z1'), t2: target('z1') };
        expect(
            getEmptiedZooms(
                config.controls,
                'z1',
                config.tileTargets,
                draftTargets,
            ).map(({ uuid }) => uuid),
        ).toEqual(['z2']);
        const next = applyZoomDraft({
            config,
            draft: config.controls[0],
            snapshotTargets: config.tileTargets,
            draftTargets,
        });
        // A zoom with no tile before the edit is not the edit's to remove
        expect(next.controls.map(({ uuid }) => uuid)).toEqual(['z1', 'z3']);
    });

    it('adds a new zoom last', () => {
        const added = { uuid: 'z4', name: 'Date zoom', granularity: 'Week' };
        expect(
            applyZoomDraft({
                config,
                draft: added,
                snapshotTargets: config.tileTargets,
                draftTargets: { ...config.tileTargets, t3: target('z4') },
            }).controls.at(-1),
        ).toEqual(added);
    });

    it('moves and removes a zoom', () => {
        expect(setZoomSection(config, 'z1', null).controls[0]).toEqual({
            uuid: 'z1',
            name: 'Revenue',
            granularity: 'Week',
        });
        expect(removeZoom(config, 'z1')).toEqual({
            controls: config.controls.slice(1),
            tileTargets: { t2: target('z2') },
        });
    });
});
