import { ChartType, type SemanticChartAsCode } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import DocumentChartEditorModal from './DocumentChartEditorModal';

vi.mock('../../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: () => {},
}));
vi.mock(
    '../../components/Explorer/ChartGallery/useChartGalleryRightSidebar',
    () => ({ useChartGalleryRightSidebar: () => ({}) }),
);
vi.mock('../../components/RefreshButton', () => ({
    RefreshButton: () => null,
}));
vi.mock('../../components/common/Page/Page', () => ({
    default: ({
        sidebar,
        children,
    }: {
        sidebar: ReactNode;
        children: ReactNode;
    }) => (
        <>
            {sidebar}
            {children}
        </>
    ),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project',
}));
vi.mock('../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => null,
}));
vi.mock('../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { organizationUuid: 'org' } }),
}));
vi.mock('../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: () => true }),
}));
vi.mock('../../providers/Tracking/TrackingProvider', () => ({
    TrackSection: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../../components/Explorer/ExplorePanel', () => ({
    default: ({ onBack }: { onBack: () => void }) => (
        <button onClick={onBack}>Back to tables</button>
    ),
}));
vi.mock('../../components/Explorer/ExploreSideBar/BasePanel', () => ({
    default: ({
        onExploreClick,
    }: {
        onExploreClick: (explore: { name: string }) => void;
    }) => (
        <button onClick={() => onExploreClick({ name: 'payments' })}>
            Pick payments
        </button>
    ),
}));
vi.mock('../../components/Explorer', async () => {
    const {
        explorerActions,
        selectUnsavedChartVersion,
        useExplorerDispatch,
        useExplorerSelector,
    } = await import('../explorer/store');
    const ExplorerProbe = () => {
        const version = useExplorerSelector(selectUnsavedChartVersion);
        const dispatch = useExplorerDispatch();
        return (
            <>
                <output data-testid="query">
                    {JSON.stringify(version.metricQuery)}
                </output>
                <button
                    onClick={() =>
                        dispatch(explorerActions.setMetrics(['payments_count']))
                    }
                >
                    Select count
                </button>
            </>
        );
    };
    return { default: ExplorerProbe };
});

const chart: SemanticChartAsCode = {
    name: 'Orders',
    description: 'Order notes',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 125,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE },
};

const clients: QueryClient[] = [];
afterEach(() => clients.forEach((client) => client.clear()));
const renderModal = (initialChart: SemanticChartAsCode | null) => {
    const client = new QueryClient();
    clients.push(client);
    const apply = vi.fn();
    render(
        <QueryClientProvider client={client}>
            <MantineProvider env="test">
                <MemoryRouter>
                    <DocumentChartEditorModal
                        chart={initialChart}
                        onApply={apply}
                        onClose={() => {}}
                    />
                </MemoryRouter>
            </MantineProvider>
        </QueryClientProvider>,
    );
    return apply;
};

it('preserves metadata entered before choosing a table across the new store session', async () => {
    const apply = renderModal(null);
    fireEvent.change(screen.getByRole('textbox', { name: 'Chart name' }), {
        target: { value: 'Payment review' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
        target: { value: 'Draft notes' },
    });
    fireEvent.click(
        await screen.findByRole('button', { name: 'Pick payments' }),
    );
    expect(screen.getByRole('textbox', { name: 'Chart name' })).toHaveValue(
        'Payment review',
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
        'Draft notes',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select count' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to Document' }));
    expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({
            name: 'Payment review',
            description: 'Draft notes',
            tableName: 'payments',
        }),
    );
});

it('keeps the current query intact when table replacement is cancelled', async () => {
    renderModal(chart);
    const before = screen.getByTestId('query').textContent;
    fireEvent.click(
        await screen.findByRole('button', { name: 'Back to tables' }),
    );
    expect(await screen.findByText('Change chart table?')).toBeInTheDocument();
    expect(screen.getByTestId('query').textContent).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
        expect(
            screen.queryByText('Change chart table?'),
        ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('query').textContent).toBe(before);
    expect(screen.getByRole('textbox', { name: 'Chart name' })).toHaveValue(
        'Orders',
    );
});

it('clears the old query only after confirmation and retains metadata for the replacement table', async () => {
    renderModal(chart);
    fireEvent.change(screen.getByRole('textbox', { name: 'Chart name' }), {
        target: { value: 'Renamed analysis' },
    });
    fireEvent.click(
        await screen.findByRole('button', { name: 'Back to tables' }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Change table' }),
    );
    fireEvent.click(
        await screen.findByRole('button', { name: 'Pick payments' }),
    );
    expect(screen.getByTestId('query')).toHaveTextContent('"metrics":[]');
    expect(screen.getByTestId('query')).toHaveTextContent(
        '"exploreName":"payments"',
    );
    expect(screen.getByRole('textbox', { name: 'Chart name' })).toHaveValue(
        'Renamed analysis',
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
        'Order notes',
    );
    expect(
        screen.getByRole('button', { name: 'Apply to Document' }),
    ).toBeDisabled();
});
