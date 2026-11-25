import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type Explore, type Source } from './model';
import { draftModel } from './studioCheckout.mock';
import { useExploreFields } from './useExploreFields';

// The project has no explore of a model the change adds, so asking for it fails.
vi.mock('../../hooks/useExplore', () => ({
    useExploreByProjectUuid: (
        _name: string,
        _projectUuid: string,
        { enabled }: { enabled: boolean },
    ) => ({
        data: undefined,
        isInitialLoading: false,
        error: enabled ? { error: { message: 'Explore not found' } } : null,
    }),
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
        const { result } = renderHook(() =>
            useExploreFields({
                projectUuid: 'project',
                explore,
                source,
                canManageLive: false,
                draft: draftModel('payments', null, 'payments yaml'),
            }),
        );
        expect(result.current.fields).toEqual([]);
        expect(result.current.error).toBeNull();
    });
});
