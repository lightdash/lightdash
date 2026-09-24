import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../api';
import { suggestChartTypeFields } from './useChartTypeSuggestions';

vi.mock('../../../../api', () => ({ lightdashApi: vi.fn() }));

const request = {
    prompt: 'revenue by region',
    clarifications: ['Total revenue'],
    fields: [
        {
            name: 'value',
            label: 'Value',
            type: 'metric' as const,
            required: true,
        },
    ],
};

describe('suggestChartTypeFields', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(lightdashApi).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('gives up after six seconds', async () => {
        vi.mocked(lightdashApi).mockImplementation(
            ({ signal }) =>
                new Promise((_resolve, reject) => {
                    signal?.addEventListener('abort', () =>
                        reject(new Error('aborted')),
                    );
                }),
        );
        const result = suggestChartTypeFields('p1', {
            ...request,
            exploreName: 'orders',
        });
        const settled = vi.fn();
        result.catch(settled);

        await vi.advanceTimersByTimeAsync(5999);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalledOnce();
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/ai/p1/chart-type/suggest-fields',
                method: 'POST',
            }),
        );
    });
});
