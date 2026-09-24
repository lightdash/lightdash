import { ChartKind, type AllVizChartConfig } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { useCreateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { store } from '../store';
import { type SqlRunnerConnectionRequest } from '../store/sqlRunnerSlice';
import { SaveSqlChartModalContent } from './SaveSqlChartModal';

const createSqlChart = vi.fn(async () => ({
    savedSqlUuid: 'chart-uuid',
    slug: 'chart',
}));
const showToastError = vi.fn();

vi.mock('../hooks/useSavedSqlCharts', () => ({
    useCreateSqlChartMutation: vi.fn(() => ({
        mutateAsync: createSqlChart,
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

const config = {
    type: ChartKind.TABLE,
    metadata: { version: 1 },
    columns: {},
} as unknown as AllVizChartConfig;

const saveWith = async (connectionRequest: SqlRunnerConnectionRequest) => {
    renderWithProviders(
        <Provider store={store}>
            <SaveSqlChartModalContent
                opened
                onClose={vi.fn()}
                projectUuid="project-uuid"
                name=""
                description={null}
                sql="select 1"
                limit={10}
                currentVizConfig={config}
                hasUnrunChanges={false}
                connectionRequest={connectionRequest}
            />
        </Provider>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Chart name/), 'Ledger');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));
};

describe('SaveSqlChartModalContent and the active connection', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('saves the chart on the active extra connection', async () => {
        await saveWith({
            ready: true,
            field: { warehouseConnectionUuid: 'finance-uuid' },
        });

        await waitFor(() =>
            expect(createSqlChart).toHaveBeenCalledWith(
                expect.objectContaining({
                    warehouseConnectionUuid: 'finance-uuid',
                }),
            ),
        );
    });

    it('saves the chart on the original with null', async () => {
        await saveWith({
            ready: true,
            field: { warehouseConnectionUuid: null },
        });

        await waitFor(() =>
            expect(createSqlChart).toHaveBeenCalledWith(
                expect.objectContaining({ warehouseConnectionUuid: null }),
            ),
        );
    });

    it("sends main's body with no connection field in a single project", async () => {
        await saveWith({ ready: true, field: {} });

        await waitFor(() =>
            expect(createSqlChart).toHaveBeenCalledWith({
                name: 'Ledger',
                description: '',
                sql: 'select 1',
                limit: 10,
                config,
                spaceUuid: 'space-uuid',
            }),
        );
    });

    it('refuses to save when no connection is chosen', async () => {
        await saveWith({ ready: false });

        await waitFor(() =>
            expect(showToastError).toHaveBeenCalledWith({
                title: 'Choose a connection before you save this chart',
            }),
        );
        expect(createSqlChart).not.toHaveBeenCalled();
        expect(useCreateSqlChartMutation).toHaveBeenCalled();
    });
});
