import {
    AGENT_IDENTITY_SETTINGS_PATH,
    BigqueryAuthenticationType,
    DbtProjectType,
    ProjectType,
    WarehouseTypes,
    type AiIdentitySource,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type AiServiceAccountParent,
    type Project,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import UpdateProjectConnection from '../../components/ProjectConnection/UpdateProjectConnection';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import { AiServiceAccountCard } from './AiServiceAccountCard';
import { formatAiServiceAccountDate } from './formatAiServiceAccountDate';
import { getAiServiceAccountStatus } from './getAiServiceAccountStatus';
import { ProjectAgentIdentityPage } from './ProjectAgentIdentityPage';

const mocks = vi.hoisted(() => ({
    enabled: true,
    canManage: true,
    toast: vi.fn(),
    errorToast: vi.fn(),
    submit: vi.fn(),
}));
const project = {
    projectUuid: 'project',
    organizationUuid: 'org',
    name: 'Project',
    type: ProjectType.DEFAULT,
    warehouseConnection: {
        type: WarehouseTypes.BIGQUERY,
        project: 'data-project',
        executionProject: 'job-project',
        dataset: 'analytics',
    },
    dbtConnection: { type: DbtProjectType.NONE },
} as Project;
const asPreview = (value: Project): Project => ({
    ...value,
    type: ProjectType.PREVIEW,
    upstreamProjectUuid: 'parent-project',
});
const expectReadOnly = () => {
    for (const name of [
        'Add shared agent account',
        'Replace',
        'Remove',
        "Use the parent's account",
        "Add this preview's own account",
    ]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
};
vi.mock('../../components/common/CodeBlock/CodeBlock', () => ({
    default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));
vi.mock('../../api');
// One handler answers both result and full-envelope requests
mockedLightdashApi.response.mockImplementation((props) =>
    mockedLightdashApi(props),
);
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: mocks.enabled } }),
}));
vi.mock('../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({
        can: () => mocks.canManage,
        cannot: () => !mocks.canManage,
    }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: mocks.toast,
        showToastApiError: mocks.errorToast,
    }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: { rudder: {} } },
        user: { data: { organizationUuid: 'org' } },
    }),
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: project }),
    useUpdateMutation: () => ({ isIdle: true }),
    useUpdateWarehouseCredentialsMutation: () => ({}),
    useTestWarehouseConnectionMutation: () => ({}),
}));
vi.mock('../../hooks/useProjectCompileLogs', () => ({
    useProjectCompileLogs: () => ({}),
}));
vi.mock('../../components/ProjectConnection/ProjectForm', () => ({
    ProjectForm: () => null,
}));
vi.mock('../../components/ProjectConnection/ProjectFormProvider', () => ({
    ProjectFormProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock('../../components/ProjectConnection/formContext', () => ({
    FormProvider: ({ children }: PropsWithChildren) => children,
    useForm: () => ({ values: {}, onSubmit: () => mocks.submit }),
}));

let warehouseType = WarehouseTypes.BIGQUERY;
let credentialsReadable = true;
let verification: AiServiceAccountTestResult | null = null;
let source: AiIdentitySource = 'marked_person';
let slot: AiServiceAccountSlot | null = null;
let parent: AiServiceAccountParent | null = null;
const parentAccount = {
    credentialsReadable: true,
    projectUuid: 'parent-project',
    projectName: 'Production',
    identityUuid: 'parent-generation',
    principal: 'parent@example.test',
};
const savedSlot = {
    uuid: 'slot',
    identityUuid: 'identity',
    projectUuid: 'project',
    warehouseType: WarehouseTypes.BIGQUERY,
    method: 'private_key',
    updatedAt: new Date('2026-10-08T12:00:00Z'),
} as AiServiceAccountSlot;
const snowflakeVerification: AiServiceAccountTestResult = {
    ok: true,
    principal: 'OBSERVED_USER',
    observed: { currentUser: 'OBSERVED_USER', currentRole: 'OBSERVED_ROLE' },
    message: 'Connection works.',
    checkedAt: new Date('2026-10-09T12:00:00Z'),
};
const snowflakeProject = {
    ...project,
    warehouseConnection: { type: WarehouseTypes.SNOWFLAKE },
} as Project;
const key = {
    type: 'service_account',
    client_email: 'secret-email@example.test',
    private_key: 'secret-key',
};
const upload = (contents = JSON.stringify(key)) => {
    fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: {
            files: [
                new File([contents], 'account.json', {
                    type: 'application/json',
                }),
            ],
        },
    });
};
const setup = (
    props = project,
    connectionPage = false,
    identityPage = false,
) => {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false, cacheTime: 0 },
            mutations: { retry: false },
        },
    });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const rendered = renderWithProviders(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                {connectionPage ? (
                    <UpdateProjectConnection projectUuid="project" />
                ) : identityPage ? (
                    <ProjectAgentIdentityPage project={props} />
                ) : (
                    <AiServiceAccountCard project={props} />
                )}
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { ...rendered, invalidate, client };
};
const openForm = async () => {
    fireEvent.click(
        await screen.findByRole('button', {
            name: 'Add shared agent account',
        }),
    );
    return screen.findByRole('dialog', { name: 'Shared agent account' });
};

