import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type Explore, type Source } from './model';
import { draftModel } from './studioCheckout.mock';
import { useExploreFields } from './useExploreFields';

const compiledQuery = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useExplore', () => ({
    useExploreByProjectUuid: compiledQuery,
}));
vi.mock('../externalConnections/hooks/useLiveSourceFields', () => ({
    useLiveSourceFields: () => ({ data: undefined }),
}));

const explore: Explore = {
    id: 'payments',
    name: 'payments',
    label: 'Payments',
    sourceId: 'warehouse',
    groupPath: [],
    description: '',
    warnings: [],
};
const source: Source = {
    id: 'warehouse',
    kind: 'modelled',
    type: 'dbt',
    name: 'Project',
    origin: 'Deployed from the CLI',
    onWarehouse: true,
    status: null,
    settingsPath: null,
};

describe('useExploreFields', () => {
    it('reads the fields of a model the change adds from the change, without asking for a live explore', () => {
        compiledQuery.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
            error: null,
        });
        const { result } = renderHook(() =>
            useExploreFields({
                projectUuid: 'project',
                explore,
                source,
                canManageLive: false,
                draft: draftModel('payments', null, 'payments yaml'),
            }),
        );
        expect(compiledQuery).toHaveBeenLastCalledWith('payments', 'project', {
            enabled: false,
        });
        expect(result.current.fields).toEqual([]);
        expect(result.current.error).toBeNull();
    });
});
