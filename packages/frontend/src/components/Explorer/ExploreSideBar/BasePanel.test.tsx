import {
    ExploreType,
    WarehouseTypes,
    type SummaryExplore,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExplorerStore } from '../../../features/explorer/store';
import { renderWithProviders } from '../../../testing/testUtils';
import BasePanel from './BasePanel';

const PROJECT_UUID = 'project-uuid';

const connection = (
    warehouseConnectionUuid: string,
    name: string,
    isOriginal: boolean,
): WarehouseConnectionForUserCredentials => ({
    warehouseConnectionUuid,
    name,
    isOriginal,
    warehouseType: WarehouseTypes.POSTGRES,
    requireUserCredentials: false,
});

const original = connection('original-uuid', 'Warehouse', true);
const finance = connection('finance-uuid', 'Finance', false);
const marketing = connection('marketing-uuid', 'Marketing', false);

const summary = (
    name: string,
    warehouseConnectionUuid: string | null,
): SummaryExplore => ({
    name,
    label: name,
    type: ExploreType.DEFAULT,
    tags: [],
    databaseName: 'db',
    schemaName: 'public',
    warehouseConnectionUuid,
});

const testState = vi.hoisted(() => ({
    connections: null as WarehouseConnectionForUserCredentials[] | null,
}));

vi.mock('../../../hooks/useExplores', () => ({
    useExplores: () => ({
        data: {
            orders: summary('orders', null),
            payments: summary('payments', 'finance-uuid'),
        },
        status: 'success',
        isInitialLoading: false,
    }),
}));
vi.mock('../../../hooks/useConnectionBadges', () => ({
    useConnectionBadges: () => testState.connections,
}));
vi.mock('../../../hooks/useProjectTableGroups', () => ({
    useProjectTableGroups: () => ({ data: {} }),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => PROJECT_UUID,
}));
vi.mock('../../../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({ projectUrlIdentifier: PROJECT_UUID }),
}));
vi.mock('../../../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: { organizationUuid: 'org-uuid' } }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('./VirtualizedExploreList', () => ({
    default: ({
        defaultUngroupedExplores,
        connections,
    }: {
        defaultUngroupedExplores: SummaryExplore[];
        connections: WarehouseConnectionForUserCredentials[] | null;
    }) => (
        <div
            data-testid="explore-list"
            data-connections={
                connections === null ? 'none' : connections.length
            }
        >
            {defaultUngroupedExplores.map(({ name }) => name).join(',')}
        </div>
    ),
}));

const renderPanel = () =>
    renderWithProviders(
        <Provider store={createExplorerStore()}>
            <MemoryRouter>
                <BasePanel />
            </MemoryRouter>
        </Provider>,
    );

const pickConnection = async (name: string) => {
    const user = userEvent.setup();
    const inputs = await screen.findAllByLabelText(
        'Filter tables by connection',
    );
    const select = inputs.find(
        (input) => (input as HTMLInputElement).type !== 'hidden',
    );
    if (!select) throw new Error('no visible connection filter');
    await user.click(select);
    await user.click(await screen.findByRole('option', { name }));
};

describe('BasePanel connection filter', () => {
    beforeEach(() => {
        window.localStorage.clear();
        testState.connections = null;
    });

    it('has no connection filter and passes no connections when badges are off', async () => {
        renderPanel();

        expect(await screen.findByTestId('explore-list')).toHaveTextContent(
            'orders,payments',
        );
        expect(screen.getByTestId('explore-list')).toHaveAttribute(
            'data-connections',
            'none',
        );
        expect(
            screen.queryAllByLabelText('Filter tables by connection'),
        ).toHaveLength(0);
    });

    it('filters the tables by connection, with NULL-bound explores on the original', async () => {
        testState.connections = [original, finance, marketing];
        renderPanel();
        expect(await screen.findByTestId('explore-list')).toHaveAttribute(
            'data-connections',
            '3',
        );

        await pickConnection('Finance');
        await waitFor(() =>
            expect(screen.getByTestId('explore-list')).toHaveTextContent(
                'payments',
            ),
        );
        expect(screen.getByTestId('explore-list')).not.toHaveTextContent(
            'orders',
        );

        await pickConnection('Warehouse');
        await waitFor(() =>
            expect(screen.getByTestId('explore-list')).toHaveTextContent(
                'orders',
            ),
        );
        expect(screen.getByTestId('explore-list')).not.toHaveTextContent(
            'payments',
        );
    });

    it('names the connection when it has no tables', async () => {
        testState.connections = [original, finance, marketing];
        renderPanel();

        await pickConnection('Marketing');

        expect(await screen.findByText('No tables on Marketing')).toBeVisible();
        expect(screen.queryByTestId('explore-list')).toBeNull();
    });

    it('remembers the chosen connection for the project', async () => {
        testState.connections = [original, finance, marketing];
        const first = renderPanel();
        await pickConnection('Finance');
        first.unmount();

        renderPanel();

        await waitFor(() =>
            expect(screen.getByTestId('explore-list')).toHaveTextContent(
                'payments',
            ),
        );
        expect(screen.getByTestId('explore-list')).not.toHaveTextContent(
            'orders',
        );
    });
});
