import { DateGranularity, type DateZoomConfig } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    addZoomTiles,
    applyZoomEdit,
    createZoomControl,
    isZoomChanged,
    isZoomDirty,
    restoreZoom,
    setZoomTileField,
} from './zoomState';

const DATE = { fieldId: 'orders_date', tableName: 'orders' };
const SHIP = { fieldId: 'orders_ship', tableName: 'orders' };

const config: DateZoomConfig = {
    controls: [
        { uuid: 'z1', name: 'Order trend', granularity: DateGranularity.MONTH },
        { uuid: 'z2', name: 'Ship trend', granularity: DateGranularity.WEEK },
    ],
    tileTargets: {
        t1: { controlUuid: 'z1', ...DATE },
        t2: { controlUuid: 'z2', ...SHIP },
    },
};

describe('zoomState', () => {
    it('seeds a new zoom as the bar does', () => {
        expect(
            createZoomControl('n', DateGranularity.YEAR, [DateGranularity.DAY]),
        ).toEqual({
            uuid: 'n',
            name: 'Date zoom',
            granularity: DateGranularity.YEAR,
        });
        expect(
            createZoomControl('n', undefined, [DateGranularity.DAY])
                .granularity,
        ).toBe(DateGranularity.DAY);
        expect(createZoomControl('n', undefined, []).granularity).toBe(
            DateGranularity.MONTH,
        );
    });

    it('moves a tile from another zoom, keeping its field', () => {
        const moved = setZoomTileField(config, 'z1', 't2', SHIP);
        expect(moved.tileTargets.t2).toEqual({ controlUuid: 'z1', ...SHIP });
        // The other zoom stays until the edit is applied
        expect(moved.controls).toHaveLength(2);
    });

    it('takes a tile out of this zoom only', () => {
        expect(setZoomTileField(config, 'z1', 't2', null)).toBe(config);
        expect(setZoomTileField(config, 'z1', 't1', null).tileTargets).toEqual({
            t2: config.tileTargets.t2,
        });
    });

    it('adds only the tiles no zoom has', () => {
        const added = addZoomTiles(config, 'z1', [
            { tileUuid: 't2', field: DATE },
            { tileUuid: 't3', field: { fieldId: null, tableName: null } },
        ]);
        expect(added.tileTargets.t2).toEqual(config.tileTargets.t2);
        expect(added.tileTargets.t3).toEqual({
            controlUuid: 'z1',
            fieldId: null,
            tableName: null,
        });
    });

    it('restores a zoom and the tiles it took, keeping other writes', () => {
        const edited: DateZoomConfig = {
            controls: [
                { ...config.controls[0], name: 'Renamed' },
                { ...config.controls[1], hidden: true },
            ],
            tileTargets: {
                t1: { controlUuid: 'z1', ...SHIP },
                t2: { controlUuid: 'z1', ...SHIP },
                t3: { controlUuid: 'z1', ...DATE },
            },
        };
        expect(isZoomDirty(edited, config, 'z1')).toBe(true);
        expect(restoreZoom(edited, config, 'z1')).toEqual({
            controls: [config.controls[0], edited.controls[1]],
            tileTargets: config.tileTargets,
        });
        expect(isZoomDirty(config, config, 'z1')).toBe(false);
    });

    it('takes out a zoom that was new, and puts back one that was removed', () => {
        const withNew: DateZoomConfig = {
            ...config,
            controls: [
                ...config.controls,
                { uuid: 'n', name: 'Date zoom', granularity: 'Day' },
            ],
            tileTargets: {
                ...config.tileTargets,
                t3: { controlUuid: 'n', ...DATE },
            },
        };
        expect(restoreZoom(withNew, config, 'n')).toEqual(config);

        const removed: DateZoomConfig = {
            controls: [config.controls[1]],
            tileTargets: { t2: config.tileTargets.t2 },
        };
        expect(restoreZoom(removed, config, 'z1')).toEqual(config);
    });

    it('applies an edit: an empty name goes back, emptied zooms go', () => {
        // t2 moved here from z2, which is left with none
        const moved: DateZoomConfig = {
            controls: [
                { ...config.controls[0], name: '  ' },
                config.controls[1],
            ],
            tileTargets: {
                t1: config.tileTargets.t1,
                t2: { controlUuid: 'z1', ...SHIP },
            },
        };
        expect(applyZoomEdit(moved, config, 'z1')).toEqual({
            controls: [{ ...config.controls[0], name: 'Date zoom' }],
            tileTargets: moved.tileTargets,
        });
        expect(applyZoomEdit(config, config, 'z1')).toBe(config);
    });

    it('removes the edited zoom once it has no tiles', () => {
        const cleared: DateZoomConfig = {
            ...config,
            tileTargets: { t2: config.tileTargets.t2 },
        };
        expect(applyZoomEdit(cleared, config, 'z1')).toEqual({
            controls: [config.controls[1]],
            tileTargets: { t2: config.tileTargets.t2 },
        });
    });

    it('says a zoom changed when Save would write it differently', () => {
        expect(isZoomChanged(config, config, 'z1')).toBe(false);
        // Shown again reads as never hidden
        expect(
            isZoomChanged(
                config,
                {
                    ...config,
                    controls: [
                        { ...config.controls[0], hidden: false },
                        config.controls[1],
                    ],
                },
                'z1',
            ),
        ).toBe(false);
        expect(
            isZoomChanged(
                config,
                setZoomTileField(config, 'z1', 't2', SHIP),
                'z1',
            ),
        ).toBe(true);
        expect(
            isZoomChanged(
                { ...config, controls: [config.controls[1]] },
                config,
                'z1',
            ),
        ).toBe(true);
    });
});
