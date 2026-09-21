import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import PreviewDataStatus from './PreviewDataStatus';
import { type PreviewDataSelection } from './previewDataTypes';

const querySelection: PreviewDataSelection = {
    kind: 'query',
    exploreName: 'customers',
    savedChart: null,
    metricQuery: {
        exploreName: 'customers',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    fieldMapping: {},
};

const renderStatus = (
    props: Partial<React.ComponentProps<typeof PreviewDataStatus>> = {},
) =>
    renderWithProviders(
        <PreviewDataStatus
            selection={{ kind: 'sample' }}
            run={{ status: 'notRun' }}
            fit={{ status: 'notApplicable' }}
            hasDeclaredInputs
            onOpenDataMenu={vi.fn()}
            onRefresh={vi.fn()}
            {...props}
        />,
    );

describe('PreviewDataStatus', () => {
    it('offers real data from the sample strip', () => {
        const onOpenDataMenu = vi.fn();
        renderStatus({ onOpenDataMenu });

        fireEvent.click(
            screen.getByRole('button', { name: 'Preview on real data' }),
        );

        expect(onOpenDataMenu).toHaveBeenCalledOnce();
    });

    it('offers nothing before a build declares inputs', () => {
        renderStatus({ hasDeclaredInputs: false });

        expect(screen.queryByText('Preview on real data')).toBeNull();
    });

    it('promises that nothing runs on its own', () => {
        renderStatus({ selection: querySelection, fit: { status: 'fits' } });

        expect(
            screen.getByText('Nothing runs until you ask.'),
        ).toBeInTheDocument();
    });

    it('reports a run in progress', () => {
        renderStatus({
            selection: querySelection,
            run: { status: 'running' },
            fit: { status: 'fits' },
        });

        expect(screen.getByText('Running your query…')).toBeInTheDocument();
    });

    it('carries the API message when a run fails', () => {
        renderStatus({
            selection: querySelection,
            run: { status: 'error', message: 'Table not found' },
            fit: { status: 'fits' },
        });

        expect(screen.getByText('Table not found')).toBeInTheDocument();
    });

    it('leaves the inputs to fix to the strip’s own label', () => {
        renderStatus({
            selection: querySelection,
            fit: {
                status: 'doesNotFit',
                issues: [
                    {
                        fieldName: 'value',
                        label: 'Value',
                        expects: 'metric',
                        mapped: null,
                    },
                ],
            },
        });

        expect(screen.queryByText('1 input to fix')).toBeNull();
        expect(screen.queryByText('Nothing runs until you ask.')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('adds nothing beside an explore it could not read', () => {
        renderStatus({
            selection: querySelection,
            fit: {
                status: 'unavailable',
                message: 'You do not have access to this explore.',
            },
        });

        expect(
            screen.queryByText('You do not have access to this explore.'),
        ).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('re-runs only from the refresh control', () => {
        const onRefresh = vi.fn();
        renderStatus({
            selection: querySelection,
            run: {
                status: 'ready',
                rows: [],
                itemsMap: {},
                pivotDetails: null,
                rowCount: 4,
                ranAt: new Date(),
            },
            fit: { status: 'fits' },
            onRefresh,
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'Refresh results' }),
        );

        expect(onRefresh).toHaveBeenCalledOnce();
    });
});
