import { type MapTileBackground } from '@lightdash/common';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { type MapUsageContext } from '../../providers/Tracking/types';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';

type MapTileTelemetryArgs = {
    chartId: string | null;
    projectId: string | null;
    organizationId: string | null;
    userId: string | null;
    context: MapUsageContext;
    /** Background configured on the chart (after light/dark resolution). */
    tileBackground: MapTileBackground;
    /** Background actually serving tiles (differs after a provider fallback). */
    activeTileBackground: MapTileBackground;
    didFallback: boolean;
};

type MapTileTelemetryResult = {
    tileLayerEventHandlers: {
        tileerror: () => void;
        tileload: () => void;
    };
    recordInteraction: (type: 'zoom' | 'pan', zoomLevel: number) => void;
};

type Counters = {
    tilesLoaded: number;
    tileErrors: number;
    zoomCount: number;
    panCount: number;
    minZoom: number | null;
    maxZoom: number | null;
    startedAt: number;
};

const freshCounters = (): Counters => ({
    tilesLoaded: 0,
    tileErrors: 0,
    zoomCount: 0,
    panCount: 0,
    minZoom: null,
    maxZoom: null,
    startedAt: Date.now(),
});

/**
 * Accumulates tile-load volume and map interactions for a mounted map chart
 * and flushes a single summary event when the map unmounts or the tab is
 * hidden. Tiles are fetched browser-side from third-party providers, so this
 * is the only place their volume can be measured.
 */
export const useMapTileTelemetry = (
    args: MapTileTelemetryArgs,
): MapTileTelemetryResult => {
    const tracking = useTracking({ failSilently: true });

    const counters = useRef<Counters>(freshCounters());
    // Latest identity/track values, so flush callbacks never go stale
    const argsRef = useRef(args);
    argsRef.current = args;
    const trackRef = useRef(tracking?.track);
    trackRef.current = tracking?.track;

    const flush = useCallback(() => {
        const current = counters.current;
        if (current.tilesLoaded === 0 && current.tileErrors === 0) return;
        counters.current = freshCounters();
        trackRef.current?.({
            name: EventName.MAP_TILE_USAGE,
            properties: {
                userId: argsRef.current.userId,
                organizationId: argsRef.current.organizationId,
                projectId: argsRef.current.projectId,
                chartId: argsRef.current.chartId,
                context: argsRef.current.context,
                tileBackground: argsRef.current.tileBackground,
                activeTileBackground: argsRef.current.activeTileBackground,
                didFallback: argsRef.current.didFallback,
                tilesLoaded: current.tilesLoaded,
                tileErrors: current.tileErrors,
                zoomCount: current.zoomCount,
                panCount: current.panCount,
                minZoom: current.minZoom,
                maxZoom: current.maxZoom,
                durationMs: Date.now() - current.startedAt,
            },
        });
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flush();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
            flush();
        };
    }, [flush]);

    const handleTileLoad = useCallback(() => {
        counters.current.tilesLoaded += 1;
    }, []);

    const handleTileError = useCallback(() => {
        counters.current.tileErrors += 1;
    }, []);

    const recordInteraction = useCallback(
        (type: 'zoom' | 'pan', zoomLevel: number) => {
            const current = counters.current;
            if (type === 'zoom') current.zoomCount += 1;
            else current.panCount += 1;
            current.minZoom =
                current.minZoom === null
                    ? zoomLevel
                    : Math.min(current.minZoom, zoomLevel);
            current.maxZoom =
                current.maxZoom === null
                    ? zoomLevel
                    : Math.max(current.maxZoom, zoomLevel);
        },
        [],
    );

    const tileLayerEventHandlers = useMemo(
        () => ({
            tileerror: handleTileError,
            tileload: handleTileLoad,
        }),
        [handleTileError, handleTileLoad],
    );

    return {
        tileLayerEventHandlers,
        recordInteraction,
    };
};
