import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useRestoreAppVersion } from '../../apps/hooks/useRestoreAppVersion';
import RestoreVersionModal from './RestoreVersionModal';

vi.mock('../../apps/hooks/useRestoreAppVersion', () => ({
    useRestoreAppVersion: vi.fn(),
}));

const mockedUseRestore = vi.mocked(useRestoreAppVersion);
const restoreMutate = vi.fn();

const setRestore = (overrides: { isLoading?: boolean; error?: unknown } = {}) =>
    mockedUseRestore.mockReturnValue({
        mutate: restoreMutate,
        isLoading: overrides.isLoading ?? false,
        error: overrides.error ?? null,
        reset: vi.fn(),
    } as unknown as ReturnType<typeof useRestoreAppVersion>);

const renderModal = (onClose = vi.fn()) => {
    renderWithProviders(
        <RestoreVersionModal
            projectUuid="project-1"
            appUuid="app-1"
            version={3}
            onClose={onClose}
        />,
    );
    return onClose;
};

describe('RestoreVersionModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setRestore();
    });

    it('warns about the consequence and restores on confirm', () => {
        renderModal();

        expect(
            screen.getByText(
                'All charts using this visualization will use the restored version. Selected fields unavailable in that version will be cleared.',
            ),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByText('Restore version'));

        expect(restoreMutate).toHaveBeenCalledWith(
            { projectUuid: 'project-1', appUuid: 'app-1', version: 3 },
            expect.anything(),
        );
    });

    it('closes once the restore succeeds', () => {
        restoreMutate.mockImplementation((_args, opts) => opts?.onSuccess?.());
        const onClose = renderModal();

        fireEvent.click(screen.getByText('Restore version'));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('will not dismiss while the restore is in flight', () => {
        setRestore({ isLoading: true });
        const onClose = renderModal();

        fireEvent.click(screen.getByText('Cancel'));

        expect(onClose).not.toHaveBeenCalled();
    });

    it('surfaces the failure without closing', () => {
        setRestore({ error: { error: { message: 'Version is gone' } } });
        const onClose = renderModal();

        expect(screen.getByText('Version is gone')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });
});
