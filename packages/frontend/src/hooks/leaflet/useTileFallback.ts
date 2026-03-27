import { MapTileBackground } from '@lightdash/common';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getTileConfig, type TileConfig } from './useLeafletMapConfig';

const ERROR_THRESHOLD = 5;
const WINDOW_MS = 30_000;
const RATIO_MIN_REQUESTS = 20;
const RATIO_THRESHOLD = 0.2;
const INITIAL_LOAD_ERROR_THRESHOLD = 10;

/** Maps each tile background to its fallback. OSM falls back to Voyager, CARTO tiles fall back to OSM. */
const getFallbackBackground = (
    background: MapTileBackground,
): MapTileBackground | null => {
    switch (background) {
        case MapTileBackground.OPENSTREETMAP:
            return MapTileBackground.VOYAGER;
        case MapTileBackground.LIGHT:
        case MapTileBackground.DARK:
        case MapTileBackground.VOYAGER:
            return MapTileBackground.OPENSTREETMAP;
        case MapTileBackground.SATELLITE:
            return MapTileBackground.OPENSTREETMAP;
        case MapTileBackground.NONE:
        default:
            return null;
    }
};

export type FallbackEvent = {
    from: MapTileBackground;
    to: MapTileBackground;
    errorCount: number;
    successCount: number;
};

type UseTileFallbackResult = {
    activeTile: TileConfig;
    activeBackground: MapTileBackground;
    tileLayerEventHandlers: {
        tileerror: () => void;
        tileload: () => void;
    };
    hasFallenBack: boolean;
};

export const useTileFallback = (
    tile: TileConfig,
    tileBackground: MapTileBackground,
    onFallback?: (event: FallbackEvent) => void,
): UseTileFallbackResult => {
    const [fallenBack, setFallenBack] = useState(false);
    const [activeBg, setActiveBg] = useState(tileBackground);

    const errorCount = useRef(0);
    const successCount = useRef(0);
    const windowStart = useRef(Date.now());
    // Track the current background in a ref so event handlers see the latest value
    const activeBgRef = useRef(tileBackground);
    const onFallbackRef = useRef(onFallback);
    onFallbackRef.current = onFallback;

    // Reset when the user changes tile background
    useEffect(() => {
        errorCount.current = 0;
        successCount.current = 0;
        windowStart.current = Date.now();
        activeBgRef.current = tileBackground;
        setActiveBg(tileBackground);
        setFallenBack(false);
    }, [tileBackground]);

    const triggerFallback = useCallback(() => {
        const currentBg = activeBgRef.current;
        const fallbackBg = getFallbackBackground(currentBg);
        if (!fallbackBg) return;

        const event: FallbackEvent = {
            from: currentBg,
            to: fallbackBg,
            errorCount: errorCount.current,
            successCount: successCount.current,
        };

        // Reset counters for the new provider
        errorCount.current = 0;
        successCount.current = 0;
        windowStart.current = Date.now();
        activeBgRef.current = fallbackBg;

        setActiveBg(fallbackBg);
        setFallenBack(true);
        onFallbackRef.current?.(event);
    }, []);

    const shouldTrigger = useCallback((): boolean => {
        const now = Date.now();
        const errors = errorCount.current;
        const successes = successCount.current;
        const total = errors + successes;

        // Reset window if it's expired
        if (now - windowStart.current > WINDOW_MS) {
            errorCount.current = 0;
            successCount.current = 0;
            windowStart.current = now;
            // Re-count this error
            errorCount.current = 1;
            return false;
        }

        // No fallback available
        if (!getFallbackBackground(activeBgRef.current)) return false;

        // Condition 1: 5+ errors in 30s window
        if (errors >= ERROR_THRESHOLD) return true;

        // Condition 2: >20% error ratio after 20+ requests
        if (total >= RATIO_MIN_REQUESTS && errors / total > RATIO_THRESHOLD)
            return true;

        // Condition 3: zero successes after 10+ errors (initial viewport failure)
        if (successes === 0 && errors >= INITIAL_LOAD_ERROR_THRESHOLD)
            return true;

        return false;
    }, []);

    const handleTileError = useCallback(() => {
        errorCount.current += 1;
        if (shouldTrigger()) {
            triggerFallback();
        }
    }, [shouldTrigger, triggerFallback]);

    const handleTileLoad = useCallback(() => {
        successCount.current += 1;
    }, []);

    const activeTile =
        activeBg === tileBackground ? tile : getTileConfig(activeBg);

    return {
        activeTile,
        activeBackground: activeBg,
        tileLayerEventHandlers: {
            tileerror: handleTileError,
            tileload: handleTileLoad,
        },
        hasFallenBack: fallenBack,
    };
};
