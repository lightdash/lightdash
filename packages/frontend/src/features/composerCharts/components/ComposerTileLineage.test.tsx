import {
    QueryHistoryStatus,
    QuerySourceType,
    type ApiGetSourceQueryStatusResults,
    type ComposerChartPipeline,
    type ComposerChartRunResults,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import mockIntersectingObserver from '../../../testing/intersectingObserver';
import { mockedLightdashApi } from '../../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../../testing/testUtils';
import { ComposerTileLineage } from './ComposerTileLineage';

vi.mock('../../../api');

beforeAll(mockIntersectingObserver);

const pipeline: ComposerChartPipeline = {
    schemaVersion: 1,
    terminalNodeId: 'joined',
    nodes: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'orders',
            title: 'Recent orders',
            sql: 'select * from orders',
            limit: 2,
        },
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'refunds',
            title: 'Refunds',
            sql: 'select refund_amount from refunds',
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'joined',
            title: 'Orders with refunds',
            sql: 'select * from orders join refunds using (order_id)',
            references: ['orders', 'refunds'],
        },
    ],
};

const run = {
    queries: [
        { nodeId: 'orders', sourceType: QuerySourceType.SQL, queryUuid: 'q1' },
        { nodeId: 'refunds', sourceType: QuerySourceType.SQL, queryUuid: 'q2' },
        {
            nodeId: 'joined',
            sourceType: QuerySourceType.DUCKDB,
            queryUuid: 'q3',
        },
    ],
} as ComposerChartRunResults;

const statuses: ApiGetSourceQueryStatusResults = {
    statuses: [
        {
            queryUuid: 'q1',
            status: QueryHistoryStatus.READY,
            error: null,
            totalRowCount: 2,
            warehouseExecutionTimeMs: null,
            columns: null,
        },
        {
            queryUuid: 'q2',
            status: QueryHistoryStatus.ERROR,
            error: 'column "refund_amount" does not exist',
            totalRowCount: null,
            warehouseExecutionTimeMs: null,
            columns: null,
        },
        {
            queryUuid: 'q3',
            status: QueryHistoryStatus.CANCELLED,
            error: null,
            totalRowCount: null,
            warehouseExecutionTimeMs: null,
            columns: null,
        },
    ],
};

const cell = (nodeId: string) =>
    within(document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)!);

describe('ComposerTileLineage', () => {
    it("shows each node's title and code, and marks the final result", () => {
        mockedLightdashApi.mockResolvedValue(statuses as never);
        renderWithProviders(
            <ComposerTileLineage
                projectUuid="project"
                pipeline={pipeline}
                run={run}
                runError={null}
            />,
        );
        expect(cell('orders').getByText('Recent orders')).toBeInTheDocument();
        expect(
            document
                .querySelector('[data-node-id="orders"]')!
                .querySelector('code'),
        ).toHaveTextContent(/select\s+\*\s+from\s+orders/i);
        expect(cell('joined').getByText('Final result')).toBeInTheDocument();
    });

    it("shows each node's row count, its limit warning and its error from the tile's run", async () => {
        mockedLightdashApi.mockResolvedValue(statuses as never);
        renderWithProviders(
            <ComposerTileLineage
                projectUuid="project"
                pipeline={pipeline}
                run={run}
                runError={null}
            />,
        );
        expect(
            await cell('refunds').findByText(
                'column "refund_amount" does not exist',
            ),
        ).toBeInTheDocument();
        expect(
            cell('orders').getByText('2 rows · reached limit', {
                exact: false,
            }),
        ).toBeInTheDocument();
    });

    it("shows the run's error when the run failed before any node ran", () => {
        renderWithProviders(
            <ComposerTileLineage
                projectUuid="project"
                pipeline={pipeline}
                run={null}
                runError='column "refund_amount" does not exist'
            />,
        );
        expect(
            screen.getByText('column "refund_amount" does not exist'),
        ).toBeInTheDocument();
        expect(cell('refunds').getByText('Refunds')).toBeInTheDocument();
    });
});
