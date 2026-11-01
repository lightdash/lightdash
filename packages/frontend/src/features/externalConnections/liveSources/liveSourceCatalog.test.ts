import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getLiveSource,
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
} from './liveSourceCatalog';

describe('LIVE_SOURCE_CATALOG', () => {
    it('has one available entry per connector', () => {
        const connectors = LIVE_SOURCE_CATALOG.filter(
            isAvailableLiveSource,
        ).map((entry) => entry.connector);
        expect([...connectors].sort()).toEqual(
            Object.values(ApiConnectorType).sort(),
        );
    });

    it('keeps analytics ids unique', () => {
        const ids = LIVE_SOURCE_CATALOG.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('finds the entry for a connector', () => {
        expect(getLiveSource(ApiConnectorType.GA4).label).toBe(
            'Google Analytics 4',
        );
    });
});
