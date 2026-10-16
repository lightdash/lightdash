import { describe, expect, it } from 'vitest';
import {
    extractExploreBaseTable,
    isAllowedAppSdkRoute,
    parseAppSdkExploreBaseTableRequest,
} from './sdkBridgeRoutes';
import { APP_SDK_EXPLORE_BASE_TABLE_PATH } from './types';

describe('explore base-table virtual route', () => {
    it('is not on the forwarding allowlist', () => {
        expect(
            isAllowedAppSdkRoute('POST', APP_SDK_EXPLORE_BASE_TABLE_PATH),
        ).toBe(false);
    });

    it('parses only a non-empty explore name', () => {
        expect(
            parseAppSdkExploreBaseTableRequest({ exploreName: 'orders' }),
        ).toEqual({ exploreName: 'orders' });
        expect(parseAppSdkExploreBaseTableRequest({ exploreName: '' })).toBe(
            null,
        );
        expect(parseAppSdkExploreBaseTableRequest({ exploreName: 1 })).toBe(
            null,
        );
        expect(parseAppSdkExploreBaseTableRequest(null)).toBe(null);
        expect(parseAppSdkExploreBaseTableRequest('orders')).toBe(null);
    });

    it('extracts the base table from an explore response body', () => {
        expect(
            extractExploreBaseTable({
                status: 'ok',
                results: { name: 'custom', baseTable: 'orders' },
            }),
        ).toBe('orders');
        expect(extractExploreBaseTable({ results: { baseTable: '' } })).toBe(
            null,
        );
        expect(extractExploreBaseTable({ results: null })).toBe(null);
        expect(extractExploreBaseTable(null)).toBe(null);
    });
});
