import {
    ChartType,
    DimensionType,
    QuerySourceType,
    type ResultColumns,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCreateMutation } from '../../../hooks/useSavedQuery';
import { renderWithProviders } from '../../../testing/testUtils';
import { store } from '../store';
import { type SqlRunnerConnectionRequest } from '../store/sqlRunnerSlice';
import { buildSqlRunnerItems } from '../viz/sqlRunnerChart';
import {
    SaveSqlChartModalContent,
    type SqlRunnerChartToSave,
} from './SaveSqlChartModal';

const createChart = vi.fn(async () => ({
    uuid: 'chart-uuid',
    slug: 'chart',
}));
const showToastError = vi.fn();

vi.mock('../../../hooks/useSavedQuery', () => ({
    useCreateMutation: vi.fn(() => ({
        mutateAsync: createChart,
        isLoading: false,
    })),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        user: { data: { ability: { can: () => true } } },
        health: { data: undefined },
    }),
}));

vi.mock('../../../hooks/useSpaces', () => {
    const spaceSummaries = {
        data: [{ uuid: 'space-uuid', name: 'Space', userAccess: undefined }],
        isLoading: false,
        isSuccess: true,
    };
    return { useSpaceSummaries: () => spaceSummaries };
});

vi.mock('../../../hooks/useSpaceManagement', () => ({
    useSpaceManagement: () => ({
        handleCreateNewSpace: vi.fn(),
        isCreatingNewSpace: false,
        openCreateSpaceForm: vi.fn(),
        createSpaceMutation: { isLoading: false },
    }),
}));

vi.mock(
    '../../../components/common/modal/ChartCreateModal/SaveToSpaceForm',
    () => ({ default: () => null }),
);

const columns: ResultColumns = {
    id: { reference: 'id', type: DimensionType.NUMBER },
};
const chart: SqlRunnerChartToSave = {
    sql: 'select 1',
    limit: 10,
    columns,
    items: buildSqlRunnerItems(columns),
    chartConfig: { type: ChartType.TABLE, config: undefined },
    pivotDimensions: undefined,
};

const saveWith = async (connectionRequest: SqlRunnerConnectionRequest) => {
    renderWithProviders(
        <Provider store={store}>
            <SaveSqlChartModalContent
                opened
                onClose={vi.fn()}
                projectUuid="project-uuid"
                name=""
                description={null}
                chart={chart}
                connectionRequest={connectionRequest}
            />
        </Provider>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Chart name/), 'Ledger');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));
};

const savedSqlNode = () =>
    (
        createChart.mock.calls[0] as unknown as [
            { pipeline: { queries: unknown[] } },
        ]
    )[0].pipeline.queries[0];

describe('SaveSqlChartModalContent and the active connection', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('saves the chart on the active extra connection', async () => {
        await saveWith({
            ready: true,
            field: { warehouseConnectionUuid: 'finance-uuid' },
        });

        await waitFor(() => expect(createChart).toHaveBeenCalled());
        expect(savedSqlNode()).toEqual(
            expect.objectContaining({
                sourceType: QuerySourceType.SQL,
                sql: 'select 1',
                warehouseConnectionUuid: 'finance-uuid',
            }),
        );
    });

    it('saves the chart on the original without a connection', async () => {
        await saveWith({
            ready: true,
            field: { warehouseConnectionUuid: null },
        });

        await waitFor(() => expect(createChart).toHaveBeenCalled());
        expect(savedSqlNode()).not.toHaveProperty('warehouseConnectionUuid');
    });

    it('saves the statement as a one-node pipeline chart over its columns', async () => {
        await saveWith({ ready: true, field: {} });

        await waitFor(() =>
            expect(createChart).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Ledger',
                    description: '',
                    spaceUuid: 'space-uuid',
                    tableName: 'sql',
                    chartConfig: { type: ChartType.TABLE, config: undefined },
                    tableConfig: { columnOrder: ['sql_id'] },
                    pipeline: {
                        queries: [
                            {
                                sourceType: QuerySourceType.SQL,
                                nodeId: 'sql',
                                title: 'SQL',
                                sql: 'select 1',
                                limit: 10,
                            },
                        ],
                        terminalNodeId: 'sql',
                        columns,
                    },
                }),
            ),
        );
    });

    it('refuses to save when no connection is chosen', async () => {
        await saveWith({ ready: false });

        await waitFor(() =>
            expect(showToastError).toHaveBeenCalledWith({
                title: 'Choose a connection before you save this chart',
            }),
        );
        expect(createChart).not.toHaveBeenCalled();
        expect(useCreateMutation).toHaveBeenCalled();
    });
});
