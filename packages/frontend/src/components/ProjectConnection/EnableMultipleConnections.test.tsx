import {
    ProjectType,
    WarehouseTypes,
    type Project,
    type WarehouseConnectionSwitchPlan,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import ConnectionsPanel from './ConnectionsPanel';

const flag = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

const mockApi = lightdashApi as unknown as Mock;

const organizationUuid = 'organization-uuid';
const connectionsUrl = '/projects/project-uuid/warehouse-connections';
const switchUrl = '/projects/project-uuid/warehouse-connection-mode';

const singleConnectionError = {
    status: 'error',
    error: {
        name: 'SingleConnectionProjectError',
        message: 'This project uses a single warehouse connection.',
        statusCode: 409,
        data: {},
    },
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
        explores: 12,
        sqlCharts: 1,
        sqlChartVersions: 3,
        dbtSources: 1,
        scheduledDeliveries: 2,
        dashboards: 4,
    },
    personalCredentials: {
        usersWithPersonalCredentials: 2,
        requireUserCredentials: true,
    },
};

type Call = { url: string; method: string; body?: string };

const routeApi = ({
    availability,
    switchResponses = [],
}: {
    availability: { canSwitch: boolean; reason: string | null };
    switchResponses?: (() => Promise<unknown>)[];
}) => {
    const pendingSwitches = [...switchResponses];
    mockApi.mockImplementation(async ({ url, method }: Call) => {
        if (url === connectionsUrl && method === 'GET') {
            throw singleConnectionError;
        }
        if (url === switchUrl && method === 'GET') {
            return {
                ...availability,
                originalWarehouseType: WarehouseTypes.POSTGRES,
            };
        }
        if (url === `${switchUrl}/preview`) return plan;
        if (url === `${switchUrl}/switch`) {
            const next = pendingSwitches.shift();
            if (next) return next();
        }
        throw new Error(`Unexpected call ${method} ${url}`);
    });
};

const callsTo = (url: string) =>
    mockApi.mock.calls
        .map(([call]) => call as Call)
        .filter((call) => call.url === url);

const renderPanel = () => {
    renderWithProviders(
        <ConnectionsPanel
            savedProject={
                {
                    projectUuid: 'project-uuid',
                    organizationUuid,
                    type: ProjectType.DEFAULT,
                } as Project
            }
        />,
        {
            user: {
                abilityRules: [
                    {
                        action: 'manage',
                        subject: 'Project',
                        conditions: {
                            organizationUuid,
                            projectUuid: 'project-uuid',
                        },
                    },
                ],
            },
        },
    );
    return userEvent.setup();
};

const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Name\s*\*?$/), 'Finance');
    await user.type(within(dialog).getByLabelText(/^Host/), 'finance.internal');
    await user.type(within(dialog).getByLabelText(/^User/), 'analyst');
    await user.type(within(dialog).getByLabelText(/^Password/), 'secret');
    await user.type(within(dialog).getByLabelText(/^DB name/), 'finance');
    await user.type(within(dialog).getByLabelText(/^Schema/), 'public');
    return dialog;
};

describe('Enable multiple connections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
    });

    it('offers the switch on a single-connection project', async () => {
        routeApi({ availability: { canSwitch: true, reason: null } });
        renderPanel();

        const button = await screen.findByRole('button', {
            name: 'Enable multiple connections',
        });
        await waitFor(() => expect(button).toBeEnabled());
        expect(
            screen.queryByText('Failed to load connections.'),
        ).not.toBeInTheDocument();
    });

    it('disables the switch and says why when the project cannot switch', async () => {
        routeApi({
            availability: {
                canSwitch: false,
                reason: 'An extra connection needs the Enterprise multi-connection add-on.',
            },
        });
        renderPanel();

        expect(
            await screen.findByRole('button', {
                name: 'Enable multiple connections',
            }),
        ).toBeDisabled();
    });

    it('offers nothing while the rollout flag is off', async () => {
        flag.enabled = false;
        routeApi({ availability: { canSwitch: true, reason: null } });
        renderPanel();

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(
            screen.queryByRole('button', {
                name: 'Enable multiple connections',
            }),
        ).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('previews the switch, then enables it with the previewed plan, and a retry reuses the same key', async () => {
        routeApi({
            availability: { canSwitch: true, reason: null },
            switchResponses: [
                () =>
                    Promise.reject({
                        status: 'error',
                        error: {
                            name: 'UnexpectedServerError',
                            message: 'Network hiccup',
                            statusCode: 500,
                            data: {},
                        },
                    }),
                () =>
                    Promise.resolve({
                        eventUuid: 'event-uuid',
                        originalWarehouseConnectionUuid: 'original-uuid',
                        warehouseConnectionUuid: 'extra-uuid',
                    }),
            ],
        });
        const user = renderPanel();
        await user.click(
            await screen.findByRole('button', {
                name: 'Enable multiple connections',
            }),
        );
        const form = await fillForm(user);
        expect(
            within(form).getByLabelText(/^Name of the current connection/),
        ).toHaveValue('PostgreSQL');

        await user.click(
            within(form).getByRole('button', { name: 'Review the switch' }),
        );

        const summary = await screen.findByRole('dialog');
        expect(
            await within(summary).findByText(/Its connection test passed/),
        ).toBeInTheDocument();
        expect(within(summary).getByText('12 explores')).toBeInTheDocument();
        expect(
            within(summary).getByText('2 scheduled deliveries'),
        ).toBeInTheDocument();
        expect(
            within(summary).getByText(/There is no way back/),
        ).toBeInTheDocument();
        expect(JSON.parse(callsTo(`${switchUrl}/preview`)[0].body!)).toEqual({
            original: {
                name: 'PostgreSQL',
                listAllDatabases: false,
                additionalDatabases: [],
            },
            connection: {
                name: 'Finance',
                warehouseConnection: expect.objectContaining({
                    type: WarehouseTypes.POSTGRES,
                    host: 'finance.internal',
                    dbname: 'finance',
                }),
            },
        });

        const confirm = within(summary).getByRole('button', {
            name: 'Enable multiple connections',
        });
        await user.click(confirm);
        await waitFor(() =>
            expect(callsTo(`${switchUrl}/switch`)).toHaveLength(1),
        );
        await user.click(confirm);

        await waitFor(() =>
            expect(callsTo(`${switchUrl}/switch`)).toHaveLength(2),
        );
        const [first, retry] = callsTo(`${switchUrl}/switch`).map(
            (call) => JSON.parse(call.body!) as Record<string, unknown>,
        );
        expect(first.planHash).toBe('plan-hash');
        expect(first.idempotencyKey).toEqual(expect.any(String));
        expect(retry).toEqual(first);
        await waitFor(() =>
            expect(screen.queryByText(/Its connection test passed/)).toBeNull(),
        );
    });
});
