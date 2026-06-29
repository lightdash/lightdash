import {
    DimensionType,
    FieldType,
    QueryHistoryStatus,
    type FilterableItem,
} from '@lightdash/common';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { renderHookWithProviders } from '../testing/testUtils';
import {
    getFieldValuesAsync,
    MAX_POLL_ATTEMPTS,
    pollForFieldValueResults,
    useFieldValues,
} from './useFieldValues';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: vi.fn(() => ({ embedToken: undefined })),
}));

vi.mock('./useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(() => ({ data: { enabled: false } })),
}));

vi.mock('./useSessionTimezone', () => ({
    useSessionTimezone: vi.fn(() => null),
}));

describe('pollForFieldValueResults', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns results immediately when status is READY', async () => {
        const readyResult = {
            status: QueryHistoryStatus.READY,
            queryUuid: 'test-uuid',
            rows: [],
            columns: {},
            metadata: { performance: {} },
            pivotDetails: null,
        };

        vi.mocked(lightdashApi).mockResolvedValueOnce(readyResult as never);

        const result = await pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        );

        expect(result).toEqual(readyResult);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });

    it('returns error results without retrying', async () => {
        const errorResult = {
            status: QueryHistoryStatus.ERROR,
            queryUuid: 'test-uuid',
            error: 'Something went wrong',
        };

        vi.mocked(lightdashApi).mockResolvedValueOnce(errorResult as never);

        const result = await pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        );

        expect(result).toEqual(errorResult);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });

    it('polls until READY with backoff', async () => {
        const pendingResult = {
            status: QueryHistoryStatus.PENDING,
            queryUuid: 'test-uuid',
        };
        const readyResult = {
            status: QueryHistoryStatus.READY,
            queryUuid: 'test-uuid',
            rows: [
                {
                    orders_status: {
                        value: { raw: 'completed', formatted: 'completed' },
                    },
                },
            ],
            columns: {},
            metadata: { performance: {} },
            pivotDetails: null,
        };

        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(pendingResult as never)
            .mockResolvedValueOnce(pendingResult as never)
            .mockResolvedValueOnce(readyResult as never);

        const pollPromise = pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        );

        // Advance through the two backoff delays (250ms, 500ms)
        await vi.advanceTimersByTimeAsync(250);
        await vi.advanceTimersByTimeAsync(500);

        const result = await pollPromise;

        expect(result).toEqual(readyResult);
        expect(lightdashApi).toHaveBeenCalledTimes(3);
    });

    it('throws after MAX_POLL_ATTEMPTS', async () => {
        const pendingResult = {
            status: QueryHistoryStatus.PENDING,
            queryUuid: 'test-uuid',
        };

        vi.mocked(lightdashApi).mockResolvedValue(pendingResult as never);

        // Catch the rejection early to prevent unhandled rejection noise
        const pollPromise = pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        ).catch((e) => e);

        // Advance timers enough for all attempts
        for (let i = 0; i < MAX_POLL_ATTEMPTS + 5; i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }

        const error = await pollPromise;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
            'Field value search timed out. Please try again.',
        );

        expect(lightdashApi).toHaveBeenCalledTimes(MAX_POLL_ATTEMPTS);
    });
});

describe('getFieldValuesAsync', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const executeResult = {
        queryUuid: 'query-uuid',
        cacheMetadata: { cacheHit: false },
    };

    it('maps rows using the results column key when the backend rewrites the fieldId', async () => {
        // Aliased joins resolve to the original explore's field, so rows come
        // back keyed by the rewritten id (e.g. generated_b_region instead of
        // the requested join_1_region)
        const readyResult = {
            status: QueryHistoryStatus.READY,
            queryUuid: 'query-uuid',
            rows: [
                {
                    generated_b_region: {
                        value: { raw: 'Agder', formatted: 'Agder' },
                    },
                },
                {
                    generated_b_region: {
                        value: { raw: 'Alsace', formatted: 'Alsace' },
                    },
                },
            ],
            columns: {
                generated_b_region: {
                    type: 'string',
                    reference: 'generated_b_region',
                },
            },
            metadata: { performance: {} },
            pivotDetails: null,
        };

        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(executeResult as never)
            .mockResolvedValueOnce(readyResult as never);

        const result = await getFieldValuesAsync(
            'project-uuid',
            'join_1',
            'join_1_region',
            '',
            false,
            undefined,
        );

        expect(result.results).toEqual(['Agder', 'Alsace']);
    });

    it('falls back to the requested fieldId when columns are missing', async () => {
        const readyResult = {
            status: QueryHistoryStatus.READY,
            queryUuid: 'query-uuid',
            rows: [
                {
                    orders_status: {
                        value: { raw: 'completed', formatted: 'completed' },
                    },
                },
            ],
            columns: {},
            metadata: { performance: {} },
            pivotDetails: null,
        };

        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(executeResult as never)
            .mockResolvedValueOnce(readyResult as never);

        const result = await getFieldValuesAsync(
            'project-uuid',
            'orders',
            'orders_status',
            '',
            false,
            undefined,
        );

        expect(result.results).toEqual(['completed']);
    });
});

describe('useFieldValues', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const fieldWithStaticAutocomplete: FilterableItem = {
        name: 'status',
        type: DimensionType.STRING,
        table: 'orders',
        tableLabel: 'Orders',
        label: 'Status',
        fieldType: FieldType.DIMENSION,
        sql: '${TABLE}.status',
        hidden: false,
        filterAutocomplete: {
            values: [
                { value: 'active', label: 'Active customer' },
                { value: 'trial', label: 'Trial account' },
            ],
            fetchFromWarehouse: false,
        },
    };

    const fieldWithWarehouseAutocomplete: FilterableItem = {
        ...fieldWithStaticAutocomplete,
        filterAutocomplete: {
            values: [
                { value: 'active', label: 'Active customer' },
                { value: 'trial', label: 'Trial account' },
            ],
            fetchFromWarehouse: true,
        },
    };

    it('uses local filter autocomplete values and avoids requesting field values', () => {
        const { result } = renderHookWithProviders(() =>
            useFieldValues(
                'customer',
                [],
                'project-uuid',
                fieldWithStaticAutocomplete,
                undefined,
                undefined,
            ),
        );

        expect(lightdashApi).not.toHaveBeenCalled();
        expect(result.current.results).toEqual([
            { value: 'active', label: 'Active customer' },
        ]);
    });

    it('keeps YAML labels when suggestions or fetched results include the same raw value', async () => {
        const staticResult = renderHookWithProviders(() =>
            useFieldValues(
                '',
                ['active', 'prospect'],
                'project-uuid',
                fieldWithStaticAutocomplete,
                undefined,
                undefined,
            ),
        ).result;

        expect(lightdashApi).not.toHaveBeenCalled();
        expect(staticResult.current.results).toEqual([
            { value: 'active', label: 'Active customer' },
            { value: 'prospect' },
            { value: 'trial', label: 'Trial account' },
        ]);

        vi.mocked(lightdashApi).mockResolvedValueOnce({
            search: 'act',
            results: ['active', 'prospect'],
            cached: false,
            refreshedAt: new Date('2026-06-29T09:00:00.000Z'),
        } as never);

        const fetchedResult = renderHookWithProviders(() =>
            useFieldValues(
                'act',
                [],
                'project-uuid',
                fieldWithWarehouseAutocomplete,
                undefined,
                undefined,
            ),
        ).result;

        await waitFor(() => {
            expect(fetchedResult.current.results).toEqual([
                { value: 'active', label: 'Active customer' },
                { value: 'prospect' },
                { value: 'trial', label: 'Trial account' },
            ]);
        });
    });
});
