import {
    WarehouseTypes,
    type WarehouseConnectionForUserCredentials,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { getWarehouseLabel } from '../ProjectConnection/ProjectConnectFlow/utils';
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

describe('hostile connection dialect labels', () => {
    it.each(Object.values(WarehouseTypes))(
        'renders the %s label as text',
        (type) => {
            const name = 'name"`;--\n/* comment */<img src=x onerror=alert(1)>';
            const label = `${name} · ${getWarehouseLabel(type)}`;
            const { container } = renderWithProviders(
                <ConnectionBadge name={label} />,
            );
            expect(
                container.querySelector('.mantine-Badge-root')?.textContent,
            ).toBe(label);
            expect(container.querySelector('img')).toBeNull();
            expect(container.querySelector('script')).toBeNull();
        },
    );
});
