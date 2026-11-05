import {
    UserWarehouseCredentialPurpose,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { credential } from '../MyAgentConnectionsPanel/fixtures';
import { MyWarehouseConnectionsPanel } from './index';

let credentials: UserWarehouseCredentials[] = [];
vi.mock(
    '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({
        useUserWarehouseCredentials: () => ({ data: credentials }),
    }),
);

describe('My warehouse connections', () => {
    beforeEach(() => {
        credentials = [];
    });
    it('keeps AI credentials and agent connection controls out of the personal page', () => {
        credentials = [credential];
        renderWithProviders(<MyWarehouseConnectionsPanel />);
        expect(
            screen.getByText('No warehouse connections'),
        ).toBeInTheDocument();
        expect(screen.queryByText(credential.name)).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Connect agent' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Disconnect' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add credentials' }),
        ).toBeEnabled();
    });
    it('still lists personal credentials', () => {
        credentials = [
            credential,
            {
                ...credential,
                uuid: 'personal',
                name: 'Personal Snowflake',
                purpose: UserWarehouseCredentialPurpose.DEFAULT,
            },
        ];
        renderWithProviders(<MyWarehouseConnectionsPanel />);
        expect(screen.getByText('Personal Snowflake')).toBeInTheDocument();
        expect(screen.queryByText(credential.name)).not.toBeInTheDocument();
    });
});
