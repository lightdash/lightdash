import { WarehouseTypes } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { store } from '../../sqlRunner/store';
import {
    resetState,
    setConnectionRoute,
    setProjectUuid,
    setSql,
    type SqlRunnerConnectionRoute,
} from '../../sqlRunner/store/sqlRunnerSlice';
import { runSqlQuery } from '../../sqlRunner/store/thunks';
import { CreateVirtualViewModal } from './CreateVirtualViewModal';

const createVirtualView = vi.fn(async (_payload: object) => ({
    name: 'ledger_view',
}));

vi.mock('../hooks/useVirtualView', () => ({
    useCreateVirtualView: () => ({
        mutateAsync: createVirtualView,
        isLoading: false,
        error: null,
    }),
}));

vi.mock('../../../hooks/health/useHealth', () => ({
    default: () => ({ data: undefined }),
}));

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));

vi.mock('../../../hooks/gitIntegration/useGitIntegration', () => ({
    useGitIntegration: () => ({ data: undefined, isError: false }),
}));

const withResults = (connectionRoute: SqlRunnerConnectionRoute) => {
    store.dispatch(setConnectionRoute(connectionRoute));
    store.dispatch(setSql('select * from ledger'));
    const connection =
        connectionRoute.route === 'multi'
            ? connectionRoute.connection?.warehouseConnectionUuid
            : undefined;
    store.dispatch(
        runSqlQuery.fulfilled(
            {
                queryUuid: 'query-uuid',
                fileUrl: '/results',
                results: [{ id: 1 }],
                columns: [{ reference: 'id' }],
                warehouseConnectionUuid: connection,
            },
            'request-id',
            {
                sql: 'select * from ledger',
                limit: 10,
                projectUuid: 'project-uuid',
                parameterValues: {},
            },
        ),
    );
};

const create = async () => {
    renderWithProviders(
        <Provider store={store}>
            <CreateVirtualViewModal opened onClose={vi.fn()} />
        </Provider>,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Name/), 'Ledger view');
    await user.click(screen.getByRole('button', { name: 'Create' }));
};

describe('CreateVirtualViewModal and the active connection', () => {
    beforeEach(() => {
        store.dispatch(resetState());
        store.dispatch(setProjectUuid('project-uuid'));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('creates the view on the active extra connection', async () => {
        withResults({
            route: 'multi',
            connection: {
                warehouseConnectionUuid: 'finance-uuid',
                name: 'Finance',
                warehouseType: WarehouseTypes.POSTGRES,
            },
        });

        await create();

        await waitFor(() =>
            expect(createVirtualView).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'ledger_view',
                    warehouseConnectionUuid: 'finance-uuid',
                }),
            ),
        );
    });

    it("sends main's payload with no connection field in a single project", async () => {
        withResults({ route: 'single' });

        await create();

        await waitFor(() => expect(createVirtualView).toHaveBeenCalled());
        expect(createVirtualView.mock.calls[0][0]).not.toHaveProperty(
            'warehouseConnectionUuid',
        );
    });
});
