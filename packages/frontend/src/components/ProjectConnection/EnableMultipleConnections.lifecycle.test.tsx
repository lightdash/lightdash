import {
    FeatureFlags,
    ProjectType,
    WarehouseTypes,
    type Project,
    type WarehouseConnection,
    type WarehouseConnectionSwitchPlan,
} from '@lightdash/common';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import ConnectionsPanel from './ConnectionsPanel';

const flag = vi.hoisted(() => ({ enabled: true, mixedTypesEnabled: false }));

vi.mock('../../api');

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (id: FeatureFlags) => ({
        data: {
            enabled:
                id === FeatureFlags.MixedWarehouseConnections
                    ? flag.mixedTypesEnabled
                    : flag.enabled,
        },
    }),
}));

const mockApi = sharedLightdashApi as unknown as Mock;

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';
const listUrl = `/projects/${projectUuid}/warehouse-connections`;
const switchUrl = `/projects/${projectUuid}/warehouse-connection-mode`;
const listQueryKey = ['projects', projectUuid, 'warehouse-connections'];
const LIST_DELAY_MS = 120;

const original: WarehouseConnection = {
    warehouseConnectionUuid: 'original-uuid',
    projectUuid,
    name: 'PostgreSQL',
    isOriginal: true,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const extra: WarehouseConnection = {
    ...original,
    warehouseConnectionUuid: 'extra-uuid',
    name: 'Finance',
    isOriginal: false,
};

const plan: WarehouseConnectionSwitchPlan = {
    planHash: 'plan-hash',
    original: {
        name: 'PostgreSQL',
        warehouseType: WarehouseTypes.POSTGRES,
        listAllDatabases: false,
        additionalDatabases: [],
    },
    connection: {
        name: 'Finance',
        warehouseType: WarehouseTypes.POSTGRES,
        database: 'finance',
        usesOrganizationCredentials: false,
    },
    staysOnOriginal: {
        explores: 3,
        sqlCharts: 0,
        sqlChartVersions: 0,
        dbtSources: 0,
        scheduledDeliveries: 0,
        dashboards: 1,
    },
    personalCredentials: {
        usersWithPersonalCredentials: 0,
        requireUserCredentials: false,
    },
};

const apiError = (name: string, statusCode: number, message: string) => ({
    status: 'error',
    error: { name, message, statusCode, data: {} },
});

type ListState = 'single' | 'multiple' | 'failure' | 'forbidden';
type Call = { url: string; method: string; body?: string };

const server: { list: ListState } = { list: 'single' };

const later = <T,>(respond: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(respond());
            } catch (error) {
                reject(error);
            }
        }, LIST_DELAY_MS);
    });

const listResponse = () => {
    switch (server.list) {
        case 'single':
            throw apiError(
                'SingleConnectionProjectError',
                409,
                'This project uses a single warehouse connection. Enable multiple connections first.',
            );
        case 'multiple':
            return {
                connections: [original, extra],
                capabilities: { canAddConnection: true, reason: null },
            };
        case 'failure':
            throw apiError('UnexpectedServerError', 500, 'Server failed');
        case 'forbidden':
            throw apiError('ForbiddenError', 403, 'Forbidden');
        default:
            throw new Error('Unknown list state');
    }
};

const routeApi = () => {
    mockApi.mockImplementation(async ({ url, method }: Call) => {
        if (url === listUrl && method === 'GET') return later(listResponse);
        if (url === switchUrl && method === 'GET') {
            return later(() => ({
                canSwitch: true,
                reason: null,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            }));
        }
        if (url === `${switchUrl}/preview`) return later(() => plan);
        if (url === `${switchUrl}/switch`) {
            return later(() => {
                server.list = 'multiple';
                return {
                    eventUuid: 'event-uuid',
                    originalWarehouseConnectionUuid: 'original-uuid',
                    warehouseConnectionUuid: 'extra-uuid',
                };
            });
        }
        throw new Error(`Unexpected call ${method} ${url}`);
    });
};

const listCalls = () =>
    mockApi.mock.calls
        .map(([call]) => call as Call)
        .filter((call) => call.url === listUrl && call.method === 'GET');

const captured: { client: QueryClient | null } = { client: null };

const CaptureQueryClient = () => {
    captured.client = useQueryClient();
    return null;
};

const projectRule = (action: 'manage' | 'update') => ({
    action,
    subject: 'Project' as const,
    conditions: { organizationUuid, projectUuid },
});
const manageRule = projectRule('manage');
const updateRule = projectRule('update');

const renderPanel = (abilityRules = [manageRule]) => {
    renderWithProviders(
        <>
            <CaptureQueryClient />
            <ConnectionsPanel
                savedProject={
                    {
                        projectUuid,
                        organizationUuid,
                        type: ProjectType.DEFAULT,
                    } as Project
                }
            />
        </>,
        { user: { abilityRules } },
    );
    return userEvent.setup();
};

const settle = (ms = LIST_DELAY_MS * 3) =>
    act(
        () =>
            new Promise<void>((resolve) => {
                setTimeout(resolve, ms);
            }),
    );

const openSwitchDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    const button = await screen.findByRole(
        'button',
        { name: 'Enable multiple connections' },
        { timeout: 3_000 },
    );
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    return screen.findByRole('dialog');
};

const fillForm = async (
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
) => {
    for (const [label, value] of [
        [/^Name\s*\*?$/, 'Finance'],
        [/^Host/, 'finance.internal'],
        [/^User/, 'analyst'],
        [/^Password/, 'secret'],
        [/^DB name/, 'finance'],
        [/^Schema/, 'public'],
    ] as const) {
        await user.click(within(dialog).getByLabelText(label));
        await user.paste(value);
    }
};

describe('Enable multiple connections dialog lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
        flag.mixedTypesEnabled = false;
        server.list = 'single';
        captured.client = null;
        routeApi();
    });

    it('stays open when the single-connection list answers 409 after a delay', async () => {
        const user = renderPanel();
        await openSwitchDialog(user);

        await settle();

        const dialog = screen.getByRole('dialog');
        expect(
            within(dialog).getByLabelText(/^Name of the current connection/),
        ).toHaveValue('PostgreSQL');
        expect(
            screen.getByText(/This project uses one warehouse connection/),
        ).toBeInTheDocument();
    }, 20_000);

    it('stays open and keeps typed values when the list refetches while open', async () => {
        const user = renderPanel();
        const dialog = await openSwitchDialog(user);
        await settle();
        await user.click(within(dialog).getByLabelText(/^Name\s*\*?$/));
        await user.paste('Finance');
        const callsBefore = listCalls().length;

        await act(async () => {
            await captured.client!.invalidateQueries(listQueryKey);
        });
        await settle();

        expect(listCalls().length).toBe(callsBefore + 1);
        const stillOpen = screen.getByRole('dialog');
        expect(within(stillOpen).getByLabelText(/^Name\s*\*?$/)).toHaveValue(
            'Finance',
        );
    }, 20_000);

    it('opens again after cancel and stays open the second time', async () => {
        const user = renderPanel();
        const dialog = await openSwitchDialog(user);
        await settle();
        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        const reopened = await openSwitchDialog(user);
        await settle();

        expect(screen.getByRole('dialog')).toBe(reopened);
        expect(within(reopened).getByLabelText(/^Name\s*\*?$/)).toHaveValue('');
    }, 20_000);

    it('completes the switch and then lists both connections', async () => {
        const user = renderPanel();
        const dialog = await openSwitchDialog(user);
        await settle();
        await fillForm(user, dialog);
        await user.click(
            within(dialog).getByRole('button', { name: 'Review the switch' }),
        );
        const summary = await screen.findByText(
            /Its connection test passed/,
            undefined,
            { timeout: 3_000 },
        );
        await user.click(
            within(summary.closest('[role="dialog"]') as HTMLElement).getByRole(
                'button',
                { name: 'Enable multiple connections' },
            ),
        );

        expect(
            await screen.findByRole(
                'button',
                { name: 'Actions for Finance' },
                { timeout: 3_000 },
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Actions for PostgreSQL' }),
        ).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(
            mockApi.mock.calls
                .map(([call]) => call as Call)
                .filter((call) => call.url === `${switchUrl}/switch`),
        ).toHaveLength(1);
    }, 30_000);

    it('keeps the Add connection dialog open in multi-connection mode while the list refetches', async () => {
        server.list = 'multiple';
        const user = renderPanel();
        const addButton = await screen.findByRole('button', {
            name: 'Add connection',
        });
        await waitFor(() => expect(addButton).toBeEnabled(), {
            timeout: 3_000,
        });
        await user.click(addButton);
        const dialog = await screen.findByRole('dialog');
        await act(async () => {
            await captured.client!.invalidateQueries(listQueryKey);
        });
        await settle();

        expect(screen.getByRole('dialog')).toBe(dialog);
        expect(
            screen.getByRole('button', { name: 'Actions for Finance' }),
        ).toBeInTheDocument();
    }, 20_000);

    it('still reports a failed list and offers no switch', async () => {
        server.list = 'failure';
        renderPanel();

        expect(
            await screen.findByText('Failed to load connections.', undefined, {
                timeout: 3_000,
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', {
                name: 'Enable multiple connections',
            }),
        ).toBeNull();
    });

    it('renders nothing when the server refuses the list (403)', async () => {
        server.list = 'forbidden';
        renderPanel();

        await waitFor(() => expect(listCalls()).toHaveLength(1));
        await settle();
        expect(screen.queryByText('Connections')).toBeNull();
    });

    it.each([
        {
            name: 'the viewer cannot manage the project',
            rules: [updateRule],
            flagEnabled: true,
        },
        {
            name: 'the rollout flag is off',
            rules: [manageRule],
            flagEnabled: false,
        },
    ])(
        'requests no list and offers no switch when $name',
        async ({ rules, flagEnabled }) => {
            flag.enabled = flagEnabled;
            renderPanel(rules);

            await settle();
            expect(listCalls()).toHaveLength(0);
            expect(
                screen.queryByRole('button', {
                    name: 'Enable multiple connections',
                }),
            ).toBeNull();
        },
    );
});
