import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChartStudioAvailable } from './useChartStudioAvailable';
import { useChartTypesEnabled } from './useChartTypesEnabled';

vi.mock('./useChartStudioAvailable');
const license = vi.hoisted(() => ({ valid: true }));
const health = vi.hoisted(() => ({ isLoading: false }));
vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: health.isLoading
            ? { data: undefined, isLoading: true }
            : { data: { license }, isLoading: false },
    }),
}));

const renderEnabled = () => renderHook(() => useChartTypesEnabled()).result;

describe('useChartTypesEnabled', () => {
    beforeEach(() => {
        vi.mocked(useChartStudioAvailable).mockReturnValue(false);
        license.valid = true;
        health.isLoading = false;
    });

    it('is loading while health loads', () => {
        health.isLoading = true;

        expect(renderEnabled().current).toEqual({
            enabled: false,
            isLoading: true,
        });
    });

    it.each([
        {
            name: 'a valid licence',
            chartStudio: false,
            valid: true,
            enabled: true,
        },
        {
            name: 'Chart Studio',
            chartStudio: true,
            valid: false,
            enabled: true,
        },
        { name: 'nothing', chartStudio: false, valid: false, enabled: false },
    ])('is $enabled with $name', ({ chartStudio, valid, enabled }) => {
        vi.mocked(useChartStudioAvailable).mockReturnValue(chartStudio);
        license.valid = valid;

        expect(renderEnabled().current).toEqual({ enabled, isLoading: false });
    });
});
