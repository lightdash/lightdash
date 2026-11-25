import { WarehouseTypes } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    registerWarehouseCredentialsPrompt,
    WAREHOUSE_CREDENTIALS_ERROR,
} from '../../hooks/userWarehouseCredentials/warehouseCredentialsError';
import { renderWithProviders } from '../../testing/testUtils';
import { ConnectWarehouseAction } from './ConnectWarehouseAction';

const mocks = vi.hoisted(() => ({
    warehouseConnection: {} as Record<string, unknown>,
}));
vi.mock('../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({ activeProjectUuid: 'project' }),
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: { warehouseConnection: mocks.warehouseConnection },
    }),
}));

const missing = { name: 'MissingWarehouseCredentialsError' };
const connectButton = () =>
    screen.queryByRole('button', { name: 'Connect BigQuery' });

describe('ConnectWarehouseAction', () => {
    let unregister: (() => void) | undefined;

    beforeEach(() => {
        mocks.warehouseConnection = {
            type: WarehouseTypes.BIGQUERY,
            requireUserCredentials: true,
        };
        unregister = registerWarehouseCredentialsPrompt();
    });
    afterEach(() => {
        unregister?.();
        unregister = undefined;
    });

    it('asks the navbar prompt to open for the active project', async () => {
        const listener = vi.fn();
        window.addEventListener(WAREHOUSE_CREDENTIALS_ERROR, listener);
        renderWithProviders(<ConnectWarehouseAction error={missing} />);

        await userEvent.click(connectButton()!);

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0].detail).toEqual({
            projectUuid: 'project',
            error: missing,
            requested: true,
        });
        window.removeEventListener(WAREHOUSE_CREDENTIALS_ERROR, listener);
    });

    it('is activated from the keyboard', async () => {
        const listener = vi.fn();
        window.addEventListener(WAREHOUSE_CREDENTIALS_ERROR, listener);
        renderWithProviders(<ConnectWarehouseAction error={missing} />);

        await userEvent.tab();
        expect(connectButton()).toHaveFocus();
        await userEvent.keyboard('{Enter}');

        expect(listener).toHaveBeenCalledTimes(1);
        window.removeEventListener(WAREHOUSE_CREDENTIALS_ERROR, listener);
    });

    it('renders nothing for unrelated errors', () => {
        renderWithProviders(
            <ConnectWarehouseAction error={{ name: 'WarehouseQueryError' }} />,
        );
        expect(connectButton()).toBeNull();
    });

    it('renders nothing when the project uses shared credentials', () => {
        mocks.warehouseConnection = { type: WarehouseTypes.BIGQUERY };
        renderWithProviders(<ConnectWarehouseAction error={missing} />);
        expect(connectButton()).toBeNull();
    });

    it('renders nothing when no prompt is mounted to open', () => {
        unregister?.();
        unregister = undefined;
        renderWithProviders(<ConnectWarehouseAction error={missing} />);
        expect(connectButton()).toBeNull();
    });
});
