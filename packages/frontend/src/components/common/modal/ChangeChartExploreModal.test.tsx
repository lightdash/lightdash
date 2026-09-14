import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useExplores } from '../../../hooks/useExplores';
import useApp from '../../../providers/App/useApp';
import ChangeChartExploreModal from './ChangeChartExploreModal';

vi.mock('../../../hooks/useExplores', () => ({
    useExplores: vi.fn(),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: vi.fn(),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastError: vi.fn(),
        showToastInfo: vi.fn(),
    }),
}));

describe('ChangeChartExploreModal', () => {
    test('offers only the exact split candidates', () => {
        vi.mocked(useApp).mockReturnValue({
            user: {
                data: {
                    ability: { can: vi.fn(() => false) },
                    organizationUuid: 'organization-uuid',
                },
            },
        } as never);
        vi.mocked(useExplores).mockReturnValue({
            data: [
                { name: 'sourceA__orders', label: 'Source A orders' },
                { name: 'sourceB__orders', label: 'Source B orders' },
                {
                    name: 'orders_with_custom_dims',
                    label: 'Orders with custom dimensions',
                },
            ],
            isLoading: false,
        } as never);

        render(
            <QueryClientProvider client={new QueryClient()}>
                <MantineProvider env="test">
                    <ChangeChartExploreModal
                        opened
                        onClose={vi.fn()}
                        projectUuid="project-uuid"
                        chartUuid="chart-uuid"
                        currentExploreName="orders"
                        hasUnsavedChanges={false}
                        candidateExploreNames={[
                            'sourceA__orders',
                            'sourceB__orders',
                        ]}
                    />
                </MantineProvider>
            </QueryClientProvider>,
        );

        fireEvent.click(screen.getByPlaceholderText('Select an explore'));

        expect(screen.getByText('Source A orders')).toBeInTheDocument();
        expect(screen.getByText('Source B orders')).toBeInTheDocument();
        expect(
            screen.queryByText('Orders with custom dimensions'),
        ).not.toBeInTheDocument();
    });
});
