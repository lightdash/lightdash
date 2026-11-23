import { WarehouseTypes } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportWarehouseCredentialsError } from '../../hooks/userWarehouseCredentials/warehouseCredentialsError';
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
            title,
            description,
            onClose,
        }: {
            title?: string;
            description: ReactNode;
            onClose: () => void;
        }) => (
            <div role="dialog">
                {title}
                {description}
                <button onClick={onClose}>Close</button>
            </div>
        ),
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

    it('does not open on page load with personal credentials in optional mode', async () => {
        mocks.warehouseConnection = {
            ...snowflake,
            allowUserCredentials: true,
        };
        renderWithProviders(
            <MemoryRouter initialEntries={['/projects/project/sqlRunner']}>
                <UserCredentialsSwitcher />
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('button', { name: 'Warehouse credentials' }),
        ).toBeInTheDocument();
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    const closeThenCreateNew = async () => {
        const user = userEvent.setup();
        await user.click(await screen.findByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        await user.click(
            screen.getByRole('button', { name: 'Warehouse credentials' }),
        );
        await user.click(
            await screen.findByRole('menuitem', { name: 'Create new' }),
        );
        return waitFor(() => screen.getByRole('dialog'));
    };

    it('shows the normal create modal after the expired sign-in prompt was closed in optional mode', async () => {
        mocks.warehouseConnection = {
            ...snowflake,
            allowUserCredentials: true,
        };
        renderSwitcher('SnowflakeTokenError');
        const dialog = await closeThenCreateNew();
        expect(dialog).not.toHaveTextContent('Login to Snowflake');
        expect(dialog).not.toHaveTextContent('sign-in has expired');
    });

    it('keeps the login prompt after closing when personal credentials are required', async () => {
        mocks.warehouseConnection = {
            ...snowflake,
            requireUserCredentials: true,
        };
        renderSwitcher('SnowflakeTokenError');
        const dialog = await closeThenCreateNew();
        expect(dialog).toHaveTextContent('Login to Snowflake');
        expect(dialog).toHaveTextContent('requires that you login to');
    });
});

describe('UserCredentialsSwitcher required credentials prompt', () => {
    const postgres = { type: WarehouseTypes.POSTGRES };
    const renderAt = (path: string) =>
        renderWithProviders(
            <MemoryRouter initialEntries={[path]}>
                <UserCredentialsSwitcher />
            </MemoryRouter>,
        );

    beforeEach(() => {
        mocks.credentials = [];
        mocks.warehouseConnection = {
            ...postgres,
            requireUserCredentials: true,
        };
    });

    it.each([
        '/projects/project/home',
        '/projects/project/apps/app',
        '/projects/project/apps/app/view',
        '/projects/project/apps/app/versions/2/view',
        '/projects/project/dashboards/dash/edit',
        '/projects/project/dashboards/dash/edit/tabs/tab',
    ])('opens on %s without credentials', async (path) => {
        renderAt(path);
        expect(
            await screen.findByText(/requires that you login to/),
        ).toBeInTheDocument();
    });

    it('stays closed on the new-app composer', async () => {
        renderAt('/projects/project/apps/generate');
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('stays closed on home when credentials are not required', async () => {
        mocks.warehouseConnection = postgres;
        renderAt('/projects/project/home');
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('stays closed on home with compatible credentials', async () => {
        mocks.credentials = [
            { uuid: 'mine', name: 'Mine', credentials: postgres },
        ];
        renderAt('/projects/project/home');
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('offers a connect button that reopens the prompt while setup is incomplete', async () => {
        const user = userEvent.setup();
        renderAt('/projects/project/home');
        await user.click(await screen.findByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Warehouse credentials' }),
        ).toBeNull();

        await user.click(
            screen.getByRole('button', { name: 'Connect PostgreSQL' }),
        );
        expect(await screen.findByRole('dialog')).toHaveTextContent(
            'Login to PostgreSQL',
        );
    });

    it('keeps the credentials menu once the user has compatible credentials', () => {
        mocks.credentials = [
            { uuid: 'mine', name: 'Mine', credentials: postgres },
        ];
        renderAt('/projects/project/home');
        expect(
            screen.getByRole('button', { name: 'Warehouse credentials' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Connect PostgreSQL' }),
        ).toBeNull();
    });

    it('opens when a request outside the query cache reports missing credentials', async () => {
        renderAt('/projects/project/spaces');
        expect(screen.queryByRole('dialog')).toBeNull();
        reportWarehouseCredentialsError('project', {
            name: 'MissingWarehouseCredentialsError',
        });
        expect(
            await screen.findByText(/requires that you login to/),
        ).toBeInTheDocument();
    });

    it('ignores reported errors for another project or of another kind', async () => {
        renderAt('/projects/project/spaces');
        reportWarehouseCredentialsError('other', {
            name: 'MissingWarehouseCredentialsError',
        });
        reportWarehouseCredentialsError('project', { name: 'ForbiddenError' });
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
