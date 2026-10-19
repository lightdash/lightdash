import {
    WarehouseTypes,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionHeader } from '../../components/ConnectionHeader';
import { ConnectionPicker } from './ConnectionPicker';

const mocks = vi.hoisted(() => ({ switchConnection: vi.fn() }));
const connections: SqlRunnerWarehouseConnection[] = [
    {
        warehouseConnectionUuid: 'original',
        name: 'Warehouse',
        warehouseType: WarehouseTypes.POSTGRES,
        isOriginal: true,
        canRunSql: true,
    },
    {
        warehouseConnectionUuid: 'reporting',
        name: 'Reporting',
        warehouseType: WarehouseTypes.POSTGRES,
        isOriginal: false,
        canRunSql: true,
    },
    {
        warehouseConnectionUuid: 'reserved',
        name: 'Reserved warehouse',
        warehouseType: WarehouseTypes.POSTGRES,
        isOriginal: false,
        canRunSql: false,
    },
];
vi.mock('../hooks/useActiveConnection', () => ({
    useActiveConnection: () => ({
        connections,
        hasSeveralConnections: true,
        activeConnectionUuid: 'original',
    }),
}));
vi.mock('../hooks/useTrackedConnectionSwitch', () => ({
    useTrackedConnectionSwitch: () => mocks.switchConnection,
}));

describe('SQL runner connection options', () => {
    beforeEach(() => vi.clearAllMocks());

    it('disables reserved connections and explains why', async () => {
        render(
            <MantineProvider env="test">
                <ConnectionPicker />
            </MantineProvider>,
        );
        const user = userEvent.setup();
        await user.click(
            screen.getByRole('combobox', { name: 'Active connection' }),
        );
        const reserved = screen.getByRole('option', {
            name: /Reserved warehouse/,
        });
        expect(reserved).toHaveAttribute('data-combobox-disabled', 'true');
        expect(reserved).toHaveTextContent(
            'Reserved for a space you cannot edit',
        );
        await user.click(reserved);
        expect(mocks.switchConnection).not.toHaveBeenCalled();
        await user.click(screen.getByRole('option', { name: 'Reporting' }));
        expect(mocks.switchConnection).toHaveBeenCalledWith(
            'reporting',
            'picker',
        );
    });

    it('hides reserved connections in the connection header', async () => {
        render(
            <MantineProvider env="test">
                <ConnectionHeader
                    name="Warehouse"
                    warehouseType={WarehouseTypes.POSTGRES}
                    connections={{
                        items: connections,
                        activeUuid: 'original',
                        onSwitch: mocks.switchConnection,
                    }}
                />
            </MantineProvider>,
        );
        const user = userEvent.setup();
        await user.click(
            screen.getByRole('button', { name: 'Active connection' }),
        );
        expect(
            screen.queryByText('Reserved warehouse'),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('menuitem', { name: /Reporting/ }));
        expect(mocks.switchConnection).toHaveBeenCalledWith('reporting');
    });

    it('shows a static header when only one connection is available', () => {
        render(
            <MantineProvider env="test">
                <ConnectionHeader
                    name="Warehouse"
                    warehouseType={WarehouseTypes.POSTGRES}
                    connections={{
                        items: [connections[0], connections[2]],
                        activeUuid: 'original',
                        onSwitch: mocks.switchConnection,
                    }}
                />
            </MantineProvider>,
        );
        expect(
            screen.queryByRole('button', { name: 'Active connection' }),
        ).not.toBeInTheDocument();
    });
});
