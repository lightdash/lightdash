import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedToDashboardToast } from './useSavedToDashboardToast';

const mocks = vi.hoisted(() => ({
    showToastSuccess: vi.fn(),
    navigate: vi.fn(),
    isEmbedded: false,
}));

vi.mock('../toaster/useToaster', () => ({
    default: () => ({ showToastSuccess: mocks.showToastSuccess }),
}));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../../ee/providers/Embed/useIsEmbedded', () => ({
    default: () => mocks.isEmbedded,
}));

const saved = {
    projectUrlIdentifier: 'project-uuid',
    dashboard: { name: 'Sales', slug: 'sales', hasUnpublishedChanges: false },
    tileUuid: 'tile-uuid',
    tabUuid: 'tab-uuid',
};

const showToast = () => {
    const { result } = renderHook(() => useSavedToDashboardToast());
    result.current(saved);
    return mocks.showToastSuccess.mock.calls[0][0];
};

describe('useSavedToDashboardToast', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isEmbedded = false;
    });

    it('opens the dashboard on the new tile and its tab', () => {
        const toast = showToast();

        expect(toast.title).toBe('Saved to "Sales"');
        expect(toast.action.children).toBe('Open dashboard');
        toast.action.onClick();
        expect(mocks.navigate).toHaveBeenCalledWith(
            '/projects/project-uuid/dashboards/sales/view/tabs/tab-uuid?highlightTile=tile-uuid',
        );
    });

    it('offers no way out of an embed', () => {
        mocks.isEmbedded = true;

        expect(showToast().action).toBeUndefined();
    });
});