const expectSteps = (visible: boolean, name: string) => {
    const stepTitles =
        name === 'Trino'
            ? [
                  'Create or choose the Trino login',
                  'Limit what the login can read',
                  'Enter the user and password',
              ]
            : [
                  `Create the account in ${name}`,
                  'Grant it only the data agents may read',
                  'Add it here and select Test',
              ];
    for (const title of stepTitles) {
        if (visible) expect(screen.getByText(title)).toBeVisible();
        else expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
};

describe('AI service account card', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.enabled = true;
        mocks.canManage = true;
        source = 'marked_person';
        warehouseType = WarehouseTypes.BIGQUERY;
        verification = null;
        credentialsReadable = true;
        slot = null;
        parent = null;
        mockedLightdashApi.mockImplementation(async ({ url, method }) => {
            if (url === '/org/agent-identity')
                return {
                    requireVerifiedAgentSessions: false,
                    rules: [
                        {
                            warehouseType,
                            source,
                            projectsMissingAiServiceAccount: null,
                        },
                    ],
                };
            if (url === '/org/users') return { data: [] };
            if (url.endsWith('/test'))
                return warehouseType === WarehouseTypes.SNOWFLAKE
                    ? snowflakeVerification
                    : {
                          ok: true,
                          principal: 'tested-principal',
                          message: 'Connection works.',
                          observed: {},
                          checkedAt: new Date(),
                      };
            if (method === 'GET')
                return {
                    status: 'ok',
                    results: slot,
                    parent,
                    verification: parent ? null : verification,
                    credentialsReadable: parent ? false : credentialsReadable,
                };
            if (method === 'PUT') {
                slot = savedSlot;
                return { status: 'ok', results: slot, verification };
            }
            if (method === 'DELETE') slot = null;
            return slot;
        });
    });
    describe.each([
        [WarehouseTypes.POSTGRES, 'Postgres', 'User and password'],
        [WarehouseTypes.REDSHIFT, 'Redshift', 'User and password'],
        [WarehouseTypes.TRINO, 'Trino', 'User and password'],
        [WarehouseTypes.CLICKHOUSE, 'ClickHouse', 'User and password'],
        [WarehouseTypes.ATHENA, 'Athena', 'Access keys'],
        [WarehouseTypes.BIGQUERY, 'BigQuery', 'Key file'],
        [WarehouseTypes.SNOWFLAKE, 'Snowflake', 'Key pair'],
        [WarehouseTypes.DATABRICKS, 'Databricks', 'Client ID and secret'],
    ] as const)('%s status presentation', (type, name, method) => {
        const props = {
            ...project,
            warehouseConnection: { ...project.warehouseConnection, type },
        } as Project;
        const missing =
            'Agents are refused on this project until you add a shared agent account.';
        const unused = `Agents on this project use each person's own ${name} credentials. The organization rule decides this.`;
        const used = `Agents on this project run as this account. The organization rule for ${name} requires it.`;
        const unreadableParent =
            "This preview can't read the parent project's shared agent account. Ask an admin of Production to replace it.";
        const scenarios = [
            'in use',
            'not in use',
            'empty not in use',
            'missing required',
            'inherited',
            'unreadable parent required',
            'unreadable parent not required',
            'own unreadable required',
            'own unreadable not required',
        ] as const;
        beforeEach(() => {
            warehouseType = type;
        });
        it('shows all three steps without a section control when no account exists', async () => {
            setup(props);
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            });
            expectSteps(true, name);
            expect(
                screen.queryByRole('button', {
                    name: 'How to set up the shared agent account',
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('How to set up the shared agent account'),
            ).not.toBeInTheDocument();
        });
        it('keeps the steps hidden before and after a successful Test', async () => {
            slot = { ...savedSlot, warehouseType: type };
            setup(props);
            const test = await screen.findByRole('button', { name: 'Test' });
            expectSteps(false, name);
            fireEvent.click(test);
            await screen.findByText(/^Tested /);
            expectSteps(false, name);
        });
        it.each(['own', 'inherited'] as const)(
            'hides steps for a saved %s account without verification',
            async (owner) => {
                if (owner === 'own')
                    slot = { ...savedSlot, warehouseType: type };
                else parent = { ...parentAccount, principal: null };
                setup(owner === 'inherited' ? asPreview(props) : props);
                await screen.findByRole('button', { name: 'Test' });
                expectSteps(false, name);
            },
        );
        it.each(['own', 'inherited'] as const)(
            'hides steps for a saved %s account with persisted passed verification',
            async (owner) => {
                if (owner === 'own') {
                    slot = { ...savedSlot, warehouseType: type };
                    verification = snowflakeVerification;
                } else
                    parent = {
                        ...parentAccount,
                        verification: snowflakeVerification,
                    };
                setup(owner === 'inherited' ? asPreview(props) : props);
                await screen.findByRole('button', { name: 'Test' });
                expectSteps(false, name);
            },
        );
        it.each(scenarios)(
            'renders %s with status first and steps only without an account',
            async (scenario) => {
                const empty =
                    scenario === 'missing required' ||
                    scenario === 'empty not in use';
                const inherited =
                    scenario === 'inherited' ||
                    scenario.startsWith('unreadable parent');
                const required = ![
                    'not in use',
                    'empty not in use',
                    'unreadable parent not required',
                    'own unreadable not required',
                ].includes(scenario);
                source = required ? 'ai_service_account' : 'marked_person';
                slot =
                    empty || inherited
                        ? null
                        : { ...savedSlot, warehouseType: type };
                parent = inherited
                    ? {
                          ...parentAccount,
                          credentialsReadable:
                              !scenario.startsWith('unreadable parent'),
                      }
                    : null;
                credentialsReadable =
                    !inherited && !scenario.startsWith('own unreadable');
                const { container } = setup({
                    ...props,
                    type: inherited ? ProjectType.PREVIEW : ProjectType.DEFAULT,
                    upstreamProjectUuid: inherited
                        ? 'parent-project'
                        : undefined,
                });
                await screen.findByRole('button', {
                    name: empty ? 'Add shared agent account' : 'Test',
                });
                expectSteps(empty, name);
                const refused =
                    scenario === 'missing required' ||
                    scenario === 'unreadable parent required';
                const statusText =
                    scenario === 'missing required'
                        ? missing
                        : scenario === 'unreadable parent required'
                          ? `Agents are refused on this preview. ${unreadableParent}`
                          : required
                            ? used
                            : unused;
                const status = screen.getByText(statusText);
                if (refused) {
                    expect(
                        screen.queryByText('In use'),
                    ).not.toBeInTheDocument();
                    expect(
                        screen.queryByText('Not in use'),
                    ).not.toBeInTheDocument();
                    expect(screen.getByRole('alert')).toHaveTextContent(
                        statusText,
                    );
                } else {
                    const badge = screen.getByText(
                        required ? 'In use' : 'Not in use',
                    );
                    expect(badge.closest('[data-variant]')).toHaveAttribute(
                        'data-variant',
                        'light',
                    );
                    expect(
                        screen.getByRole('heading', {
                            name: 'Shared agent account',
                        }).parentElement,
                    ).toContainElement(badge);
                    expect(
                        screen.getByRole('link', {
                            name: 'Organization settings',
                        }),
                    ).toHaveAttribute('href', AGENT_IDENTITY_SETTINGS_PATH);
                }
                if (scenario === 'unreadable parent not required')
                    expect(screen.getByRole('alert')).toHaveTextContent(
                        unreadableParent,
                    );
                if (scenario.startsWith('own unreadable'))
                    expect(screen.getByRole('alert')).toHaveTextContent(
                        "The shared agent account can't be read. Replace it.",
                    );
                const summary = empty
                    ? screen.getByRole('button', {
                          name: 'Add shared agent account',
                      })
                    : (screen.queryByText(
                          /^Uses the shared agent account from/,
                      ) ?? screen.getByText(/^(Signs in as|Not tested yet)/));
                if (!empty)
                    expect(
                        summary.compareDocumentPosition(
                            screen.getByText(method),
                        ),
                    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
                expect(status.compareDocumentPosition(summary)).toBe(
                    Node.DOCUMENT_POSITION_FOLLOWING,
                );
                if (empty)
                    expect(
                        summary.compareDocumentPosition(
                            screen.getByText(
                                type === WarehouseTypes.TRINO
                                    ? 'Create or choose the Trino login'
                                    : `Create the account in ${name}`,
                            ),
                        ),
                    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
                if (empty) {
                    expect(summary).toHaveAttribute('data-variant', 'filled');
                    expect(
                        summary.closest('[data-variant="dotted"]'),
                    ).toBeNull();
                } else {
                    expect(
                        screen
                            .getAllByRole('button')
                            .map((button) => button.textContent),
                    ).toEqual(
                        inherited ? ['Test'] : ['Test', 'Replace', 'Remove'],
                    );
                    if (scenario === 'inherited') {
                        expect(
                            screen.getByText(
                                /Uses the shared agent account from/,
                            ),
                        ).toHaveTextContent(
                            'Uses the shared agent account from Production.',
                        );
                        expect(
                            screen.getByRole('link', { name: 'Production' }),
                        ).toHaveAttribute(
                            'href',
                            '/generalSettings/projectManagement/parent-project/agentIdentity',
                        );
                    }
                }
                expect(container).not.toHaveTextContent(' · ');
                expect(container).not.toHaveTextContent('M2M');
                expect(container).not.toHaveTextContent('agent-active');
                expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                    expect.objectContaining({ method: 'POST' }),
                );
            },
        );
        it.each(['failure', 'error'] as const)(
            'keeps the steps hidden and reports Test %s in an Alert',
            async (failure) => {
                slot = { ...savedSlot, warehouseType: type };
                setup(props);
                await screen.findByRole('button', { name: 'Test' });
                expectSteps(false, name);
                if (failure === 'failure')
                    mockedLightdashApi.mockResolvedValueOnce({
                        ...snowflakeVerification,
                        ok: false,
                        principal: null,
                        message: 'Test failed.',
                    });
                else
                    mockedLightdashApi.mockRejectedValueOnce({
                        error: { message: 'Test failed.' },
                    });
                fireEvent.click(screen.getByRole('button', { name: 'Test' }));
                const alert = await screen.findByRole('alert');
                expect(alert).toHaveTextContent('Test failed.');
                expect(alert).toHaveClass('mantine-Alert-root');
                expectSteps(false, name);
                fireEvent.click(screen.getByRole('button', { name: 'Test' }));
                await screen.findByText(/^Tested /);
                expectSteps(false, name);
                expect(screen.getByText(/^Tested /)).toHaveTextContent(
                    `Tested ${formatAiServiceAccountDate(type === WarehouseTypes.SNOWFLAKE ? snowflakeVerification.checkedAt : new Date())}. Added ${formatAiServiceAccountDate(savedSlot.updatedAt)}.`,
                );
                expect(sharedLightdashApi).toHaveBeenCalledWith(
                    expect.objectContaining({
                        method: 'POST',
                        body: JSON.stringify({ credentials: null }),
                    }),
                );
            },
        );
        it('keeps a readable parent with no principal in use', async () => {
            source = 'ai_service_account';
            parent = { ...parentAccount, principal: null };
            setup(asPreview(props));
            expect(await screen.findByText('In use')).toBeVisible();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(
                screen.getByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
        });
        it('ignores stale own credentials when the parent is unreadable', async () => {
            source = 'ai_service_account';
            slot = { ...savedSlot, warehouseType: type };
            parent = { ...parentAccount, credentialsReadable: false };
            setup(asPreview(props));
            expect(await screen.findByRole('alert')).toHaveTextContent(
                `Agents are refused on this preview. ${unreadableParent}`,
            );
            expectReadOnly();
            expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
            expectSteps(false, name);
        });
        it('uses a plain parent reference when its name is unavailable', async () => {
            source = 'ai_service_account';
            parent = {
                ...parentAccount,
                projectName: null,
                credentialsReadable: false,
            };
            setup(asPreview(props));
            expect(await screen.findByRole('alert')).toHaveTextContent(
                "Agents are refused on this preview. This preview can't read the parent project's shared agent account. Ask an admin of the parent project to replace it.",
            );
            expect(
                screen.queryByRole('link', { name: 'Production' }),
            ).not.toBeInTheDocument();
        });
        it('shows passed observations and dates without treating a BigQuery parent principal as a passed Test', async () => {
            parent = { ...parentAccount, verification: snowflakeVerification };
            setup(asPreview(props));
            await screen.findByRole('button', { name: 'Test' });
            if (type === WarehouseTypes.BIGQUERY) {
                expect(
                    screen.getByText('Signs in as parent@example.test'),
                ).toBeVisible();
                expectSteps(false, name);
                expect(screen.queryByText(/^Tested /)).not.toBeInTheDocument();
            } else {
                expectSteps(false, name);
                expect(
                    screen.getByText(
                        `Tested ${formatAiServiceAccountDate(snowflakeVerification.checkedAt)}.`,
                    ),
                ).toBeVisible();
            }
            expect(screen.queryByText(/Added /)).not.toBeInTheDocument();
        });
        it('renders nothing with the flag off', () => {
            mocks.enabled = false;
            const { container } = setup(props);
            expect(container.querySelector('.mantine-Card-root')).toBeNull();
            expect(
                screen.queryByText('Shared agent account'),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(sharedLightdashApi).not.toHaveBeenCalled();
        });
        it.each(scenarios)('derives the pure status for %s', (scenario) => {
            const required = ![
                'not in use',
                'empty not in use',
                'unreadable parent not required',
                'own unreadable not required',
            ].includes(scenario);
            const inherited =
                scenario === 'inherited' ||
                scenario.startsWith('unreadable parent');
            const empty =
                scenario === 'missing required' ||
                scenario === 'empty not in use';
            const result = getAiServiceAccountStatus({
                isPreview: inherited,
                rule: {
                    warehouseType: type,
                    source: required ? 'ai_service_account' : 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
                slot: empty || inherited ? null : savedSlot,
                parent: inherited
                    ? {
                          ...parentAccount,
                          credentialsReadable:
                              !scenario.startsWith('unreadable parent'),
                      }
                    : null,
                credentialsReadable:
                    !inherited && !scenario.startsWith('own unreadable'),
            });
            expect(result).toEqual({
                badge:
                    scenario === 'missing required' ||
                    scenario === 'unreadable parent required'
                        ? null
                        : required
                          ? 'In use'
                          : 'Not in use',
                message:
                    scenario === 'missing required' ||
                    scenario === 'unreadable parent required'
                        ? null
                        : required
                          ? used
                          : unused,
                alert:
                    scenario === 'missing required'
                        ? { color: 'yellow', message: missing }
                        : scenario.startsWith('unreadable parent')
                          ? {
                                color: 'red',
                                message: `${required ? 'Agents are refused on this preview. ' : ''}${unreadableParent}`,
                            }
                          : scenario.startsWith('own unreadable')
                            ? {
                                  color: 'red',
                                  message:
                                      "The shared agent account can't be read. Replace it.",
                              }
                            : null,
            });
        });
    });
    it.each([true, false])(
        'shows the Snowflake per-person agent sign-in rule with own slot %s',
        async (hasSlot) => {
            warehouseType = WarehouseTypes.SNOWFLAKE;
            source = 'agent_sign_in';
            slot = hasSlot ? { ...savedSlot, warehouseType } : null;
            setup(snowflakeProject);
            expect(await screen.findByText('Not in use')).toBeVisible();
            expect(
                screen.getByText(
                    "Agents on this project use each person's own agent sign-in for Snowflake. The organization rule decides this.",
                ),
            ).toBeVisible();
        },
    );
    it('hides the steps after BigQuery Save without Test', async () => {
        setup();
        const dialog = await openForm();
        expectSteps(true, 'BigQuery');
        upload();
        const save = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(save).toBeEnabled());
        fireEvent.click(save);
        await screen.findByRole('button', { name: 'Replace' });
        expectSteps(false, 'BigQuery');
        expect(screen.queryByText(/^Tested /)).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
    });
    it('keeps the BigQuery parent principal gate after a passed Test', async () => {
        parent = { ...parentAccount, principal: null };
        setup(asPreview(project));
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        await screen.findByText(/^Tested /);
        expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Not tested yet. Select Test to see who it signs in as.',
            ),
        ).toBeVisible();
        expect(
            screen.queryByText('Create the account in BigQuery'),
        ).not.toBeInTheDocument();
    });
    it('derives unreadable and unknown-parent status without mutation', () => {
        const rule = {
            warehouseType: WarehouseTypes.BIGQUERY as const,
            source: 'ai_service_account' as const,
            projectsMissingAiServiceAccount: null,
        };
        const unreadableParent = {
            ...parentAccount,
            credentialsReadable: false,
        };
        expect(
            getAiServiceAccountStatus({
                isPreview: true,
                rule,
                slot: null,
                parent: unreadableParent,
                credentialsReadable: true,
            }),
        ).toMatchObject({
            badge: null,
            alert: {
                color: 'red',
                message:
                    "Agents are refused on this preview. This preview can't read the parent project's shared agent account. Ask an admin of Production to replace it.",
            },
        });
        expect(unreadableParent.credentialsReadable).toBe(false);
        expect(
            getAiServiceAccountStatus({
                isPreview: true,
                rule,
                slot: null,
                parent: { ...parentAccount, principal: null },
                credentialsReadable: false,
            }),
        ).toMatchObject({ badge: 'In use', alert: null });
        expect(
            getAiServiceAccountStatus({
                isPreview: false,
                rule: {
                    ...rule,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source: 'agent_sign_in',
                },
                slot: null,
                parent: null,
                credentialsReadable: false,
            }),
        ).toEqual({
            badge: 'Not in use',
            message:
                "Agents on this project use each person's own agent sign-in for Snowflake. The organization rule decides this.",
            alert: null,
        });
    });
    describe('Databricks', () => {
        const databricksProject = {
            ...project,
            warehouseConnection: {
                type: WarehouseTypes.DATABRICKS,
                serverHostName: 'workspace.example.test',
                httpPath: '/sql/warehouse',
                catalog: 'catalog',
                database: 'schema',
            },
        } as Project;
        const recorded: AiServiceAccountTestResult = {
            ok: true,
            principal: 'recorded-principal',
            observed: { currentUser: 'recorded-principal' },
            message: 'Connection works.',
            checkedAt: new Date('2026-10-09T12:00:00Z'),
        };
        beforeEach(() => {
            warehouseType = WarehouseTypes.DATABRICKS;
            slot = { ...savedSlot, warehouseType, method: 'oauth_m2m' };
            verification = recorded;
        });
        it('shows recorded verification on the project page and replaces it with a fresh Test', async () => {
            setup(databricksProject, false, true);
            expect(
                await screen.findByText('Signs in as recorded-principal'),
            ).toBeVisible();
            expect(screen.getByText('Client ID and secret')).toBeVisible();
            expect(screen.getByText(/Tested/)).toHaveTextContent('Added');
            expect(
                screen.getAllByRole('button', { name: 'Test' }),
            ).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(
                await screen.findByText('Signs in as tested-principal'),
            ).toBeVisible();
            expect(
                screen.queryByText('Signs in as recorded-principal'),
            ).not.toBeInTheDocument();
        });
        it('does not invent a principal for an unverified slot', async () => {
            verification = null;
            setup(databricksProject);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('marks the recorded observation as historical after a failed Test', async () => {
            setup(databricksProject);
            const button = await screen.findByRole('button', { name: 'Test' });
            mockedLightdashApi.mockResolvedValueOnce({
                ...recorded,
                ok: false,
                principal: null,
                message: 'Access denied.',
            });
            fireEvent.click(button);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Access denied.',
            );
            expect(
                screen.getByText('Signs in as recorded-principal'),
            ).toBeVisible();
            expect(
                screen.getByText(
                    'The account above is from the last successful check.',
                ),
            ).toBeVisible();
        });
        it('drops a Test result after the slot generation changes', async () => {
            const { client } = setup(databricksProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Test' }),
            );
            await screen.findByText('Signs in as tested-principal');
            slot = { ...slot!, identityUuid: 'replacement' };
            verification = null;
            await client.invalidateQueries(['ai-access']);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('shows the inherited account read-only with warehouse-correct details', async () => {
            slot = null;
            parent = {
                ...parentAccount,
                principal: null,
                verification: recorded,
            };
            setup(asPreview(databricksProject));
            expect(
                await screen.findByText('Signs in as recorded-principal'),
            ).toBeVisible();
            expect(
                screen.getByRole('link', { name: 'Production' }),
            ).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/parent-project/agentIdentity',
            );
            expect(
                screen.queryByText(/key file|different key|could not be read/),
            ).not.toBeInTheDocument();
            expectReadOnly();
        });
        it('ignores a stale stored preview account without removing it', async () => {
            parent = {
                ...parentAccount,
                principal: recorded.principal,
                verification: recorded,
            };
            setup(asPreview(databricksProject));
            expect(
                await screen.findByText(/Uses the shared agent account from/),
            ).toBeVisible();
            expectReadOnly();
        });
        it('warns about required missing credentials and offers Add', async () => {
            slot = null;
            source = 'ai_service_account';
            setup(databricksProject);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Agents are refused on this project until you add a shared agent account.',
            );
            expect(
                screen.getByRole('button', {
                    name: 'Add shared agent account',
                }),
            ).toBeVisible();
        });
        it.each(['flag', 'permission'])(
            'hides the Databricks page with no requests for %s',
            (reason) => {
                mocks.enabled = reason !== 'flag';
                mocks.canManage = reason !== 'permission';
                setup(databricksProject, false, true);
                expect(
                    screen.queryByText('Shared agent account'),
                ).not.toBeInTheDocument();
                expect(sharedLightdashApi).not.toHaveBeenCalled();
            },
        );
    });
    describe('Athena', () => {
        const athenaProject = {
            ...project,
            warehouseConnection: {
                type: WarehouseTypes.ATHENA,
                region: 'eu-west-1',
                database: 'AwsDataCatalog',
                schema: 'analytics',
                workGroup: 'human-workgroup',
                s3StagingDir: 's3://human-results/',
            },
        } as Project;
        const recorded: AiServiceAccountTestResult = {
            ok: true,
            principal: 'arn:aws:sts::123456789012:assumed-role/agent/session',
            observed: {
                principalArn:
                    'arn:aws:sts::123456789012:assumed-role/agent/session',
            },
            message: 'Connection works.',
            checkedAt: new Date('2026-10-09T12:00:00Z'),
        };
        beforeEach(() => {
            warehouseType = WarehouseTypes.ATHENA;
            slot = { ...savedSlot, warehouseType, method: 'access_key' };
            verification = recorded;
        });
        it('shows recorded verification on the project page and replaces it with a fresh Test', async () => {
            setup(athenaProject, false, true);
            expect(
                await screen.findByText(
                    'Signs in as arn:aws:sts::123456789012:assumed-role/agent/session',
                ),
            ).toBeVisible();
            expect(screen.getByText('Access keys')).toBeVisible();
            expect(screen.getByText(/Tested/)).toHaveTextContent('Added');
            expect(
                screen.getAllByRole('button', { name: 'Test' }),
            ).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(
                await screen.findByText('Signs in as tested-principal'),
            ).toBeVisible();
            expect(
                screen.queryByText(
                    'Signs in as arn:aws:sts::123456789012:assumed-role/agent/session',
                ),
            ).not.toBeInTheDocument();
        });
        it('does not invent a principal for an unverified slot', async () => {
            verification = null;
            setup(athenaProject);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('marks the recorded observation as historical after a failed Test', async () => {
            setup(athenaProject);
            const button = await screen.findByRole('button', { name: 'Test' });
            mockedLightdashApi.mockResolvedValueOnce({
                ...recorded,
                ok: false,
                principal: null,
                message: 'Access denied.',
            });
            fireEvent.click(button);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Access denied.',
            );
            expect(
                screen.getByText(
                    'Signs in as arn:aws:sts::123456789012:assumed-role/agent/session',
                ),
            ).toBeVisible();
            expect(
                screen.getByText(
                    'The account above is from the last successful check.',
                ),
            ).toBeVisible();
        });
        it('drops a Test result after the slot generation changes', async () => {
            const { client } = setup(athenaProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Test' }),
            );
            await screen.findByText('Signs in as tested-principal');
            slot = { ...slot!, identityUuid: 'replacement' };
            verification = null;
            await client.invalidateQueries(['ai-access']);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('shows the inherited account read-only with warehouse-correct details', async () => {
            slot = null;
            parent = {
                ...parentAccount,
                principal: null,
                verification: recorded,
            };
            setup(asPreview(athenaProject));
            expect(
                await screen.findByText(
                    'Signs in as arn:aws:sts::123456789012:assumed-role/agent/session',
                ),
            ).toBeVisible();
            expect(
                screen.getByRole('link', { name: 'Production' }),
            ).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/parent-project/agentIdentity',
            );
            expect(
                screen.queryByText(/key file|different key|could not be read/),
            ).not.toBeInTheDocument();
            expectReadOnly();
        });
        it('ignores a stale stored preview account without removing it', async () => {
            parent = {
                ...parentAccount,
                principal: recorded.principal,
                verification: recorded,
            };
            setup(asPreview(athenaProject));
            expect(
                await screen.findByText(/Uses the shared agent account from/),
            ).toBeVisible();
            expectReadOnly();
        });
        it('replaces credentials without prefill and removes them only after confirmation', async () => {
            const handler = mockedLightdashApi.getMockImplementation()!;
            const replacement = {
                ...recorded,
                principal: 'arn:aws:iam::123456789012:user/replacement-agent',
                observed: {
                    principalArn:
                        'arn:aws:iam::123456789012:user/replacement-agent',
                },
            };
            mockedLightdashApi.mockImplementation(async (request) => {
                if (request.method === 'PUT') {
                    slot = {
                        ...savedSlot,
                        warehouseType,
                        method: 'access_key',
                        identityUuid: 'replacement-generation',
                    };
                    verification = replacement;
                    return { status: 'ok', results: slot, verification };
                }
                return handler(request);
            });
            setup(athenaProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Replace' }),
            );
            const dialog = await screen.findByRole('dialog');
            for (const [label, value] of [
                ['Access key ID', 'replacement-key-id'],
                ['Secret access key', 'replacement-secret'],
                ['Agent workgroup', 'replacement-workgroup'],
                ['S3 results location', 's3://replacement-results/'],
            ]) {
                const input = within(dialog).getByLabelText(label, {
                    exact: false,
                });
                expect(input).toHaveValue('');
                fireEvent.change(input, { target: { value } });
            }
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Test and save' }),
            );
            expect(
                await screen.findByText(`Signs in as ${replacement.principal}`),
            ).toBeVisible();
            expect(
                screen.queryByText(`Signs in as ${recorded.principal}`),
            ).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
            const confirmation = await screen.findByRole('dialog', {
                name: 'Remove shared agent account',
            });
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'DELETE' }),
            );
            fireEvent.click(
                within(confirmation).getByRole('button', { name: 'Remove' }),
            );
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            });
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('warns about required missing credentials and offers Add', async () => {
            slot = null;
            source = 'ai_service_account';
            setup(athenaProject);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Agents are refused on this project until you add a shared agent account.',
            );
            expect(
                screen.getByRole('button', {
                    name: 'Add shared agent account',
                }),
            ).toBeVisible();
        });
        it.each(['flag', 'permission'])(
            'hides the Athena page with no requests for %s',
            (reason) => {
                mocks.enabled = reason !== 'flag';
                mocks.canManage = reason !== 'permission';
                setup(athenaProject, false, true);
                expect(
                    screen.queryByText('Shared agent account'),
                ).not.toBeInTheDocument();
                expect(sharedLightdashApi).not.toHaveBeenCalled();
            },
        );
    });
    describe('Postgres', () => {
        const postgresProject = {
            ...project,
            warehouseConnection: {
                type: WarehouseTypes.POSTGRES,
                host: 'warehouse.internal',
                port: 5432,
                dbname: 'analytics',
                schema: 'reporting',
            },
        } as Project;
        const recorded: AiServiceAccountTestResult = {
            ok: true,
            principal: 'ai_agents',
            observed: {
                currentUser: 'ai_agents',
            },
            message: 'Connection works.',
            checkedAt: new Date('2026-10-09T12:00:00Z'),
        };
        beforeEach(() => {
            warehouseType = WarehouseTypes.POSTGRES;
            slot = { ...savedSlot, warehouseType, method: 'password' };
            verification = recorded;
        });
        it('shows recorded verification on the project page and replaces it with a fresh Test', async () => {
            setup(postgresProject, false, true);
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            expect(screen.getByText('User and password')).toBeVisible();
            expect(screen.getByText(/Tested/)).toHaveTextContent('Added');
            expect(
                screen.getAllByRole('button', { name: 'Test' }),
            ).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(
                await screen.findByText('Signs in as tested-principal'),
            ).toBeVisible();
            expect(
                screen.queryByText('Signs in as ai_agents'),
            ).not.toBeInTheDocument();
        });
        it('does not invent a principal for an unverified slot', async () => {
            verification = null;
            setup(postgresProject);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('marks the recorded observation as historical after a failed Test', async () => {
            setup(postgresProject);
            const button = await screen.findByRole('button', { name: 'Test' });
            mockedLightdashApi.mockResolvedValueOnce({
                ...recorded,
                ok: false,
                principal: null,
                message: 'Access denied.',
            });
            fireEvent.click(button);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Access denied.',
            );
            expect(screen.getByText('Signs in as ai_agents')).toBeVisible();
            expect(
                screen.getByText(
                    'The account above is from the last successful check.',
                ),
            ).toBeVisible();
        });
        it('drops a Test result after the slot generation changes', async () => {
            const { client } = setup(postgresProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Test' }),
            );
            await screen.findByText('Signs in as tested-principal');
            slot = { ...slot!, identityUuid: 'replacement' };
            verification = null;
            await client.invalidateQueries(['ai-access']);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('shows the inherited account read-only with warehouse-correct details', async () => {
            slot = null;
            parent = {
                ...parentAccount,
                principal: null,
                verification: recorded,
            };
            setup(asPreview(postgresProject));
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            expect(
                screen.getByRole('link', { name: 'Production' }),
            ).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/parent-project/agentIdentity',
            );
            expect(
                screen.queryByText(/key file|different key|could not be read/),
            ).not.toBeInTheDocument();
            expectReadOnly();
        });
        it('ignores a stale stored preview account without removing it', async () => {
            parent = {
                ...parentAccount,
                principal: recorded.principal,
                verification: recorded,
            };
            setup(asPreview(postgresProject));
            expect(
                await screen.findByText(/Uses the shared agent account from/),
            ).toBeVisible();
            expectReadOnly();
        });
        it('replaces credentials without prefill and removes them only after confirmation', async () => {
            const handler = mockedLightdashApi.getMockImplementation()!;
            const replacement = {
                ...recorded,
                principal: 'replacement_user',
                observed: {
                    currentUser: 'replacement_user',
                },
            };
            mockedLightdashApi.mockImplementation(async (request) => {
                if (request.method === 'PUT') {
                    slot = {
                        ...savedSlot,
                        warehouseType,
                        method: 'password',
                        identityUuid: 'replacement-generation',
                    };
                    verification = replacement;
                    return { status: 'ok', results: slot, verification };
                }
                return handler(request);
            });
            setup(postgresProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Replace' }),
            );
            const dialog = await screen.findByRole('dialog');
            for (const [label, value] of [
                [/^User/, 'replacement-user'],
                [/^Password/, 'replacement-password'],
            ] as const) {
                const input = within(dialog).getByLabelText(label, {
                    exact: false,
                });
                expect(input).toHaveValue('');
                fireEvent.change(input, { target: { value } });
            }
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Test and save' }),
            );
            expect(
                await screen.findByText(`Signs in as ${replacement.principal}`),
            ).toBeVisible();
            expect(
                screen.queryByText(`Signs in as ${recorded.principal}`),
            ).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
            const confirmation = await screen.findByRole('dialog', {
                name: 'Remove shared agent account',
            });
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'DELETE' }),
            );
            fireEvent.click(
                within(confirmation).getByRole('button', { name: 'Remove' }),
            );
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            });
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('warns about required missing credentials and offers Add', async () => {
            slot = null;
            source = 'ai_service_account';
            setup(postgresProject);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Agents are refused on this project until you add a shared agent account.',
            );
            expect(
                screen.getByRole('button', {
                    name: 'Add shared agent account',
                }),
            ).toBeVisible();
        });
        it.each(['flag', 'permission'])(
            'hides the Postgres page with no requests for %s',
            (reason) => {
                mocks.enabled = reason !== 'flag';
                mocks.canManage = reason !== 'permission';
                setup(postgresProject, false, true);
                expect(
                    screen.queryByText('Shared agent account'),
                ).not.toBeInTheDocument();
                expect(sharedLightdashApi).not.toHaveBeenCalled();
            },
        );
    });
    describe('Redshift', () => {
        const redshiftProject = {
            ...project,
            warehouseConnection: {
                type: WarehouseTypes.REDSHIFT,
                host: 'warehouse.internal',
                port: 5432,
                dbname: 'analytics',
                schema: 'reporting',
            },
        } as Project;
        const recorded: AiServiceAccountTestResult = {
            ok: true,
            principal: 'ai_agents',
            observed: {
                currentUser: 'ai_agents',
            },
            message: 'Connection works.',
            checkedAt: new Date('2026-10-09T12:00:00Z'),
        };
        beforeEach(() => {
            warehouseType = WarehouseTypes.REDSHIFT;
            slot = { ...savedSlot, warehouseType, method: 'password' };
            verification = recorded;
        });
        it('shows recorded verification on the project page and replaces it with a fresh Test', async () => {
            setup(redshiftProject, false, true);
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            expect(screen.getByText('User and password')).toBeVisible();
            expect(screen.getByText(/Tested/)).toHaveTextContent('Added');
            expect(
                screen.getAllByRole('button', { name: 'Test' }),
            ).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(
                await screen.findByText('Signs in as tested-principal'),
            ).toBeVisible();
            expect(
                screen.queryByText('Signs in as ai_agents'),
            ).not.toBeInTheDocument();
        });
        it('does not invent a principal for an unverified slot', async () => {
            verification = null;
            setup(redshiftProject);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('marks the recorded observation as historical after a failed Test', async () => {
            setup(redshiftProject);
            const button = await screen.findByRole('button', { name: 'Test' });
            mockedLightdashApi.mockResolvedValueOnce({
                ...recorded,
                ok: false,
                principal: null,
                message: 'Access denied.',
            });
            fireEvent.click(button);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Access denied.',
            );
            expect(screen.getByText('Signs in as ai_agents')).toBeVisible();
            expect(
                screen.getByText(
                    'The account above is from the last successful check.',
                ),
            ).toBeVisible();
        });
        it('drops a Test result after the slot generation changes', async () => {
            const { client } = setup(redshiftProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Test' }),
            );
            await screen.findByText('Signs in as tested-principal');
            slot = { ...slot!, identityUuid: 'replacement' };
            verification = null;
            await client.invalidateQueries(['ai-access']);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('shows the inherited account read-only with warehouse-correct details', async () => {
            slot = null;
            parent = {
                ...parentAccount,
                principal: null,
                verification: recorded,
            };
            setup(asPreview(redshiftProject));
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            expect(
                screen.getByRole('link', { name: 'Production' }),
            ).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/parent-project/agentIdentity',
            );
            expect(
                screen.queryByText(/key file|different key|could not be read/),
            ).not.toBeInTheDocument();
            expectReadOnly();
        });
        it('ignores a stale stored preview account without removing it', async () => {
            parent = {
                ...parentAccount,
                principal: recorded.principal,
                verification: recorded,
            };
            setup(asPreview(redshiftProject));
            expect(
                await screen.findByText(/Uses the shared agent account from/),
            ).toBeVisible();
            expectReadOnly();
        });
        it('replaces credentials without prefill and removes them only after confirmation', async () => {
            const handler = mockedLightdashApi.getMockImplementation()!;
            const replacement = {
                ...recorded,
                principal: 'replacement_user',
                observed: {
                    currentUser: 'replacement_user',
                },
            };
            mockedLightdashApi.mockImplementation(async (request) => {
                if (request.method === 'PUT') {
                    slot = {
                        ...savedSlot,
                        warehouseType,
                        method: 'password',
                        identityUuid: 'replacement-generation',
                    };
                    verification = replacement;
                    return { status: 'ok', results: slot, verification };
                }
                return handler(request);
            });
            setup(redshiftProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Replace' }),
            );
            const dialog = await screen.findByRole('dialog');
            for (const [label, value] of [
                [/^User/, 'replacement-user'],
                [/^Password/, 'replacement-password'],
            ] as const) {
                const input = within(dialog).getByLabelText(label, {
                    exact: false,
                });
                expect(input).toHaveValue('');
                fireEvent.change(input, { target: { value } });
            }
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Test and save' }),
            );
            expect(
                await screen.findByText(`Signs in as ${replacement.principal}`),
            ).toBeVisible();
            expect(
                screen.queryByText(`Signs in as ${recorded.principal}`),
            ).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
            const confirmation = await screen.findByRole('dialog', {
                name: 'Remove shared agent account',
            });
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'DELETE' }),
            );
            fireEvent.click(
                within(confirmation).getByRole('button', { name: 'Remove' }),
            );
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            });
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('warns about required missing credentials and offers Add', async () => {
            slot = null;
            source = 'ai_service_account';
            setup(redshiftProject);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Agents are refused on this project until you add a shared agent account.',
            );
            expect(
                screen.getByRole('button', {
                    name: 'Add shared agent account',
                }),
            ).toBeVisible();
        });
        it.each(['flag', 'permission'])(
            'hides the Redshift page with no requests for %s',
            (reason) => {
                mocks.enabled = reason !== 'flag';
                mocks.canManage = reason !== 'permission';
                setup(redshiftProject, false, true);
                expect(
                    screen.queryByText('Shared agent account'),
                ).not.toBeInTheDocument();
                expect(sharedLightdashApi).not.toHaveBeenCalled();
            },
        );
    });
    describe('Trino', () => {
        const trinoProject = {
            ...project,
            warehouseConnection: {
                type: WarehouseTypes.TRINO,
                host: 'warehouse.internal',
                port: 8443,
                http_scheme: 'https',
                dbname: 'analytics',
                schema: 'reporting',
            },
        } as Project;
        const recorded: AiServiceAccountTestResult = {
            ok: true,
            principal: 'MappedAgent/RestrictedRole',
            observed: {
                currentUser: 'MappedAgent/RestrictedRole',
            },
            message: 'Connection works.',
            checkedAt: new Date('2026-10-09T12:00:00Z'),
        };
        beforeEach(() => {
            warehouseType = WarehouseTypes.TRINO;
            slot = { ...savedSlot, warehouseType, method: 'password' };
            verification = recorded;
        });
        it('shows recorded verification on the project page and replaces it with a fresh Test', async () => {
            setup(trinoProject, false, true);
            expect(
                await screen.findByText(
                    'Signs in as MappedAgent/RestrictedRole',
                ),
            ).toBeVisible();
            expect(screen.getByText('User and password')).toBeVisible();
            expect(screen.getByText(/Tested/)).toHaveTextContent('Added');
            expect(
                screen.getAllByRole('button', { name: 'Test' }),
            ).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(
                await screen.findByText('Signs in as tested-principal'),
            ).toBeVisible();
            expect(
                screen.queryByText('Signs in as MappedAgent/RestrictedRole'),
            ).not.toBeInTheDocument();
        });
        it('does not invent a principal for an unverified slot', async () => {
            verification = null;
            setup(trinoProject);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('marks the recorded observation as historical after a failed Test', async () => {
            setup(trinoProject);
            const button = await screen.findByRole('button', { name: 'Test' });
            mockedLightdashApi.mockResolvedValueOnce({
                ...recorded,
                ok: false,
                principal: null,
                message: 'Access denied.',
            });
            fireEvent.click(button);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Access denied.',
            );
            expect(
                screen.getByText('Signs in as MappedAgent/RestrictedRole'),
            ).toBeVisible();
            expect(
                screen.getByText(
                    'The account above is from the last successful check.',
                ),
            ).toBeVisible();
        });
        it('drops a Test result after the slot generation changes', async () => {
            const { client } = setup(trinoProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Test' }),
            );
            await screen.findByText('Signs in as tested-principal');
            slot = { ...slot!, identityUuid: 'replacement' };
            verification = null;
            await client.invalidateQueries(['ai-access']);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('shows the inherited account read-only with warehouse-correct details', async () => {
            slot = null;
            parent = {
                ...parentAccount,
                principal: null,
                verification: recorded,
            };
            setup(asPreview(trinoProject));
            expect(
                await screen.findByText(
                    'Signs in as MappedAgent/RestrictedRole',
                ),
            ).toBeVisible();
            expect(
                screen.getByRole('link', { name: 'Production' }),
            ).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/parent-project/agentIdentity',
            );
            expect(
                screen.queryByText(/key file|different key|could not be read/),
            ).not.toBeInTheDocument();
            expectReadOnly();
        });
        it('ignores a stale stored preview account without removing it', async () => {
            parent = {
                ...parentAccount,
                principal: recorded.principal,
                verification: recorded,
            };
            setup(asPreview(trinoProject));
            expect(
                await screen.findByText(/Uses the shared agent account from/),
            ).toBeVisible();
            expectReadOnly();
        });
        it('replaces credentials without prefill and removes them only after confirmation', async () => {
            const handler = mockedLightdashApi.getMockImplementation()!;
            const replacement = {
                ...recorded,
                principal: 'replacement_user',
                observed: {
                    currentUser: 'replacement_user',
                },
            };
            mockedLightdashApi.mockImplementation(async (request) => {
                if (request.method === 'PUT') {
                    slot = {
                        ...savedSlot,
                        warehouseType,
                        method: 'password',
                        identityUuid: 'replacement-generation',
                    };
                    verification = replacement;
                    return { status: 'ok', results: slot, verification };
                }
                return handler(request);
            });
            setup(trinoProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Replace' }),
            );
            const dialog = await screen.findByRole('dialog');
            for (const [label, value] of [
                [/^User/, 'replacement-user'],
                [/^Password/, 'replacement-password'],
            ] as const) {
                const input = within(dialog).getByLabelText(label, {
                    exact: false,
                });
                expect(input).toHaveValue('');
                fireEvent.change(input, { target: { value } });
            }
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Test and save' }),
            );
            expect(
                await screen.findByText(`Signs in as ${replacement.principal}`),
            ).toBeVisible();
            expect(
                screen.queryByText(`Signs in as ${recorded.principal}`),
            ).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
            const confirmation = await screen.findByRole('dialog', {
                name: 'Remove shared agent account',
            });
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'DELETE' }),
            );
            fireEvent.click(
                within(confirmation).getByRole('button', { name: 'Remove' }),
            );
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            });
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('warns about required missing credentials and offers Add', async () => {
            slot = null;
            source = 'ai_service_account';
            setup(trinoProject);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Agents are refused on this project until you add a shared agent account.',
            );
            expect(
                screen.getByRole('button', {
                    name: 'Add shared agent account',
                }),
            ).toBeVisible();
        });
        it.each(['flag', 'permission'])(
            'hides the Trino page with no requests for %s',
            (reason) => {
                mocks.enabled = reason !== 'flag';
                mocks.canManage = reason !== 'permission';
                setup(trinoProject, false, true);
                expect(
                    screen.queryByText('Shared agent account'),
                ).not.toBeInTheDocument();
                expect(sharedLightdashApi).not.toHaveBeenCalled();
            },
        );
    });
    describe('ClickHouse', () => {
        const clickhouseProject = {
            ...project,
            warehouseConnection: {
                type: WarehouseTypes.CLICKHOUSE,
                host: 'warehouse.internal',
                port: 8123,
                secure: false,
                schema: 'reporting',
            },
        } as Project;
        const recorded: AiServiceAccountTestResult = {
            ok: true,
            principal: 'ai_agents',
            observed: {
                currentUser: 'ai_agents',
                readonly: '2',
                useQueryCache: '0',
            },
            message: 'Connection works.',
            checkedAt: new Date('2026-10-09T12:00:00Z'),
        };
        beforeEach(() => {
            warehouseType = WarehouseTypes.CLICKHOUSE;
            slot = { ...savedSlot, warehouseType, method: 'password' };
            verification = recorded;
        });
        it('shows recorded verification on the project page and replaces it with a fresh Test', async () => {
            setup(clickhouseProject, false, true);
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            expect(screen.getByText('User and password')).toBeVisible();
            expect(screen.getByText(/Tested/)).toHaveTextContent('Added');
            expect(
                screen.getAllByRole('button', { name: 'Test' }),
            ).toHaveLength(1);
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(
                await screen.findByText('Signs in as tested-principal'),
            ).toBeVisible();
            expect(
                screen.queryByText('Signs in as ai_agents'),
            ).not.toBeInTheDocument();
        });
        it('retains saved verification after remount and hides the ClickHouse guide', async () => {
            const first = setup(clickhouseProject);
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            first.unmount();
            setup(clickhouseProject);
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            expect(
                screen.queryByText('Create the account in ClickHouse'),
            ).not.toBeInTheDocument();
        });
        it('does not invent a principal for an unverified slot', async () => {
            verification = null;
            setup(clickhouseProject);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('marks the recorded observation as historical after a failed Test', async () => {
            setup(clickhouseProject);
            const button = await screen.findByRole('button', { name: 'Test' });
            mockedLightdashApi.mockResolvedValueOnce({
                ...recorded,
                ok: false,
                principal: null,
                message: 'Access denied.',
            });
            fireEvent.click(button);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Access denied.',
            );
            expect(screen.getByText('Signs in as ai_agents')).toBeVisible();
            expect(
                screen.getByText(
                    'The account above is from the last successful check.',
                ),
            ).toBeVisible();
        });
        it('drops a Test result after the slot generation changes', async () => {
            const { client } = setup(clickhouseProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Test' }),
            );
            await screen.findByText('Signs in as tested-principal');
            slot = { ...slot!, identityUuid: 'replacement' };
            verification = null;
            await client.invalidateQueries(['ai-access']);
            expect(
                await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('shows the inherited account read-only with warehouse-correct details', async () => {
            slot = null;
            parent = {
                ...parentAccount,
                principal: null,
                verification: recorded,
            };
            setup(asPreview(clickhouseProject));
            expect(
                await screen.findByText('Signs in as ai_agents'),
            ).toBeVisible();
            expect(
                screen.getByRole('link', { name: 'Production' }),
            ).toHaveAttribute(
                'href',
                '/generalSettings/projectManagement/parent-project/agentIdentity',
            );
            expect(
                screen.queryByText(/key file|different key|could not be read/),
            ).not.toBeInTheDocument();
            expectReadOnly();
        });
        it('ignores a stale stored preview account without removing it', async () => {
            parent = {
                ...parentAccount,
                principal: recorded.principal,
                verification: recorded,
            };
            setup(asPreview(clickhouseProject));
            expect(
                await screen.findByText(/Uses the shared agent account from/),
            ).toBeVisible();
            expectReadOnly();
        });
        it('replaces credentials without prefill and removes them only after confirmation', async () => {
            const handler = mockedLightdashApi.getMockImplementation()!;
            const replacement = {
                ...recorded,
                principal: 'replacement_user',
                observed: {
                    currentUser: 'replacement_user',
                },
            };
            mockedLightdashApi.mockImplementation(async (request) => {
                if (request.method === 'PUT') {
                    slot = {
                        ...savedSlot,
                        warehouseType,
                        method: 'password',
                        identityUuid: 'replacement-generation',
                    };
                    verification = replacement;
                    return { status: 'ok', results: slot, verification };
                }
                return handler(request);
            });
            setup(clickhouseProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Replace' }),
            );
            const dialog = await screen.findByRole('dialog');
            for (const [label, value] of [
                [/^User/, 'replacement-user'],
                [/^Password/, 'replacement-password'],
            ] as const) {
                const input = within(dialog).getByLabelText(label, {
                    exact: false,
                });
                expect(input).toHaveValue('');
                fireEvent.change(input, { target: { value } });
            }
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Test and save' }),
            );
            expect(
                await screen.findByText(`Signs in as ${replacement.principal}`),
            ).toBeVisible();
            expect(
                screen.queryByText(`Signs in as ${recorded.principal}`),
            ).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
            const confirmation = await screen.findByRole('dialog', {
                name: 'Remove shared agent account',
            });
            expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'DELETE' }),
            );
            fireEvent.click(
                within(confirmation).getByRole('button', { name: 'Remove' }),
            );
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            });
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        });
        it('warns about required missing credentials and offers Add', async () => {
            slot = null;
            source = 'ai_service_account';
            setup(clickhouseProject);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Agents are refused on this project until you add a shared agent account.',
            );
            expect(
                screen.getByRole('button', {
                    name: 'Add shared agent account',
                }),
            ).toBeVisible();
        });
        it.each(['flag', 'permission'])(
            'hides the ClickHouse page with no requests for %s',
            (reason) => {
                mocks.enabled = reason !== 'flag';
                mocks.canManage = reason !== 'permission';
                setup(clickhouseProject, false, true);
                expect(
                    screen.queryByText('Shared agent account'),
                ).not.toBeInTheDocument();
                expect(sharedLightdashApi).not.toHaveBeenCalled();
            },
        );
    });
    it('shows the inherited account read-only with warehouse-correct details', async () => {
        source = 'ai_service_account';
        parent = parentAccount;
        setup(asPreview(project));
        expect(
            await screen.findByText(/Uses the shared agent account from/),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Production' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/parent-project/agentIdentity',
        );
        expect(
            screen.getByText('Signs in as parent@example.test'),
        ).toBeVisible();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add shared agent account' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Remove' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Replace' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
        expectSteps(false, 'BigQuery');
        expectReadOnly();
    });
    it('keeps inherited controls available when the parent key cannot be read', async () => {
        parent = {
            ...parentAccount,
            principal: null,
            credentialsReadable: false,
        };
        setup(asPreview(project));
        expect(
            await screen.findByText(
                "This preview can't read the parent project's shared agent account. Ask an admin of Production to replace it.",
            ),
        ).toBeVisible();
        expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        expectReadOnly();
        expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
    });
    it('clears inherited test results when the parent key rotates with the same principal', async () => {
        parent = parentAccount;
        const { client } = setup(asPreview(project));
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        await screen.findByText('Signs in as tested-principal');
        expect(
            screen.queryByText('Create the account in BigQuery'),
        ).not.toBeInTheDocument();

        parent = {
            ...parentAccount,
            identityUuid: 'rotated-parent-generation',
        };
        await client.invalidateQueries(['ai-access']);

        await waitFor(() => {
            expect(
                screen.queryByText('Signs in as tested-principal'),
            ).not.toBeInTheDocument();
        });
        expectSteps(false, 'BigQuery');
        expect(
            screen.getByText('Signs in as parent@example.test'),
        ).toBeVisible();
    });
    it('does not link a parent the user cannot view', async () => {
        parent = { ...parentAccount, projectName: null };
        setup(asPreview(project));
        expect(
            await screen.findByText(
                'Uses the shared agent account from the parent project.',
            ),
        ).toBeVisible();
        expect(
            screen.queryByRole('link', { name: 'Production' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText('Signs in as parent@example.test'),
        ).toBeVisible();
    });
    it('tests inherited credentials through the preview project', async () => {
        parent = parentAccount;
        setup(asPreview(project));
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        expect(
            await screen.findByText('Signs in as tested-principal'),
        ).toBeVisible();
        expect(sharedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/ai-access/service-account/test',
                method: 'POST',
                body: JSON.stringify({ credentials: null }),
            }),
        );
    });
    it('ignores a stale stored preview account without removing it', async () => {
        slot = savedSlot;
        parent = parentAccount;
        setup(asPreview(project));
        expect(
            await screen.findByText(/Uses the shared agent account from/),
        ).toBeVisible();
        expectReadOnly();
    });
    it('hides the parent action when an own key has no parent', async () => {
        slot = savedSlot;
        setup();
        expect(
            await screen.findByRole('button', { name: 'Remove' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: "Use the parent's account" }),
        ).not.toBeInTheDocument();
    });
    describe.each([WarehouseTypes.POSTGRES, WarehouseTypes.BIGQUERY] as const)(
        '%s empty preview',
        (type) => {
            it.each([
                { stale: false, required: true },
                { stale: true, required: true },
                { stale: false, required: false },
                { stale: true, required: false },
            ])(
                'shows parent guidance with stale=$stale and required=$required',
                async ({ stale, required }) => {
                    warehouseType = type;
                    source = required ? 'ai_service_account' : 'marked_person';
                    credentialsReadable = false;
                    verification = null;
                    slot = stale ? { ...savedSlot, warehouseType: type } : null;
                    setup(
                        asPreview({
                            ...project,
                            warehouseConnection: {
                                ...project.warehouseConnection,
                                type,
                            },
                        } as Project),
                    );
                    if (required) {
                        expect(
                            await screen.findByRole('alert'),
                        ).toHaveTextContent(
                            'Agents are refused on this preview until the parent project has a shared agent account for this connection. Ask an admin to add one on the parent project.',
                        );
                        expect(
                            getAiServiceAccountStatus({
                                rule: {
                                    warehouseType: type,
                                    source,
                                    projectsMissingAiServiceAccount: null,
                                },
                                slot: null,
                                parent: null,
                                credentialsReadable: false,
                                isPreview: true,
                            }).alert?.color,
                        ).toBe('yellow');
                        expect(
                            screen.queryByText(
                                /The parent project has no shared agent account/,
                            ),
                        ).not.toBeInTheDocument();
                    } else {
                        expect(
                            await screen.findByText(
                                /The parent project has no shared agent account. Add one on/,
                            ),
                        ).toHaveTextContent(
                            'The parent project has no shared agent account. Add one on the parent project.',
                        );
                        expect(screen.getByText('Not in use')).toBeVisible();
                        expect(
                            screen.queryByText(/Agents are refused/),
                        ).not.toBeInTheDocument();
                        expect(
                            screen.queryByRole('alert'),
                        ).not.toBeInTheDocument();
                    }
                    expect(
                        screen.getByRole('link', {
                            name: 'the parent project',
                        }),
                    ).toHaveAttribute(
                        'href',
                        '/generalSettings/projectManagement/parent-project/agentIdentity',
                    );
                    expectReadOnly();
                    expect(
                        screen.queryByRole('button', { name: 'Test' }),
                    ).not.toBeInTheDocument();
                    expectSteps(
                        false,
                        type === WarehouseTypes.POSTGRES
                            ? 'Postgres'
                            : 'BigQuery',
                    );
                },
            );
        },
    );
    it('keeps setup available for a preview with no upstream project', async () => {
        setup({ ...project, type: ProjectType.PREVIEW });
        expect(
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            }),
        ).toBeEnabled();
        expectSteps(true, 'BigQuery');
    });
    it.each(['warehouse', 'flag', 'permission', 'unsaved'])(
        'hides for %s',
        (reason) => {
            mocks.enabled = reason !== 'flag';
            mocks.canManage = reason !== 'permission';
            setup({
                ...project,
                projectUuid: reason === 'unsaved' ? '' : project.projectUuid,
                warehouseConnection: {
                    type:
                        reason === 'warehouse'
                            ? WarehouseTypes.DUCKDB
                            : WarehouseTypes.BIGQUERY,
                },
            } as Project);
            expect(
                screen.queryByText('Shared agent account'),
            ).not.toBeInTheDocument();
            expect(sharedLightdashApi).not.toHaveBeenCalled();
        },
    );
    it('renders setup commands from the connection, including its execution project and dataset', async () => {
        setup();
        const code = await screen.findByText(
            /gcloud iam service-accounts create/,
        );
        expect(code).toHaveTextContent(
            'gcloud iam service-accounts create lightdash-agents \\ --project=data-project',
        );
        const grants = screen.getByText(
            /gcloud projects add-iam-policy-binding/,
        );
        expect(grants).toHaveTextContent(
            'gcloud projects add-iam-policy-binding job-project',
        );
        expect(grants).toHaveTextContent(
            'serviceAccount:lightdash-agents@data-project.iam.gserviceaccount.com',
        );
        expect(grants).toHaveTextContent(
            'bq query \\ --project_id=job-project',
        );
        expect(grants).toHaveTextContent('ON SCHEMA `data-project`.analytics');
        expect(
            screen.getByText('Grant only the data every agent user may see.'),
        ).toBeInTheDocument();
    });
    it('omits the dataset command when no dataset is set', async () => {
        setup({
            ...project,
            warehouseConnection: {
                ...project.warehouseConnection,
                dataset: '',
            },
        } as Project);
        expect(
            await screen.findByText(
                'Grant Data Viewer on each dataset agents may read.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/gcloud projects add-iam-policy-binding/),
        ).not.toHaveTextContent('bq query');
    });
    it('shows an empty slot without repeating the organization rule', async () => {
        setup();
        expect(
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/When AI agents query/),
        ).not.toBeInTheDocument();
        expect(
            screen.getAllByRole('link', { name: 'Organization settings' }),
        ).toHaveLength(1);
        expect(
            screen.queryByText(/Agents run as the person/),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('warns when a required service account is missing', async () => {
        source = 'ai_service_account';
        setup();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Agents are refused on this project until you add a shared agent account.',
        );
    });
    it.each(['marked_person', 'ai_service_account'] as const)(
        'shows the %s rule within the AI service account card',
        async (ruleSource) => {
            source = ruleSource;
            slot = savedSlot;
            setup(project, false, true);
            await screen.findByRole('button', { name: 'Test' });
            expect(
                screen.queryByText('Organization rule for this warehouse'),
            ).not.toBeInTheDocument();
            expect(
                screen.getAllByRole('heading', {
                    name: 'Shared agent account',
                }),
            ).toHaveLength(1);
            expect(
                screen.getAllByRole('link', { name: 'Organization settings' }),
            ).toHaveLength(1);
            expect(
                screen.queryByText(/When AI agents query/),
            ).not.toBeInTheDocument();
        },
    );
    it('tests a saved slot with null credentials and shows only the returned principal', async () => {
        slot = savedSlot;
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        expect(
            await screen.findByText('Signs in as tested-principal'),
        ).toBeInTheDocument();
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/projects/project/ai-access/service-account/test',
            method: 'POST',
            body: JSON.stringify({ credentials: null }),
            sensitive: true,
        });
        expect(screen.getByText('Key file')).toBeInTheDocument();
        expect(screen.getByText(/Added/)).toBeInTheDocument();
    });
    it('tests an unsaved key without showing the file principal or secrets', async () => {
        setup();
        const dialog = await openForm();
        upload();
        const testButton = within(dialog).getByRole('button', { name: 'Test' });
        await waitFor(() => expect(testButton).toBeEnabled());
        expect(
            screen.queryByText(/secret-email|secret-key/),
        ).not.toBeInTheDocument();
        fireEvent.click(testButton);
        expect(
            await within(dialog).findByText('Signs in as tested-principal'),
        ).toBeInTheDocument();
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/projects/project/ai-access/service-account/test',
            method: 'POST',
            body: JSON.stringify({
                credentials: {
                    type: WarehouseTypes.BIGQUERY,
                    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                    keyfileContents: key,
                },
            }),
            sensitive: true,
        });
        expect(
            screen.queryByText(/secret-email|secret-key/),
        ).not.toBeInTheDocument();
    });
    it('does not show an unsaved test principal on the card after Cancel', async () => {
        setup();
        const dialog = await openForm();
        upload();
        const testButton = within(dialog).getByRole('button', { name: 'Test' });
        await waitFor(() => expect(testButton).toBeEnabled());
        fireEvent.click(testButton);
        await within(dialog).findByText('Signs in as tested-principal');
        expect(
            screen.getAllByText('Signs in as tested-principal'),
        ).toHaveLength(1);
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(
            screen.queryByText('Signs in as tested-principal'),
        ).not.toBeInTheDocument();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PUT' }),
        );
    });
    it.each(['add', 'replace'])(
        'keeps the tested principal after %s and Save',
        async (mode) => {
            if (mode === 'replace')
                slot = { ...savedSlot, identityUuid: 'previous-identity' };
            setup();
            if (mode === 'replace')
                fireEvent.click(
                    await screen.findByRole('button', { name: 'Replace' }),
                );
            else await openForm();
            const dialog = await screen.findByRole('dialog');
            upload();
            const testButton = within(dialog).getByRole('button', {
                name: 'Test',
            });
            await waitFor(() => expect(testButton).toBeEnabled());
            fireEvent.click(testButton);
            await within(dialog).findByText('Signs in as tested-principal');
            expect(
                screen.getAllByText('Signs in as tested-principal'),
            ).toHaveLength(1);
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Save' }),
            );
            await waitFor(() =>
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
            );
            expect(
                screen.getByText('Signs in as tested-principal'),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Replace' }),
            ).toBeInTheDocument();
        },
    );
    it.each(['untested', 'changed key', 'failed retest', 'retest error'])(
        'does not carry a principal into a saved slot for %s',
        async (scenario) => {
            setup();
            const dialog = await openForm();
            upload();
            const testButton = within(dialog).getByRole('button', {
                name: 'Test',
            });
            await waitFor(() => expect(testButton).toBeEnabled());
            if (scenario !== 'untested') {
                fireEvent.click(testButton);
                await within(dialog).findByText('Signs in as tested-principal');
                if (scenario === 'changed key') {
                    upload(
                        JSON.stringify({
                            ...key,
                            private_key: 'different-key',
                        }),
                    );
                    await waitFor(() => expect(testButton).toBeEnabled());
                } else {
                    if (scenario === 'failed retest')
                        mockedLightdashApi.mockResolvedValueOnce({
                            ok: false,
                            principal: null,
                            message: 'Access denied.',
                        });
                    else
                        mockedLightdashApi.mockRejectedValueOnce({
                            error: { message: 'Access denied.' },
                        });
                    fireEvent.click(testButton);
                    await within(dialog).findByText('Access denied.');
                }
            }
            fireEvent.click(
                within(dialog).getByRole('button', { name: 'Save' }),
            );
            await waitFor(() =>
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
            );
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(
                await screen.findByText('Signs in as tested-principal'),
            ).toBeInTheDocument();
        },
    );
    it('clears the saved principal when the key is replaced without a Test', async () => {
        slot = { ...savedSlot, identityUuid: 'previous-identity' };
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        await screen.findByText('Signs in as tested-principal');
        fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
        const dialog = await screen.findByRole('dialog');
        upload();
        const saveButton = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(saveButton).toBeEnabled());
        fireEvent.click(saveButton);
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
    });
    it('hides the saved principal when a refetch returns a different identity', async () => {
        slot = savedSlot;
        const { client } = setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        await screen.findByText('Signs in as tested-principal');
        slot = { ...savedSlot, identityUuid: 'replacement-identity' };
        await client.invalidateQueries(['ai-access']);
        await waitFor(() =>
            expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument(),
        );
    });
    it('keeps the saved principal after testing and cancelling replacement, and clears it on removal', async () => {
        slot = savedSlot;
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        await screen.findByText('Signs in as tested-principal');
        fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
        const dialog = await screen.findByRole('dialog');
        upload();
        const testButton = within(dialog).getByRole('button', { name: 'Test' });
        await waitFor(() => expect(testButton).toBeEnabled());
        mockedLightdashApi.mockResolvedValueOnce({
            ok: true,
            principal: 'replacement-principal',
            message: 'Connection works.',
        });
        fireEvent.click(testButton);
        await within(dialog).findByText('Signs in as replacement-principal');
        expect(
            screen.getByText('Signs in as tested-principal'),
        ).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(
            screen.getByText('Signs in as tested-principal'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Signs in as replacement-principal'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        const confirmation = await screen.findByRole('dialog');
        fireEvent.click(
            within(confirmation).getByRole('button', { name: 'Remove' }),
        );
        await screen.findByRole('button', {
            name: 'Add shared agent account',
        });
        expect(
            screen.queryByText('Signs in as tested-principal'),
        ).not.toBeInTheDocument();
    });
    it('saves, replaces and removes the slot only after confirmation', async () => {
        const { invalidate } = setup();
        const dialog = await openForm();
        expectSteps(true, 'BigQuery');
        upload();
        const saveButton = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(saveButton).toBeEnabled());
        fireEvent.click(saveButton);
        expect(
            await screen.findByRole('button', { name: 'Replace' }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expectSteps(false, 'BigQuery');
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/projects/project/ai-access/service-account',
            method: 'PUT',
            body: JSON.stringify({
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                keyfileContents: key,
            }),
            sensitive: true,
        });
        expect(invalidate).toHaveBeenCalledWith(['ai-access']);
        fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
        const replacement = await screen.findByRole('dialog', {
            name: 'Shared agent account',
        });
        expect(
            within(replacement).getByRole('button', { name: 'Save' }),
        ).toBeDisabled();
        fireEvent.click(
            within(replacement).getByRole('button', { name: 'Cancel' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        const confirmation = await screen.findByRole('dialog', {
            name: 'Remove shared agent account',
        });
        expectSteps(false, 'BigQuery');
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        fireEvent.click(
            within(confirmation).getByRole('button', { name: 'Remove' }),
        );
        expect(
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            }),
        ).toBeInTheDocument();
        expectSteps(true, 'BigQuery');
        expect(sharedLightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/projects/project/ai-access/service-account',
            method: 'DELETE',
            body: undefined,
        });
    });
    it('rejects a key without the service account type', async () => {
        setup();
        const dialog = await openForm();
        upload('{"type":"authorized_user"}');
        expect(
            await screen.findByText('Use a service account key file.'),
        ).toBeInTheDocument();
        expect(
            within(dialog).getByRole('button', { name: 'Save' }),
        ).toBeDisabled();
        expect(
            within(dialog).getByRole('button', { name: 'Test' }),
        ).toBeDisabled();
    });
    it('shows a failed test message and clears it when the key changes', async () => {
        setup();
        const dialog = await openForm();
        upload();
        const testButton = within(dialog).getByRole('button', { name: 'Test' });
        await waitFor(() => expect(testButton).toBeEnabled());
        mockedLightdashApi.mockResolvedValueOnce({
            ok: false,
            principal: null,
            message: 'Access denied.',
        });
        fireEvent.click(testButton);
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Access denied.',
        );
        upload('{}');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    it.each([true, false])(
        'moves the card off Connection settings with flag %s',
        (enabled) => {
            mocks.enabled = enabled;
            setup(project, true);
            expect(
                screen.queryByText('Shared agent account'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Agent identity' }),
            ).not.toBeInTheDocument();
            expect(sharedLightdashApi).not.toHaveBeenCalled();
        },
    );
    describe('identity page loading', () => {
        const settingsUrl = '/org/agent-identity';
        const statusUrl = '/projects/project/ai-access/service-account';
        const settingsKey = ['ai-access', 'org', 'agent-identity'];
        const statusKey = ['ai-access', 'project', null, 'service-account'];
        const deferResponse = () => {
            let resolve!: (
                value: Awaited<ReturnType<typeof mockedLightdashApi>>,
            ) => void;
            const promise = new Promise<
                Awaited<ReturnType<typeof mockedLightdashApi>>
            >((resolvePromise) => {
                resolve = resolvePromise;
            });
            return { promise, resolve };
        };
        const deferRequests = () => {
            const request = mockedLightdashApi.getMockImplementation()!;
            const settings = deferResponse();
            const status = deferResponse();
            mockedLightdashApi.mockImplementation((args) => {
                if (args.url === settingsUrl) return settings.promise;
                if (args.url === statusUrl) return status.promise;
                return request(args);
            });
            const resolveSettings = async () => {
                settings.resolve(
                    await request({
                        url: settingsUrl,
                        method: 'GET',
                        body: undefined,
                    }),
                );
            };
            const resolveStatus = async () => {
                status.resolve(
                    await request({
                        url: statusUrl,
                        method: 'GET',
                        body: undefined,
                    }),
                );
            };
            return { resolveSettings, resolveStatus };
        };
        const expectLoading = (container: HTMLElement) => {
            expect(
                container.querySelectorAll('.mantine-Loader-root'),
            ).toHaveLength(1);
            expect(
                screen.queryByRole('heading', { name: 'Shared agent account' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', {
                    name: 'Add shared agent account',
                }),
            ).not.toBeInTheDocument();
        };

        it.each(['settings', 'status'] as const)(
            'starts both requests together and keeps one loader when %s resolves first',
            async (first) => {
                const { resolveSettings, resolveStatus } = deferRequests();
                const { container, client } = setup(project, false, true);
                await waitFor(() => {
                    for (const url of [settingsUrl, statusUrl])
                        expect(sharedLightdashApi).toHaveBeenCalledWith(
                            expect.objectContaining({ url, method: 'GET' }),
                        );
                    expectLoading(container);
                });
                await act(async () => {
                    await (first === 'settings'
                        ? resolveSettings()
                        : resolveStatus());
                });
                await waitFor(() =>
                    expect(
                        client.getQueryState(
                            first === 'settings' ? settingsKey : statusKey,
                        )?.status,
                    ).toBe('success'),
                );
                expectLoading(container);
                await act(async () => {
                    await (first === 'settings'
                        ? resolveStatus()
                        : resolveSettings());
                });
                expect(
                    await screen.findByRole('heading', {
                        name: 'Shared agent account',
                    }),
                ).toBeVisible();
                expect(
                    container.querySelectorAll('.mantine-Loader-root'),
                ).toHaveLength(0);
            },
        );

        it.each(['settings', 'status', 'missing rule'] as const)(
            'shows a retryable account error for %s and retries both requests',
            async (failure) => {
                const request = mockedLightdashApi.getMockImplementation()!;
                mockedLightdashApi.mockImplementation(async (args) => {
                    if (failure === 'missing rule' && args.url === settingsUrl)
                        return {
                            requireVerifiedAgentSessions: false,
                            rules: [],
                        };
                    if (
                        args.url ===
                            (failure === 'settings'
                                ? settingsUrl
                                : statusUrl) &&
                        failure !== 'missing rule'
                    )
                        throw { error: { message: 'Unavailable' } };
                    return request(args);
                });
                const { container } = setup(project, false, true);
                expect(
                    await screen.findByText(
                        'Could not load the shared agent account.',
                    ),
                ).toBeVisible();
                expect(
                    container.querySelectorAll('.mantine-Loader-root'),
                ).toHaveLength(0);
                mockedLightdashApi.mockImplementation(request);
                mockedLightdashApi.mockClear();
                fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
                expect(
                    await screen.findByRole('heading', {
                        name: 'Shared agent account',
                    }),
                ).toBeVisible();
                for (const url of [settingsUrl, statusUrl])
                    expect(sharedLightdashApi).toHaveBeenCalledWith(
                        expect.objectContaining({ url, method: 'GET' }),
                    );
            },
        );

        it('keeps content, the open form and unsaved input during a background refetch', async () => {
            warehouseType = WarehouseTypes.POSTGRES;
            const { container, client } = setup(
                {
                    ...project,
                    warehouseConnection: { type: WarehouseTypes.POSTGRES },
                } as Project,
                false,
                true,
            );
            const dialog = await openForm();
            const user = within(dialog).getByLabelText(/^User/);
            fireEvent.change(user, { target: { value: 'unsaved-agent' } });
            const { resolveSettings, resolveStatus } = deferRequests();
            let refetch!: Promise<void>;
            act(() => {
                refetch = client.invalidateQueries(['ai-access']);
            });
            await waitFor(() => {
                expect(client.getQueryState(settingsKey)?.fetchStatus).toBe(
                    'fetching',
                );
                expect(client.getQueryState(statusKey)?.fetchStatus).toBe(
                    'fetching',
                );
            });
            expect(
                container.querySelectorAll('.mantine-Loader-root'),
            ).toHaveLength(0);
            expect(
                screen.getByRole('heading', {
                    name: 'Shared agent account',
                    level: 5,
                }),
            ).toBeInTheDocument();
            expect(dialog).toBeVisible();
            expect(user).toHaveValue('unsaved-agent');
            await act(async () => {
                await resolveSettings();
                await resolveStatus();
                await refetch;
            });
            expect(
                container.querySelectorAll('.mantine-Loader-root'),
            ).toHaveLength(0);
            expect(
                screen.getByRole('heading', {
                    name: 'Shared agent account',
                    level: 5,
                }),
            ).toBeInTheDocument();
            expect(dialog).toBeVisible();
            expect(user).toHaveValue('unsaved-agent');
        });
    });
    it('shows the read-only organization rule, card and single Test button on the identity page', async () => {
        slot = savedSlot;
        setup(project, false, true);
        expect(await screen.findByText('Not in use')).toBeVisible();
        expect(
            screen.getByText(
                "Agents on this project use each person's own BigQuery credentials. The organization rule decides this.",
            ),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Organization settings' }),
        ).toHaveAttribute('href', '/generalSettings/agentIdentity');
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Test' })).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        expect(
            await screen.findByText('Signs in as tested-principal'),
        ).toBeVisible();
        expect(screen.getByText('Shared agent account')).toBeVisible();
    });
    it.each(['flag', 'permission'])(
        'does not load the identity page without %s',
        (gate) => {
            mocks.enabled = gate !== 'flag';
            mocks.canManage = gate !== 'permission';
            const { container } = setup(project, false, true);
            expect(
                container.querySelector(
                    ':scope > :not(style):not(.mantine-Notifications-root)',
                ),
            ).toBeNull();
            expect(sharedLightdashApi).not.toHaveBeenCalled();
            expect(
                screen.queryByText('Organization rule for this warehouse'),
            ).not.toBeInTheDocument();
        },
    );
    it('shows an unsupported warehouse state without fetching rules or account status', () => {
        setup(
            {
                ...project,
                warehouseConnection: { type: WarehouseTypes.DUCKDB },
            } as Project,
            false,
            true,
        );
        expect(
            screen.getByText(
                'Agent identity is not available for this warehouse.',
            ),
        ).toBeVisible();
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ url: '/org/agent-identity' }),
        );
        expect(sharedLightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/ai-access/service-account',
            }),
        );
    });
    it('keeps the form open and reports a failed save', async () => {
        setup();
        const dialog = await openForm();
        upload();
        const button = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(button).toBeEnabled());
        const error = { message: 'Could not save credentials.' };
        mockedLightdashApi.mockRejectedValueOnce({ error });
        fireEvent.click(button);
        await waitFor(() =>
            expect(mocks.errorToast).toHaveBeenCalledWith({
                title: 'Could not save the shared agent account.',
                apiError: error,
            }),
        );
        expect(dialog).toBeInTheDocument();
        expect(mocks.toast).not.toHaveBeenCalled();
    });
    it('keeps a saved slot when removal fails', async () => {
        slot = savedSlot;
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
        const dialog = await screen.findByRole('dialog', {
            name: 'Remove shared agent account',
        });
        const error = { message: 'Could not remove credentials.' };
        mockedLightdashApi.mockRejectedValueOnce({ error });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
        await waitFor(() =>
            expect(mocks.errorToast).toHaveBeenCalledWith({
                title: 'Could not remove the shared agent account.',
                apiError: error,
            }),
        );
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText('Key file')).toBeInTheDocument();
    });
    it('shows API failures from Test and allows retry', async () => {
        slot = savedSlot;
        setup();
        const button = await screen.findByRole('button', { name: 'Test' });
        mockedLightdashApi.mockRejectedValueOnce({
            error: { message: 'The connection is unavailable.' },
        });
        fireEvent.click(button);
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The connection is unavailable.',
        );
        expect(button).toBeEnabled();
        fireEvent.click(button);
        expect(
            await screen.findByText('Signs in as tested-principal'),
        ).toBeInTheDocument();
    });
    it('reports a load failure instead of offering to overwrite an unknown slot', async () => {
        mockedLightdashApi.mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        setup();
        expect(
            await screen.findByText('Could not load the shared agent account.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add shared agent account' }),
        ).not.toBeInTheDocument();
    });
    describe('Snowflake', () => {
        beforeEach(() => {
            warehouseType = WarehouseTypes.SNOWFLAKE;
            source = 'ai_service_account';
        });
        const saved = () => {
            slot = { ...savedSlot, warehouseType: WarehouseTypes.SNOWFLAKE };
            verification = snowflakeVerification;
        };
        it('shows setup and the missing-slot warning without BigQuery setup', async () => {
            setup(snowflakeProject);
            await screen.findByRole('button', {
                name: 'Add shared agent account',
            });
            expect(
                screen.getByText(/Agents are refused on this project/),
            ).toBeVisible();
            expect(
                screen.getByText(
                    /Use TYPE = SERVICE_AGENT so Snowflake marks these sessions as agent sessions./,
                ),
            ).toBeVisible();
            expect(screen.getByText(/CREATE USER AI_AGENT/)).toHaveTextContent(
                "RSA_PUBLIC_KEY = '<public key without PEM headers>'",
            );
            expect(screen.queryByText(/gcloud/)).not.toBeInTheDocument();
        });
        it.each(['own', 'inherited'])(
            'shows the persisted %s user and role and uses only the generic Test',
            async (owner) => {
                if (owner === 'own') saved();
                else
                    parent = {
                        ...parentAccount,
                        principal: null,
                        verification: snowflakeVerification,
                    };
                setup(
                    owner === 'inherited'
                        ? asPreview(snowflakeProject)
                        : snowflakeProject,
                );
                expect(
                    await screen.findByText(
                        'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
                    ),
                ).toBeVisible();
                const title = screen.getByText('Key pair');
                const principal = screen.getByText(
                    'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
                );
                const dates = screen.getByText(/Tested/);
                expect(principal.compareDocumentPosition(title)).toBe(
                    Node.DOCUMENT_POSITION_FOLLOWING,
                );
                expect(principal.compareDocumentPosition(dates)).toBe(
                    Node.DOCUMENT_POSITION_FOLLOWING,
                );
                expect(dates).toBeVisible();
                if (owner === 'own')
                    expect(dates).toHaveTextContent(/Tested .+\. Added/);
                expect(
                    screen.queryByRole('button', { name: 'Test as agent' }),
                ).not.toBeInTheDocument();
                if (owner === 'inherited')
                    expect(
                        screen.getByText(/Uses the shared agent account from/),
                    ).toBeVisible();
                fireEvent.click(screen.getByRole('button', { name: 'Test' }));
                await waitFor(() =>
                    expect(sharedLightdashApi).toHaveBeenCalledWith(
                        expect.objectContaining({
                            url: '/projects/project/ai-access/service-account/test',
                            body: JSON.stringify({ credentials: null }),
                        }),
                    ),
                );
                expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                    expect.objectContaining({
                        url: '/projects/project/ai-access/service-account/test-access',
                    }),
                );
                expect(
                    screen.queryByText(/could not be read/),
                ).not.toBeInTheDocument();
            },
        );
        it.each(['own', 'inherited'])(
            'shows repair guidance for an unreadable %s slot',
            async (owner) => {
                if (owner === 'own') {
                    saved();
                    credentialsReadable = false;
                } else {
                    parent = {
                        ...parentAccount,
                        principal: null,
                        verification: null,
                        credentialsReadable: false,
                    };
                }
                setup(
                    owner === 'inherited'
                        ? asPreview(snowflakeProject)
                        : snowflakeProject,
                );
                expect(await screen.findByRole('alert')).toHaveTextContent(
                    owner === 'own'
                        ? "The shared agent account can't be read. Replace it."
                        : "Agents are refused on this preview. This preview can't read the parent project's shared agent account. Ask an admin of Production to replace it.",
                );
                if (owner === 'own')
                    expect(
                        screen.getByText(
                            'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
                        ),
                    ).toBeVisible();
                else
                    expect(
                        screen.getByText(
                            'Not tested yet. Select Test to see who it signs in as.',
                        ),
                    ).toBeVisible();
                if (owner === 'own')
                    expect(
                        screen.getByRole('button', { name: 'Replace' }),
                    ).toBeEnabled();
                else expectReadOnly();
                expect(sharedLightdashApi).not.toHaveBeenCalledWith(
                    expect.objectContaining({ method: 'POST' }),
                );
            },
        );
        it.each(['own', 'inherited'])(
            'shows neutral guidance for an %s slot with no observation and alerts on Test failure',
            async (owner) => {
                if (owner === 'own') {
                    saved();
                    verification = null;
                } else {
                    parent = {
                        ...parentAccount,
                        principal: null,
                        verification: null,
                    };
                }
                setup(
                    owner === 'inherited'
                        ? asPreview(snowflakeProject)
                        : snowflakeProject,
                );
                const guidance = await screen.findByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                );
                expect(guidance).toBeVisible();
                expect(guidance).not.toHaveAttribute('role');
                expect(guidance).toHaveStyle({
                    color: 'var(--mantine-color-dimmed)',
                });
                expect(screen.queryByRole('alert')).not.toBeInTheDocument();
                expect(screen.queryByText(/Tested/)).not.toBeInTheDocument();
                if (owner === 'own')
                    expect(
                        screen.getByRole('button', { name: 'Replace' }),
                    ).toBeEnabled();
                else expectReadOnly();
                mockedLightdashApi.mockResolvedValueOnce({
                    ...snowflakeVerification,
                    ok: false,
                    principal: null,
                    observed: {},
                    message: 'Sign-in failed.',
                });
                fireEvent.click(screen.getByRole('button', { name: 'Test' }));
                expect(await screen.findByRole('alert')).toHaveTextContent(
                    'Sign-in failed.',
                );
            },
        );
        it('shows a current failure beside the last successful observation', async () => {
            saved();
            setup(snowflakeProject);
            await screen.findByText(
                'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
            );
            mockedLightdashApi.mockRejectedValueOnce({
                error: { message: 'Sign-in failed.' },
            });
            fireEvent.click(screen.getByRole('button', { name: 'Test' }));
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Sign-in failed.',
            );
            expect(
                screen.getByText(
                    'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
                ),
            ).toBeVisible();
        });
        it('replaces stale local observations when the slot generation changes', async () => {
            saved();
            const { client } = setup(snowflakeProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Test' }),
            );
            await waitFor(() =>
                expect(sharedLightdashApi).toHaveBeenCalledWith(
                    expect.objectContaining({ method: 'POST' }),
                ),
            );
            slot = {
                ...savedSlot,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                identityUuid: 'new-generation',
            };
            verification = {
                ...snowflakeVerification,
                observed: { currentUser: 'NEW_USER', currentRole: 'NEW_ROLE' },
            };
            await act(async () => {
                await client.invalidateQueries(['ai-access']);
            });
            expect(
                await screen.findByText(
                    'Signs in as NEW_USER with role NEW_ROLE',
                ),
            ).toBeVisible();
            expect(
                screen.queryByText(
                    'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
                ),
            ).not.toBeInTheDocument();
        });
        it('keeps the prior slot and inputs after a failed replacement', async () => {
            saved();
            setup(snowflakeProject);
            fireEvent.click(
                await screen.findByRole('button', { name: 'Replace' }),
            );
            const dialog = await screen.findByRole('dialog');
            const modal = within(dialog);
            fireEvent.click(modal.getByLabelText('Paste key'));
            for (const [label, value] of [
                ['User', 'new_user'],
                ['Role', 'new_role'],
                ['Warehouse', 'warehouse'],
                [
                    'Private key',
                    '-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----',
                ],
            ]) {
                fireEvent.change(
                    modal.getByLabelText(label, {
                        exact: false,
                        selector: 'input, textarea',
                    }),
                    { target: { value } },
                );
            }
            mockedLightdashApi.mockRejectedValueOnce({
                error: { message: 'Sign-in failed.' },
            });
            fireEvent.click(
                modal.getByRole('button', { name: 'Test and save' }),
            );
            expect(await modal.findByRole('alert')).toHaveTextContent(
                'Sign-in failed.',
            );
            expect(
                modal.getByLabelText('User', {
                    exact: false,
                    selector: 'input, textarea',
                }),
            ).toHaveValue('new_user');
            expect(
                screen.getByText(
                    'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
                ),
            ).toBeVisible();
        });
        it('ignores a stale stored preview account without removing it', async () => {
            saved();
            parent = {
                ...parentAccount,
                principal: null,
                verification: {
                    ...snowflakeVerification,
                    observed: {
                        currentUser: 'PARENT',
                        currentRole: 'PARENT_ROLE',
                    },
                },
            };
            setup(asPreview(snowflakeProject));
            expect(
                await screen.findByText(/Uses the shared agent account from/),
            ).toBeVisible();
            expectReadOnly();
        });
        it.each(['flag', 'permission'])(
            'renders no card or setup and makes no request without %s',
            (gate) => {
                mocks.enabled = gate !== 'flag';
                mocks.canManage = gate !== 'permission';
                setup(snowflakeProject);
                expect(
                    screen.queryByText('Shared agent account'),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByText(
                        /Use TYPE = SERVICE_AGENT so Snowflake marks these sessions as agent sessions./,
                    ),
                ).not.toBeInTheDocument();
                expect(sharedLightdashApi).not.toHaveBeenCalled();
            },
        );
    });
});
