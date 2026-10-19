import {
    WarehouseTypes,
    type SpaceWarehouseConnection,
} from '@lightdash/common';
import { Box, MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { sharedLightdashApi } from '../../api';
import type * as WarehouseConnectionsModule from '../../hooks/useWarehouseConnections';
import { useWarehouseConnections } from '../../hooks/useWarehouseConnections';
import SpaceConnectionBadge from './SpaceConnectionBadge';

vi.mock('../../api');
vi.mock('../../hooks/useQueryError', () => ({ default: () => vi.fn() }));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: undefined }),
}));
vi.mock('../../hooks/useWarehouseConnections', async (importOriginal) => ({
    ...(await importOriginal<typeof WarehouseConnectionsModule>()),
    useWarehouseConnections: vi.fn(() => {
        throw new Error('Viewers cannot use the admin endpoint');
    }),
}));

const effective: SpaceWarehouseConnection = {
    warehouseConnectionUuid: 'reporting',
    name: 'Stale name',
    warehouseType: WarehouseTypes.POSTGRES,
    inheritedFromSpace: null,
};
const connections = [
    {
        warehouseConnectionUuid: 'original',
        name: 'Warehouse',
        isOriginal: true,
        warehouseType: WarehouseTypes.POSTGRES,
        requireUserCredentials: false,
    },
    {
        warehouseConnectionUuid: 'reporting',
        name: 'Reporting warehouse',
        isOriginal: false,
        warehouseType: WarehouseTypes.POSTGRES,
        requireUserCredentials: false,
    },
];
const renderBadge = (value: SpaceWarehouseConnection | null = effective) => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const view = render(
        <QueryClientProvider client={client}>
            <MantineProvider env="test">
                <Box data-testid="badge-container">
                    <SpaceConnectionBadge
                        projectUuid="project"
                        effectiveWarehouseConnection={value}
                    />
                </Box>
            </MantineProvider>
        </QueryClientProvider>,
    );
    return { ...view, client };
};

const serve = (connectionRoute = 'multi', count = 2) => {
    (sharedLightdashApi as unknown as Mock).mockImplementation(
        async ({ url }: { url: string }) => {
            if (url === '/projects/project') return { connectionRoute };
            if (
                url ===
                '/projects/project/warehouse-connection-user-credentials'
            ) {
                return connections.slice(0, count);
            }
            throw new Error(`Unexpected request: ${url}`);
        },
    );
};

describe('SpaceConnectionBadge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        serve();
    });

    it('shows the current name and direct binding tooltip for a viewer', async () => {
        renderBadge();
        await userEvent
            .setup()
            .hover(await screen.findByText('Reporting warehouse'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Content in this space queries with this connection',
        );
        expect(useWarehouseConnections).not.toHaveBeenCalled();
    });

    it('shows the parent space in the inherited tooltip', async () => {
        renderBadge({
            ...effective,
            inheritedFromSpace: { uuid: 'parent', name: 'Finance' },
        });
        await userEvent
            .setup()
            .hover(await screen.findByText('Reporting warehouse'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Inherited from Finance',
        );
    });

    it.each([
        ['multi', 1],
        ['single', 2],
    ])('hides for a %s project with %i connections', async (route, count) => {
        serve(route, count);
        const { client } = renderBadge();
        await waitFor(() => expect(client.isFetching()).toBe(0));
        expect(screen.getByTestId('badge-container')).toBeEmptyDOMElement();
        expect(useWarehouseConnections).not.toHaveBeenCalled();
    });

    it('hides when the space has no effective connection', async () => {
        const { client } = renderBadge(null);
        await waitFor(() => expect(client.isFetching()).toBe(0));
        expect(screen.getByTestId('badge-container')).toBeEmptyDOMElement();
    });
});
