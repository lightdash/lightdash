import { WarehouseTypes, type Connection } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ConnectionPicker } from './ConnectionPicker';

const switchConnection = vi.fn();

const connection = (connectionUuid: string, name: string): Connection => ({
    connectionUuid,
    name,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
});

const severalConnections = [
    connection('connection-a', 'Analytics'),
    connection('connection-b', 'Reporting'),
    connection('connection-c', 'Finance'),
];

let activeConnection = {
    connections: severalConnections,
    hasSeveralConnections: true,
    isConnectionSettled: false,
    activeConnectionUuid: undefined as string | undefined,
    activeConnection: undefined as Connection | undefined,
    connectionNameFor: () => undefined,
    switchConnection,
    seedConnection: vi.fn(),
};

vi.mock('../hooks/useActiveConnection', () => ({
    useActiveConnection: () => activeConnection,
}));

// Mantine's Select renders a hidden value input beside the visible one
const visiblePicker = async () => {
    const inputs = await screen.findAllByLabelText('Active connection');
    const visible = inputs.find(
        (input) => (input as HTMLInputElement).type !== 'hidden',
    );
    if (!visible) throw new Error('no visible connection picker');
    return visible as HTMLInputElement;
};

describe('ConnectionPicker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        activeConnection = {
            ...activeConnection,
            connections: severalConnections,
            hasSeveralConnections: true,
            isConnectionSettled: false,
            activeConnectionUuid: undefined,
        };
    });

    it('offers a choice when several connections exist and none is active', async () => {
        renderWithProviders(<ConnectionPicker />);

        const select = await visiblePicker();
        expect(select).toHaveAttribute('placeholder', 'Choose a connection');
        expect(select).toHaveValue('');
    });

    it('sets the connection the user picks', async () => {
        const user = userEvent.setup();
        renderWithProviders(<ConnectionPicker />);

        await user.click(await visiblePicker());
        await user.click(await screen.findByText('Reporting'));

        await waitFor(() =>
            expect(switchConnection).toHaveBeenCalledWith('connection-b'),
        );
    });

    it('shows the active connection once one is chosen', async () => {
        activeConnection = {
            ...activeConnection,
            isConnectionSettled: true,
            activeConnectionUuid: 'connection-b',
        };
        renderWithProviders(<ConnectionPicker />);

        expect(await visiblePicker()).toHaveValue('Reporting');
    });

    it('stays hidden on a project with one connection', () => {
        activeConnection = {
            ...activeConnection,
            connections: [severalConnections[0]],
            hasSeveralConnections: false,
            isConnectionSettled: true,
            activeConnectionUuid: 'connection-a',
        };
        renderWithProviders(<ConnectionPicker />);

        expect(screen.queryAllByLabelText('Active connection')).toHaveLength(0);
    });
});
