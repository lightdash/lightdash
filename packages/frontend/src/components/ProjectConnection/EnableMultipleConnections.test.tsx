import {
    FeatureFlags,
    ProjectType,
    WarehouseTypes,
    type Project,
    type WarehouseConnectionSwitchPlan,
} from '@lightdash/common';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import ConnectionsPanel from './ConnectionsPanel';

const flag = vi.hoisted(() => ({ enabled: true, mixedTypesEnabled: true }));

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
type Respond = () => Promise<unknown>;

const apiError = (message: string, statusCode = 500) => ({
    status: 'error',
    error: { name: 'ApiError', message, statusCode, data: {} },
});

const switchResult = {
    eventUuid: 'event-uuid',
    originalWarehouseConnectionUuid: 'original-uuid',
    warehouseConnectionUuid: 'extra-uuid',
};

const deferred = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise<unknown>((r) => {
        resolve = r;
    });
    return { promise, resolve };
};

const routeApi = ({
    availability,
    previewResponses = [],
    switchResponses = [],
    originalWarehouseType = WarehouseTypes.POSTGRES,
}: {
    availability: { canSwitch: boolean; reason: string | null };
    originalWarehouseType?: WarehouseTypes;
    previewResponses?: Respond[];
    switchResponses?: Respond[];
}) => {
    const pendingPreviews = [...previewResponses];
    const pendingSwitches = [...switchResponses];
    mockApi.mockImplementation(async ({ url, method }: Call) => {
        if (url === connectionsUrl && method === 'GET') {
            throw singleConnectionError;
        }
        if (url === switchUrl && method === 'GET') {
            return {
                ...availability,
                originalWarehouseType,
            };
        }
        if (url === `${switchUrl}/preview`) {
            const next = pendingPreviews.shift();
            return next ? next() : plan;
        }
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

const bodiesTo = (url: string) =>
    callsTo(url).map(
        (call) => JSON.parse(call.body!) as Record<string, unknown>,
    );

const renderPanel = ({
    requireUserCredentials = false,
}: { requireUserCredentials?: boolean } = {}) => {
    renderWithProviders(
        <ConnectionsPanel
            savedProject={
                {
                    projectUuid: 'project-uuid',
                    organizationUuid,
                    type: ProjectType.DEFAULT,
                    warehouseConnection: { requireUserCredentials },
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

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    const button = await screen.findByRole('button', {
        name: 'Enable multiple connections',
    });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    return screen.findByRole('dialog');
};

const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
    const dialog = await screen.findByRole('dialog');
    // Paste whole field values: these tests exercise the switch, not per-key input.
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
    return dialog;
};

const enableButton = (dialog: HTMLElement) =>
    within(dialog).getByRole('button', {
        name: 'Enable multiple connections',
    });

const expectValuesKept = (dialog: HTMLElement) => {
    expect(
        within(dialog).getByLabelText(/^Name of the current connection/),
    ).toHaveValue('PostgreSQL');
    expect(within(dialog).getByLabelText(/^Name\s*\*?$/)).toHaveValue(
        'Finance',
    );
    expect(within(dialog).getByLabelText(/^Host/)).toHaveValue(
        'finance.internal',
    );
    expect(within(dialog).getByLabelText(/^Password/)).toHaveValue('secret');
};

describe('Enable multiple connections', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
        flag.mixedTypesEnabled = true;
    });

    it.each([false, true])(
        'gates a Trino original with the resolved mixed flag %s',
        async (enabled) => {
            flag.mixedTypesEnabled = enabled;
            routeApi({
                availability: { canSwitch: true, reason: null },
                originalWarehouseType: WarehouseTypes.TRINO,
            });
            renderPanel();
            const button = await screen.findByRole('button', {
                name: 'Enable multiple connections',
            });
            await waitFor(() =>
                expect(button).toHaveProperty('disabled', !enabled),
            );
        },
    );
    it('keeps a Postgres original available with the mixed flag off', async () => {
        flag.mixedTypesEnabled = false;
        routeApi({ availability: { canSwitch: true, reason: null } });
        renderPanel();
        await waitFor(() =>
            expect(
                screen.getByRole('button', {
                    name: 'Enable multiple connections',
                }),
            ).toBeEnabled(),
        );
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

    // Full panel render plus a multi-step form; the default 5 s is not enough on a shared CI runner.
    it('hides the extra credential toggle and explains the primary setting in the switch dialog', async () => {
        routeApi({
            availability: { canSwitch: true, reason: null },
            switchResponses: [() => Promise.resolve(switchResult)],
        });
        const user = renderPanel();
        await openDialog(user);
        const form = await fillForm(user);
        await user.click(
            within(form).getByRole('button', { name: /advanced/i }),
        );
        expect(
            within(form).getByText(
                'Require users to provide their own credentials follows the primary connection.',
            ),
        ).toBeInTheDocument();
        expect(
            within(form).queryByText(
                'Require users to provide their own credentials',
            ),
        ).not.toBeInTheDocument();

        await user.click(enableButton(form));
        await waitFor(() =>
            expect(callsTo(`${switchUrl}/preview`)).toHaveLength(1),
        );
        const body = JSON.parse(callsTo(`${switchUrl}/preview`)[0].body!) as {
            connection: {
                warehouseConnection: { requireUserCredentials?: boolean };
            };
        };
        expect(body.connection.warehouseConnection.requireUserCredentials).toBe(
            false,
        );
    }, 20_000);

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

    it('opens one dialog on the setup form, with what happens next', async () => {
        routeApi({ availability: { canSwitch: true, reason: null } });
        const user = renderPanel();
        const dialog = await openDialog(user);

        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(
            within(dialog).getByLabelText(/^Name of the current connection/),
        ).toHaveValue('PostgreSQL');
        expect(within(dialog).getByLabelText(/^Host/)).toBeEnabled();
        expect(
            within(dialog).getByText(/The new connection is tested first/),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText(/There is no way back/),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByText(/connection picker/),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        ).toBeEnabled();
        expect(enableButton(dialog)).toBeEnabled();
        expect(
            within(dialog).queryByText(/People with personal credentials/),
        ).toBeNull();
        expect(screen.queryByText(/Review the switch/)).toBeNull();

        // The consequences follow the name the user gives the current connection.
        const currentName = within(dialog).getByLabelText(
            /^Name of the current connection/,
        );
        await user.clear(currentName);
        await user.paste('Warehouse A');
        expect(
            within(dialog).getByText('Warehouse A').closest('li'),
        ).toHaveTextContent(
            'Everything that exists today keeps using Warehouse A.',
        );
    }, 20_000);

    it('mentions personal credentials when the current connection requires them', async () => {
        routeApi({ availability: { canSwitch: true, reason: null } });
        const user = renderPanel({ requireUserCredentials: true });
        const dialog = await openDialog(user);

        expect(
            within(dialog).getByText(/People with personal credentials/),
        ).toHaveTextContent(
            'People with personal credentials keep them for PostgreSQL, and choose one for the new connection when they first use it.',
        );
    });

    it('tests the connection and enables multiple connections from one click', async () => {
        const preview = deferred();
        const switched = deferred();
        routeApi({
            availability: { canSwitch: true, reason: null },
            previewResponses: [() => preview.promise],
            switchResponses: [() => switched.promise],
        });
        const user = renderPanel();
        await openDialog(user);
        const dialog = await fillForm(user);
        await user.click(enableButton(dialog));

        expect(await within(dialog).findByRole('status')).toHaveTextContent(
            'Testing connection…',
        );
        expect(callsTo(`${switchUrl}/switch`)).toHaveLength(0);

        await act(async () => preview.resolve(plan));
        expect(
            await within(dialog).findByText('Enabling multiple connections…'),
        ).toBeInTheDocument();
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
        expect(screen.queryByText(/Review the switch/)).toBeNull();

        await act(async () => switched.resolve(switchResult));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        const [previewBody] = bodiesTo(`${switchUrl}/preview`);
        const [switchBody] = bodiesTo(`${switchUrl}/switch`);
        expect(bodiesTo(`${switchUrl}/preview`)).toHaveLength(1);
        expect(bodiesTo(`${switchUrl}/switch`)).toHaveLength(1);
        expect(previewBody).toEqual({
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
        const { planHash, idempotencyKey, ...switchRequest } = switchBody;
        expect(switchRequest).toEqual(previewBody);
        expect(planHash).toBe('plan-hash');
        expect(idempotencyKey).toEqual(expect.any(String));
    }, 20_000);

    it('locks the form while enabling and submits a double click once', async () => {
        const preview = deferred();
        routeApi({
            availability: { canSwitch: true, reason: null },
            previewResponses: [() => preview.promise],
            switchResponses: [() => Promise.resolve(switchResult)],
        });
        const user = renderPanel();
        await openDialog(user);
        const dialog = await fillForm(user);
        const button = enableButton(dialog);

        // Two clicks in the same tick, before the button can re-render as disabled.
        act(() => {
            button.click();
            button.click();
        });

        await within(dialog).findByText('Testing connection…');
        expect(callsTo(`${switchUrl}/preview`)).toHaveLength(1);
        expect(
            within(dialog).getByRole('group', { name: 'Connection details' }),
        ).toBeDisabled();
        expect(within(dialog).getByLabelText(/^Host/)).toBeDisabled();
        expect(
            within(dialog).getByLabelText(/^Name of the current connection/),
        ).toBeDisabled();
        expect(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        ).toBeDisabled();
        expect(enableButton(dialog)).toBeDisabled();

        await act(async () => preview.resolve(plan));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(callsTo(`${switchUrl}/preview`)).toHaveLength(1);
        expect(callsTo(`${switchUrl}/switch`)).toHaveLength(1);
    }, 20_000);

    it('blocks the request while the form has validation errors', async () => {
        routeApi({ availability: { canSwitch: true, reason: null } });
        const user = renderPanel();
        const dialog = await openDialog(user);
        await user.clear(
            within(dialog).getByLabelText(/^Name of the current connection/),
        );

        await user.click(enableButton(dialog));

        expect(within(dialog).getByLabelText(/^Name\s*\*?$/)).toBeInvalid();
        expect(
            within(dialog).getByLabelText(/^Name of the current connection/),
        ).toBeInvalid();
        expect(within(dialog).queryByRole('status')).toBeNull();
        expect(callsTo(`${switchUrl}/preview`)).toHaveLength(0);
        expect(callsTo(`${switchUrl}/switch`)).toHaveLength(0);
        expect(screen.getByRole('dialog')).toBe(dialog);
    }, 20_000);

    it('shows a failed connection test in the dialog, keeps the values and never enables', async () => {
        routeApi({
            availability: { canSwitch: true, reason: null },
            previewResponses: [
                () =>
                    Promise.reject(
                        apiError(
                            'Warehouse connection test failed: password authentication failed',
                            400,
                        ),
                    ),
            ],
            switchResponses: [() => Promise.resolve(switchResult)],
        });
        const user = renderPanel();
        await openDialog(user);
        const dialog = await fillForm(user);
        await user.click(enableButton(dialog));

        expect(
            await within(dialog).findByText(
                'Warehouse connection test failed: password authentication failed',
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toBe(dialog);
        expectValuesKept(dialog);
        expect(callsTo(`${switchUrl}/switch`)).toHaveLength(0);
        expect(within(dialog).getByLabelText(/^Host/)).toBeEnabled();

        // Fixing a field clears the stale error; the next click goes through.
        await user.click(within(dialog).getByLabelText(/^Password/));
        await user.paste('2');
        expect(
            within(dialog).queryByText(/password authentication failed/),
        ).toBeNull();
        await user.click(enableButton(dialog));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(callsTo(`${switchUrl}/preview`)).toHaveLength(2);
        expect(callsTo(`${switchUrl}/switch`)).toHaveLength(1);
    }, 20_000);

    it('keeps the values when enabling fails, reuses the key for the same request and uses a new one for a changed request', async () => {
        const failure = () => Promise.reject(apiError('Network hiccup'));
        routeApi({
            availability: { canSwitch: true, reason: null },
            switchResponses: [
                failure,
                failure,
                () => Promise.resolve(switchResult),
            ],
        });
        const user = renderPanel();
        await openDialog(user);
        const dialog = await fillForm(user);

        await user.click(enableButton(dialog));
        // The hook also raises a toast; the dialog shows its own copy.
        await waitFor(() =>
            expect(within(dialog).getByText('Network hiccup')).toBeVisible(),
        );
        expectValuesKept(dialog);
        expect(screen.getByRole('dialog')).toBe(dialog);

        await user.click(enableButton(dialog));
        await waitFor(() =>
            expect(callsTo(`${switchUrl}/switch`)).toHaveLength(2),
        );
        await waitFor(() =>
            expect(enableButton(dialog)).not.toHaveAttribute('data-loading'),
        );
        expectValuesKept(dialog);

        await user.click(within(dialog).getByLabelText(/^Host/));
        await user.paste('2');
        expect(within(dialog).queryByText('Network hiccup')).toBeNull();
        await user.click(enableButton(dialog));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        const [first, retry, changed] = bodiesTo(`${switchUrl}/switch`);
        expect(callsTo(`${switchUrl}/preview`)).toHaveLength(3);
        expect(retry).toEqual(first);
        expect(first.idempotencyKey).toEqual(expect.any(String));
        expect(changed.idempotencyKey).toEqual(expect.any(String));
        expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
    }, 30_000);
});
