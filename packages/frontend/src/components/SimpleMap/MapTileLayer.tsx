import L from 'leaflet';
import { useEffect, useMemo, type FC } from 'react';
import { TileLayer, useMap, type TileLayerProps } from 'react-leaflet';
import { lightdashApiStream } from '../../api';
import type { TileConfig } from '../../hooks/leaflet/useLeafletMapConfig';

// Fetch through the shared API helper so SDK/iframe embeds send their JWT too.
// Leaflet's default <img src> requests cannot attach authentication headers.
export class AuthenticatedTileLayer extends L.GridLayer {
    private readonly requests = new Map<HTMLImageElement, AbortController>();

    constructor(
        private readonly url: string,
        options: L.GridLayerOptions,
    ) {
        // Match the default maxZoom of Leaflet's standard TileLayer.
        super({ maxZoom: 18, ...options });
        this.on('tileunload', ({ tile }: L.TileEvent) => {
            const image = tile as HTMLImageElement;
            this.requests.get(image)?.abort();
            this.requests.delete(image);
            image.onload = null;
            image.onerror = null;
            if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
        });
    }

    getTileUrl(coords: L.Coords): string {
        return L.Util.template(this.url, coords);
    }

    createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
        const image = document.createElement('img');
        image.alt = '';
        const controller = new AbortController();
        this.requests.set(image, controller);
        const finish = (error?: Error) => {
            if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
            this.requests.delete(image);
            if (!controller.signal.aborted) done(error, image);
        };
        image.onload = () => finish();
        image.onerror = () => finish(new Error('Unable to display map tile'));
        void lightdashApiStream({
            method: 'GET',
            url: this.getTileUrl(coords),
            signal: controller.signal,
        })
            .then((response) => response.blob())
            .then((blob) => {
                if (!controller.signal.aborted) {
                    image.src = URL.createObjectURL(blob);
                }
            })
            .catch(() => finish(new Error('Unable to load map tile')));
        return image;
    }
}

const ProxiedTileLayer: FC<TileLayerProps> = ({
    url,
    attribution,
    eventHandlers,
}) => {
    const map = useMap();
    const layer = useMemo(
        () => new AuthenticatedTileLayer(url, { attribution }),
        [url, attribution],
    );
    useEffect(() => {
        layer.addTo(map);
        return () => {
            layer.remove();
        };
    }, [layer, map]);
    useEffect(() => {
        if (!eventHandlers) return;
        layer.on(eventHandlers);
        return () => {
            layer.off(eventHandlers);
        };
    }, [layer, eventHandlers]);
    return null;
};

const MapTileLayer: FC<{
    tile: TileConfig;
    eventHandlers: L.LeafletEventHandlerFnMap;
}> = ({ tile, eventHandlers }) => {
    if (!tile.url) return null;
    const Component = tile.isProxied ? ProxiedTileLayer : TileLayer;
    return (
        <Component
            url={tile.url}
            attribution={tile.attribution}
            eventHandlers={eventHandlers}
        />
    );
};

export default MapTileLayer;
