import { render, screen } from '@testing-library/react';
import { type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import DashboardContext from '../../providers/Dashboard/context';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { SettledFilterFields } from './SettledFilterFields';

const Probe = () => {
    const isLoading = useDashboardContext((c) => c.isLoadingDashboardFilters);
    const tiles = useDashboardContext((c) =>
        Object.keys(c.filterableFieldsByTileUuid ?? {}).join(','),
    );
    return (
        <output>
            {isLoading ? 'loading' : 'ready'} {tiles}
        </output>
    );
};

const loaded = {
    isLoadingDashboardFilters: false,
    isFetchingDashboardFilters: false,
    filterableFieldsByTileUuid: { 'tile-1': [], 'tile-2': [] },
    allFilterableFields: [],
    allFilterableMetrics: [],
    allFilterableFieldsMap: {},
    allFilterableMetricsMap: {},
    hiddenFilterableFieldIds: new Set<string>(),
} as unknown as DashboardContextType;

const reloading = {
    ...loaded,
    isLoadingDashboardFilters: true,
    isFetchingDashboardFilters: true,
    filterableFieldsByTileUuid: undefined,
    allFilterableFields: undefined,
} as DashboardContextType;

const withContext = (value: DashboardContextType): ReactElement => (
    <DashboardContext.Provider value={value}>
        <SettledFilterFields>
            <Probe />
        </SettledFilterFields>
    </DashboardContext.Provider>
);

describe('SettledFilterFields', () => {
    it('keeps the last fields while a new set of tiles reloads them', () => {
        const { rerender } = render(withContext(loaded));
        expect(screen.getByRole('status')).toHaveTextContent(
            'ready tile-1,tile-2',
        );

        rerender(withContext(reloading));
        expect(screen.getByRole('status')).toHaveTextContent(
            'ready tile-1,tile-2',
        );

        rerender(
            withContext({
                ...loaded,
                filterableFieldsByTileUuid: { 'tile-1': [] },
            }),
        );
        expect(screen.getByRole('status')).toHaveTextContent('ready tile-1');
    });

    it('passes the first load through, so the bar shows its skeletons', () => {
        render(withContext(reloading));
        expect(screen.getByRole('status')).toHaveTextContent('loading');
    });
});
