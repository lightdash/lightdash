import { type PreAggregateMaterializationSummary } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MaterializationStatusBadge, StatusBadge } from './StatusBadge';

const activeMaterialization: NonNullable<
    PreAggregateMaterializationSummary['materialization']
> = {
    materializationUuid: 'active-materialization',
    status: 'active',
    materializedAt: new Date('2026-09-14T10:00:00Z'),
    durationMs: 1000,
    rowCount: 20,
    columns: null,
    totalBytes: 200,
    errorMessage: null,
    trigger: 'cron',
};

const summary: PreAggregateMaterializationSummary = {
    preAggregateDefinitionUuid: 'definition',
    preAggregateName: 'daily_orders',
    externalTable: null,
    preAggExploreName: '__preagg__orders__daily_orders',
    sourceExploreName: 'orders',
    materializationRole: null,
    dimensions: [],
    metrics: [],
    filters: [],
    timeDimension: null,
    granularity: null,
    refreshCron: null,
    definitionError: null,
    resolvedMaxRows: null,
    warnings: [],
    preparationStatus: 'ready',
    activeMaterialization,
    materialization: {
        ...activeMaterialization,
        materializationUuid: 'latest-attempt',
        status: 'failed',
        errorMessage: 'Warehouse query failed',
    },
};

describe('pre-aggregate materialization status', () => {
    it('shows the current active materialization separately from a failed latest attempt', () => {
        render(
            <MantineProvider>
                <StatusBadge summary={summary} />
                <MaterializationStatusBadge
                    materialization={summary.materialization}
                />
            </MantineProvider>,
        );

        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('does not show a previous attempt as the current materialization when it is unavailable', () => {
        render(
            <MantineProvider>
                <StatusBadge
                    summary={{ ...summary, activeMaterialization: null }}
                />
            </MantineProvider>,
        );

        expect(screen.getByText('Unavailable')).toBeInTheDocument();
        expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });
});
