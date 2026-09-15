import { type DataAppViz } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useDeleteApp } from '../../apps/hooks/useDeleteApp';
import { useDataAppVizDeleteImpact } from '../hooks/useDataAppVizDeleteImpact';
import ChartTypeDeleteModal from './ChartTypeDeleteModal';

vi.mock('../../apps/hooks/useDeleteApp', () => ({ useDeleteApp: vi.fn() }));
vi.mock('../hooks/useDataAppVizDeleteImpact', () => ({
    useDataAppVizDeleteImpact: vi.fn(),
}));

const deleteApp = vi.fn();
const refetchImpact = vi.fn();
const onDeleted = vi.fn();
const viz: DataAppViz = {
    dataAppVizUuid: 'viz-1',
    slug: 'radial-gauge',
    name: 'Radial gauge',
    description: '',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: null,
    icon: null,
    createdAt: new Date(),
    createdByUserUuid: 'user-1',
    registrySlug: null,
};

const mockImpact = (
    overrides: Partial<ReturnType<typeof useDataAppVizDeleteImpact>> = {},
) => {
    vi.mocked(useDataAppVizDeleteImpact).mockReturnValue({
        data: { chartCount: 3 },
        isFetching: false,
        isError: false,
        refetch: refetchImpact,
        ...overrides,
    } as ReturnType<typeof useDataAppVizDeleteImpact>);
};

const renderModal = (
    softDeleteEnabled = true,
    registrySlug: string | null = null,
) =>
    renderWithProviders(
        <ChartTypeDeleteModal
            projectUuid="project-1"
            dataAppViz={{ ...viz, registrySlug }}
            onClose={vi.fn()}
            onDeleted={onDeleted}
        />,
        {
            health: {
                softDelete: { enabled: softDeleteEnabled, retentionDays: 30 },
            },
        },
    );

describe('ChartTypeDeleteModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        deleteApp.mockResolvedValue(undefined);
        vi.mocked(useDeleteApp).mockReturnValue({
            mutateAsync: deleteApp,
            isLoading: false,
        } as unknown as ReturnType<typeof useDeleteApp>);
        mockImpact();
    });

    it.each([null, 'radial-gauge'])(
        'shows the impact for deletion or uninstall (%s)',
        async (registrySlug) => {
            renderModal(true, registrySlug);

            expect(
                screen.getByText(
                    '3 saved charts are built on this chart type and will show an error.',
                ),
            ).toBeInTheDocument();
            expect(
                await screen.findByText(/until the chart type is restored/),
            ).toBeInTheDocument();
            expect(useDataAppVizDeleteImpact).toHaveBeenCalledWith(
                'project-1',
                'viz-1',
            );
            const confirmLabel = registrySlug ? 'Uninstall' : 'Delete';
            const button = screen.getByRole('button', {
                name: confirmLabel,
            });
            await waitFor(() => expect(button).toBeEnabled());
            fireEvent.click(button);
            await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
            expect(deleteApp).toHaveBeenCalledWith({
                projectUuid: 'project-1',
                appUuid: 'viz-1',
                successTitle: registrySlug
                    ? 'Chart type uninstalled'
                    : 'Chart type deleted',
            });
        },
    );

    it('clearly identifies a chart type without dependents', () => {
        mockImpact({ data: { chartCount: 0 } });
        renderModal();
        expect(
            screen.getByText('No saved charts use this chart type.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/will show an error/),
        ).not.toBeInTheDocument();
    });

    it('uses singular copy for one dependent chart', () => {
        mockImpact({ data: { chartCount: 1 } });
        renderModal();
        expect(
            screen.getByText(
                '1 saved chart is built on this chart type and will show an error.',
            ),
        ).toBeInTheDocument();
    });

    it('explains that affected charts cannot be repaired by restoring a permanently deleted type', async () => {
        renderModal(false);
        expect(
            await screen.findByText(/This cannot be undone/),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/this chart type cannot be restored/),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/until the chart type is restored/),
        ).not.toBeInTheDocument();
    });

    it('waits for fresh impact data even when a previous zero count is cached', () => {
        mockImpact({ data: { chartCount: 0 }, isFetching: true });
        renderModal();
        expect(screen.getByRole('status')).toHaveTextContent(
            'Checking saved charts',
        );
        expect(
            screen.queryByText('No saved charts use this chart type.'),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });

    it('offers retry and blocks deletion when the impact cannot be checked', () => {
        mockImpact({ data: undefined, isError: true });
        renderModal();
        expect(
            screen.getByText('Could not check affected charts'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
        expect(
            screen.queryByText('No saved charts use this chart type.'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(refetchImpact).toHaveBeenCalledOnce();
        expect(deleteApp).not.toHaveBeenCalled();
    });
});
