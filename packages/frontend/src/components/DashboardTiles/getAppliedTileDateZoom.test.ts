import { DateGranularity } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getAppliedTileDateZoom } from './getAppliedTileDateZoom';

const dateDimension = { table: 'orders', name: 'order_date' };

describe('getAppliedTileDateZoom', () => {
    it('returns undefined when there is no resolved zoom', () => {
        expect(
            getAppliedTileDateZoom({
                tileUuid: 'tile-1',
                tilesWithDateZoomApplied: new Set(['tile-1']),
                dateZoom: undefined,
                dateDimension,
            }),
        ).toBeUndefined();
    });

    it('keeps the resolved cartesian xAxisFieldId when the tile is applied', () => {
        expect(
            getAppliedTileDateZoom({
                tileUuid: 'tile-1',
                tilesWithDateZoomApplied: new Set(['tile-1']),
                dateZoom: {
                    granularity: DateGranularity.WEEK,
                    xAxisFieldId: 'orders_order_date',
                },
                dateDimension,
            }),
        ).toEqual({
            granularity: DateGranularity.WEEK,
            xAxisFieldId: 'orders_order_date',
        });
    });

    it('drops xAxisFieldId when the tile is not in the applied set', () => {
        expect(
            getAppliedTileDateZoom({
                tileUuid: 'tile-1',
                tilesWithDateZoomApplied: new Set(['other-tile']),
                dateZoom: {
                    granularity: DateGranularity.WEEK,
                    xAxisFieldId: 'orders_order_date',
                },
                dateDimension,
            }),
        ).toEqual({ granularity: DateGranularity.WEEK });
    });

    // Regression: legacy date-zoomed TABLE tiles resolve to a grain-only zoom
    // (getDateZoomXAxisFieldId is cartesian-only). The drill-through range filter
    // needs the backend-truncated field, so fall back to hasADateDimension.
    it('falls back to the backend date dimension when the resolved zoom has no xAxisFieldId', () => {
        expect(
            getAppliedTileDateZoom({
                tileUuid: 'tile-1',
                tilesWithDateZoomApplied: new Set(['tile-1']),
                dateZoom: { granularity: DateGranularity.MONTH },
                dateDimension,
            }),
        ).toEqual({
            granularity: DateGranularity.MONTH,
            xAxisFieldId: 'orders_order_date',
        });
    });

    it('does not invent a field for a grain-only zoom when no date dimension exists', () => {
        expect(
            getAppliedTileDateZoom({
                tileUuid: 'tile-1',
                tilesWithDateZoomApplied: new Set(['tile-1']),
                dateZoom: { granularity: DateGranularity.MONTH },
                dateDimension: undefined,
            }),
        ).toEqual({ granularity: DateGranularity.MONTH });
    });

    it('drops the fallback field when the tile is not applied', () => {
        expect(
            getAppliedTileDateZoom({
                tileUuid: 'tile-1',
                tilesWithDateZoomApplied: new Set(['other-tile']),
                dateZoom: { granularity: DateGranularity.MONTH },
                dateDimension,
            }),
        ).toEqual({ granularity: DateGranularity.MONTH });
    });
});
