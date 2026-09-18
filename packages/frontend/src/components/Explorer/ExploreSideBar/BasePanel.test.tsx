import {
    ExploreType,
    WarehouseTypes,
    type Connection,
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

const connection = (connectionUuid: string, name: string): Connection => ({
    connectionUuid,
    name,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
});

const postgres = connection('connection-postgres', 'postgres');
const marketing = connection('connection-marketing', 'marketing');

const ordersExplore = {
    name: 'orders',
    label: 'Orders',
    type: ExploreType.DEFAULT,
    connectionUuid: postgres.connectionUuid,
    tags: [],
    groupLabel: undefined,
    databaseName: 'db',
    schemaName: 'public',
    description: undefined,
};

vi.mock('../../../hooks/useExplores', () => ({
    useExplores: () => ({
        data: { orders: ordersExplore },
        status: 'success',
        isInitialLoading: false,
    }),
}));
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: { connections: [postgres, marketing] } }),
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
vi.mock('../../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: undefined }),
}));
vi.mock('./ExploreList', () => ({
    default: ({ emptyConnectionName }: { emptyConnectionName?: string }) => (
        <div
            data-testid="explore-list"
            data-empty-connection={emptyConnectionName ?? ''}
        />
    ),
}));

describe('BasePanel connection filter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    const pickConnection = async (name: string) => {
        const user = userEvent.setup();
        renderWithProviders(
            <Provider store={createExplorerStore()}>
                <MemoryRouter>
                    <BasePanel />
                </MemoryRouter>
            </Provider>,
        );
        // Mantine's Select renders a hidden value input beside the visible one
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

    it('lists tables for a connection that has them', async () => {
        await pickConnection('postgres');

        expect(await screen.findByTestId('explore-list')).toHaveAttribute(
            'data-empty-connection',
            '',
        );
    });

    it('names the connection when it has no tables', async () => {
        await pickConnection('marketing');

        await waitFor(() =>
            expect(screen.getByTestId('explore-list')).toHaveAttribute(
                'data-empty-connection',
                'marketing',
            ),
        );
    });
});
