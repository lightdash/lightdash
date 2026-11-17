import { WarehouseTypes } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import UserCredentialsSwitcher from './UserCredentialsSwitcher';

const mocks = vi.hoisted(() => ({
    warehouseConnection: {} as Record<string, unknown>,
    credentials: [] as { uuid: string; name: string; credentials: unknown }[],
}));
vi.mock('../../hooks/useActiveProject', () => ({
    useActiveProjectUuid: () => ({
        isLoading: false,
        activeProjectUuid: 'project',
    }),
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({
        data: {
            projectUuid: 'project',
            name: 'Jaffle',
            warehouseConnection: mocks.warehouseConnection,
        },
        isInitialLoading: false,
    }),
}));
vi.mock(
    '../../hooks/userWarehouseCredentials/useProjectUserWarehouseCredentialsPreference',
    () => ({
        useProjectUserWarehouseCredentialsPreference: () => ({ data: null }),
        useProjectUserWarehouseCredentialsPreferenceMutation: () => ({
            mutate: vi.fn(),
        }),
    }),
);
vi.mock(
    '../../hooks/userWarehouseCredentials/useUserWarehouseCredentials',
    () => ({
        useProjectUserWarehouseCredentials: () => ({
            isInitialLoading: false,
            data: mocks.credentials,
        }),
    }),
);
vi.mock(
    '../UserSettings/MyWarehouseConnectionsPanel/CreateCredentialsModal',
    () => ({
        CreateCredentialsModal: ({
            description,
        }: {
            description: ReactNode;
        }) => <div role="dialog">{description}</div>,
    }),
);

const personalExpiry = { requiresUserReauthentication: true };

const FailingQuery = ({
    errorName,
    data,
}: {
    errorName: string;
    data: Record<string, unknown>;
}) => {
    useQuery({
        queryKey: ['failing', errorName, data],
        queryFn: () => Promise.reject({ error: { name: errorName, data } }),
        retry: false,
    });
    return null;
};

const renderSwitcher = (
    errorName: string,
    data: Record<string, unknown> = personalExpiry,
) =>
    renderWithProviders(
        <MemoryRouter>
            <UserCredentialsSwitcher />
            <FailingQuery errorName={errorName} data={data} />
        </MemoryRouter>,
    );

const snowflake = { type: WarehouseTypes.SNOWFLAKE };
const personal = { uuid: 'personal', name: 'Mine', credentials: snowflake };

describe('UserCredentialsSwitcher Snowflake sign-in expiry', () => {
    beforeEach(() => {
        mocks.credentials = [personal];
    });

    it('asks to sign in again when personal credentials are optional', async () => {
        mocks.warehouseConnection = {
            ...snowflake,
            allowUserCredentials: true,
        };
        renderSwitcher('SnowflakeTokenError');
        expect(
            await screen.findByText(
                'Your Snowflake sign-in has expired. Sign in again to continue.',
            ),
        ).toBeInTheDocument();
    });

    it('keeps the admin requirement text when personal credentials are required', async () => {
        mocks.warehouseConnection = {
            ...snowflake,
            requireUserCredentials: true,
            allowUserCredentials: true,
        };
        renderSwitcher('SnowflakeTokenError');
        expect(
            await screen.findByText(/requires that you login to/),
        ).toBeInTheDocument();
    });

    it('stays closed when the shared sign-in expired on an optional project', async () => {
        mocks.warehouseConnection = {
            ...snowflake,
            allowUserCredentials: true,
        };
        renderSwitcher('SnowflakeTokenError', { sharedSignIn: {} });
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('stays closed on a shared-only project', async () => {
        mocks.warehouseConnection = snowflake;
        renderSwitcher('SnowflakeTokenError');
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('does not open on page load without personal credentials in optional mode', async () => {
        mocks.credentials = [];
        mocks.warehouseConnection = {
            ...snowflake,
            allowUserCredentials: true,
        };
        renderSwitcher('MissingWarehouseCredentialsError');
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
