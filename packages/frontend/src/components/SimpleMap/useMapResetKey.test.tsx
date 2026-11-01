import { render } from '@testing-library/react';
import type L from 'leaflet';
import { Activity, type FC } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { describe, expect, it } from 'vitest';
import { useMapResetKey } from './useMapResetKey';

const Probe: FC<{ onMap: (map: L.Map) => void }> = ({ onMap }) => {
    onMap(useMap());
    return null;
};

const Map: FC<{ onMap: (map: L.Map) => void }> = ({ onMap }) => {
    const resetKey = useMapResetKey();
    return (
        <MapContainer key={resetKey} center={[20, 0]} zoom={2}>
            <TileLayer url="https://tile.example/{z}/{x}/{y}.png" />
            <Probe onMap={onMap} />
        </MapContainer>
    );
};

const renderInTab = (
    mode: 'visible' | 'hidden',
    onMap: (map: L.Map) => void,
) => (
    <Activity mode={mode}>
        <Map onMap={onMap} />
    </Activity>
);

describe('useMapResetKey', () => {
    it('gives the map a fresh container after its tab is hidden and shown again', () => {
        const maps: L.Map[] = [];
        const onMap = (map: L.Map) => {
            if (maps.at(-1) !== map) maps.push(map);
        };

        const { rerender } = render(renderInTab('visible', onMap));
        expect(maps).toHaveLength(1);

        rerender(renderInTab('hidden', onMap));
        expect(() => rerender(renderInTab('visible', onMap))).not.toThrow();

        expect(maps).toHaveLength(2);
        expect(maps[1].getContainer()).not.toBe(maps[0].getContainer());
        expect(maps[1].getZoom()).toBe(2);
    });
});
