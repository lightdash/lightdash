import {
    ChartType,
    FieldType,
    MapChartLocation,
    MapChartType,
    MetricType,
    type CompiledMetric,
    type MapChart,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withVisualizationStore } from '../testing/visualizationStore';
import useMapChartConfig, { DEFAULT_MAP_COLORS } from './useMapChartConfig';

const render = (config?: MapChart) =>
    renderHook(() => useMapChartConfig(), {
        wrapper: withVisualizationStore({ type: ChartType.MAP, config }),
    });

const field = (label: string): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.MAX,
    name: label,
    label,
    table: 'places',
    tableLabel: 'Places',
    sql: '',
    hidden: false,
});

const renderWithCoordinates = (config?: MapChart) =>
    renderHook(() => useMapChartConfig(), {
        wrapper: withVisualizationStore(
            { type: ChartType.MAP, config },
            {
                itemsMap: {
                    places_lat: field('Latitude'),
                    places_lon: field('lon'),
                },
            },
        ),
    });

describe('useMapChartConfig', () => {
    it('auto-fills coordinates by name in point modes only', () => {
        const { result } = renderWithCoordinates(undefined);
        expect(result.current.validConfig).toMatchObject({
            latitudeFieldId: 'places_lat',
            longitudeFieldId: 'places_lon',
        });
        act(() => result.current.setLatitudeFieldId('other'));
        expect(result.current.validConfig.latitudeFieldId).toBe('other');

        const area = renderWithCoordinates({
            locationType: MapChartType.AREA,
        });
        expect(area.result.current.validConfig.latitudeFieldId).toBe(undefined);
    });

    it('seeds defaults from an empty config', () => {
        const { result } = render(undefined);
        expect(result.current.validConfig).toMatchObject({
            mapType: MapChartLocation.WORLD,
            locationType: MapChartType.SCATTER,
            colorRange: DEFAULT_MAP_COLORS,
            showLegend: false,
            saveMapExtent: true,
            colorOverrides: {},
            fieldConfig: {},
        });
    });

    it('swaps color defaults when switching to and from heatmap', () => {
        const { result } = render(undefined);
        act(() => result.current.setLocationType(MapChartType.HEATMAP));
        expect(result.current.validConfig.colorRange).toHaveLength(5);
        act(() => result.current.setLocationType(MapChartType.SCATTER));
        expect(result.current.validConfig.colorRange).toEqual(
            DEFAULT_MAP_COLORS,
        );
    });

    it('adds, updates and removes colors within bounds', () => {
        const { result } = render(undefined);
        act(() => result.current.addColor());
        expect(result.current.validConfig.colorRange).toEqual([
            '#228be6',
            '#fab005',
            '#fa5252',
        ]);
        act(() => result.current.updateColor(1, '#000000'));
        expect(result.current.validConfig.colorRange?.[1]).toBe('#000000');
        act(() => result.current.removeColor(1));
        act(() => result.current.removeColor(0));
        expect(result.current.validConfig.colorRange).toEqual(
            DEFAULT_MAP_COLORS,
        );
    });

    it('merges heatmap, hexbin, color override and field config', () => {
        const { result } = render(undefined);
        act(() => result.current.setHeatmapConfig({ radius: 40 }));
        expect(result.current.validConfig.heatmapConfig).toEqual({
            radius: 40,
            blur: 15,
            opacity: 0.6,
        });
        act(() => result.current.setHexbinConfig({ opacity: 0.5 }));
        act(() => result.current.setHexbinConfig({ fixedResolution: 4 }));
        expect(result.current.validConfig.hexbinConfig).toEqual({
            opacity: 0.5,
            fixedResolution: 4,
        });
        act(() => result.current.setColorOverride('a', '#111'));
        act(() => result.current.setColorOverride('b', '#222'));
        expect(result.current.validConfig.colorOverrides).toEqual({
            a: '#111',
            b: '#222',
        });
        act(() => result.current.updateFieldConfig('f', { visible: false }));
        act(() => result.current.updateFieldConfig('f', { label: 'L' }));
        expect(result.current.isFieldVisible('f')).toBe(false);
        expect(result.current.getFieldLabel('f')).toBe('L');
    });

    it('clears color overrides when the value field changes', () => {
        const { result } = render({ colorOverrides: { a: '#111' } });
        act(() => result.current.setValueFieldId('x'));
        expect(result.current.validConfig.valueFieldId).toBe('x');
        expect(result.current.validConfig.colorOverrides).toEqual({});
    });
});
