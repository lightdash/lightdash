import { FeatureFlags } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useChartStudioAvailable } from './useChartStudioAvailable';
import { useChartTypesEnabled } from './useChartTypesEnabled';

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
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

const setFlags = (enabledFlags: string[], loadingFlags: string[] = []) => {
    vi.mocked(useServerFeatureFlag).mockImplementation((flag) =>
        loadingFlags.includes(flag)
            ? ({ data: undefined, isLoading: true } as ReturnType<
                  typeof useServerFeatureFlag
              >)
            : ({
                  data: { id: flag, enabled: enabledFlags.includes(flag) },
                  isLoading: false,
              } as ReturnType<typeof useServerFeatureFlag>),
    );
};

const renderEnabled = () => renderHook(() => useChartTypesEnabled()).result;

describe('useChartTypesEnabled', () => {
    beforeEach(() => {
        vi.mocked(useChartStudioAvailable).mockReturnValue(false);
        setFlags([]);
        license.valid = true;
        health.isLoading = false;
    });

    it('is loading while health loads, even with a flag on', () => {
        health.isLoading = true;
        setFlags([FeatureFlags.ChartTypeRegistry]);

        expect(renderEnabled().current).toEqual({
            enabled: false,
            isLoading: true,
        });
    });

    it.each([FeatureFlags.EnableDataApps, FeatureFlags.ChartTypeRegistry])(
        'is off without a valid licence, even with %s on',
        (flag) => {
            license.valid = false;
            setFlags([flag]);

            expect(renderEnabled().current).toEqual({
                enabled: false,
                isLoading: false,
            });
        },
    );

    it.each([
        {
            name: 'Chart Studio only',
            chartStudio: true,
            flags: [],
            enabled: true,
        },
        {
            name: 'the library flag only',
            chartStudio: false,
            flags: [FeatureFlags.ChartTypeRegistry],
            enabled: true,
        },
        {
            name: 'the data apps flag only',
            chartStudio: false,
            flags: [FeatureFlags.EnableDataApps],
            enabled: true,
        },
        {
            name: 'nothing',
            chartStudio: false,
            flags: [],
            enabled: false,
        },
    ])('is $enabled with $name', ({ chartStudio, flags, enabled }) => {
        vi.mocked(useChartStudioAvailable).mockReturnValue(chartStudio);
        setFlags(flags);

        expect(renderEnabled().current).toEqual({ enabled, isLoading: false });
    });

    it('is loading while a flag loads and nothing is enabled yet', () => {
        setFlags([], [FeatureFlags.EnableDataApps]);

        expect(renderEnabled().current).toEqual({
            enabled: false,
            isLoading: true,
        });
    });

    it('is not loading once something is enabled, even while a flag loads', () => {
        vi.mocked(useChartStudioAvailable).mockReturnValue(true);
        setFlags([], [FeatureFlags.EnableDataApps]);

        expect(renderEnabled().current).toEqual({
            enabled: true,
            isLoading: false,
        });
    });
});
