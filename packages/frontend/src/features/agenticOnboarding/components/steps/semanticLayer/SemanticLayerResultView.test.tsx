import {
    DimensionType,
    MetricType,
    type SemanticLayerResult,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import SemanticLayerResultView from './SemanticLayerResultView';

const mutateAsync = vi.fn();
const showToastError = vi.fn();

vi.mock('../../../hooks/useUpdateSemanticLayerField', () => ({
    useUpdateSemanticLayerField: () => ({
        mutateAsync,
        isLoading: false,
    }),
}));

vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    __esModule: true,
    default: () => ({ showToastError }),
}));

const buildResult = (): SemanticLayerResult => ({
    primaryExploreName: 'orders',
    explores: [
        {
            name: 'orders',
            label: 'Orders',
            baseTable: 'orders',
            metrics: [
                {
                    fieldId: 'orders_total_revenue',
                    name: 'total_revenue',
                    label: 'Total revenue',
                    type: MetricType.SUM,
                    source: { table: 'orders', column: 'amount' },
                    hidden: false,
                },
            ],
            dimensions: [
                {
                    fieldId: 'orders_status',
                    name: 'status',
                    label: 'Status',
                    type: DimensionType.STRING,
                    source: { table: 'orders', column: 'status' },
                    hidden: false,
                },
            ],
            joins: [],
        },
    ],
    skippedTableCount: 2,
    validationErrors: [],
    generatedAt: '2026-07-14T00:00:00.000Z',
});

describe('SemanticLayerResultView', () => {
    beforeEach(() => {
        mutateAsync.mockReset();
        showToastError.mockReset();
    });

    it('renders the validation badge, summary and fields', () => {
        renderWithProviders(
            <SemanticLayerResultView
                initialResult={buildResult()}
                projectUuid="p1"
                onContinue={vi.fn()}
            />,
        );
        expect(screen.getByText('Validated with 0 errors')).toBeInTheDocument();
        expect(
            screen.getByText(
                '1 metrics and 1 dimensions across 1 explores · 2 tables skipped',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('Total revenue')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('optimistically renames a metric and calls PATCH with the right body', async () => {
        mutateAsync.mockResolvedValue(buildResult());
        renderWithProviders(
            <SemanticLayerResultView
                initialResult={buildResult()}
                projectUuid="p1"
                onContinue={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Edit total_revenue label' }),
        );
        const input = screen.getByRole('textbox', {
            name: 'total_revenue label',
        });
        fireEvent.change(input, { target: { value: 'Revenue' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        // Optimistic update shows the new label immediately.
        expect(screen.getByText('Revenue')).toBeInTheDocument();
        expect(mutateAsync).toHaveBeenCalledWith({
            exploreName: 'orders',
            fieldType: 'metric',
            fieldName: 'total_revenue',
            label: 'Revenue',
            hidden: null,
        });
    });

    it('rolls back and shows a toast when the update fails', async () => {
        mutateAsync.mockRejectedValue({ error: { message: 'nope' } });
        renderWithProviders(
            <SemanticLayerResultView
                initialResult={buildResult()}
                projectUuid="p1"
                onContinue={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Edit total_revenue label' }),
        );
        const input = screen.getByRole('textbox', {
            name: 'total_revenue label',
        });
        fireEvent.change(input, { target: { value: 'Revenue' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() =>
            expect(showToastError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Could not save your change',
                }),
            ),
        );
        // Rolled back to the original label.
        expect(screen.getByText('Total revenue')).toBeInTheDocument();
        expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    });

    it('toggles a metric visibility with a hidden PATCH', () => {
        mutateAsync.mockResolvedValue(buildResult());
        renderWithProviders(
            <SemanticLayerResultView
                initialResult={buildResult()}
                projectUuid="p1"
                onContinue={vi.fn()}
            />,
        );
        fireEvent.click(
            screen.getByRole('switch', { name: 'Show Total revenue' }),
        );
        expect(mutateAsync).toHaveBeenCalledWith({
            exploreName: 'orders',
            fieldType: 'metric',
            fieldName: 'total_revenue',
            label: null,
            hidden: true,
        });
    });
});
