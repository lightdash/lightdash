import {
    WarehouseTypes,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import ConnectionBadge from './ConnectionBadge';
import { getConnectionName } from './connectionName';

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

const connections = [
    connection('original-uuid', 'Warehouse', true),
    connection('finance-uuid', 'Finance', false),
];

describe('getConnectionName', () => {
    it.each([
        [null, 'Warehouse'],
        ['finance-uuid', 'Finance'],
        ['original-uuid', 'Warehouse'],
        ['removed-uuid', null],
    ])('names binding %s as %s', (binding, name) => {
        expect(getConnectionName(connections, binding)).toBe(name);
    });

    it('names nothing when badges are off', () => {
        expect(getConnectionName(null, 'finance-uuid')).toBeNull();
    });
});

describe('ConnectionBadge', () => {
    it('shows the name of the connection', () => {
        renderWithProviders(<ConnectionBadge name="Finance" />);

        expect(screen.getByText('Finance')).toBeVisible();
    });

    it('renders nothing without a name', () => {
        const { container } = renderWithProviders(
            <ConnectionBadge name={null} />,
        );

        expect(container.querySelector('.mantine-Badge-root')).toBeNull();
    });
});
