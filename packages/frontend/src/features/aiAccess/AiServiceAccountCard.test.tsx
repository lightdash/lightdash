import {
    AGENT_IDENTITY_SETTINGS_PATH,
    BigqueryAuthenticationType,
    formatDate,
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
import { lightdashApi } from '../../api';
import UpdateProjectConnection from '../../components/ProjectConnection/UpdateProjectConnection';
import { renderWithProviders } from '../../testing/testUtils';
import { AiServiceAccountCard } from './AiServiceAccountCard';
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
vi.mock('../../components/common/CodeBlock/CodeBlock', () => ({
    default: ({ code }: { code: string }) => <pre>{code}</pre>,
}));
vi.mock('../../api', () => {
    const request = vi.fn();
    return { lightdashApi: request, lightdashApiResponse: request };
});
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
            name: 'Add AI service account',
        }),
    );
    return screen.findByRole('dialog', { name: 'AI service account' });
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
        vi.mocked(lightdashApi).mockImplementation(async ({ url, method }) => {
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
                    verification,
                    credentialsReadable,
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
        [WarehouseTypes.BIGQUERY, 'BigQuery', 'Key file'],
        [WarehouseTypes.SNOWFLAKE, 'Snowflake', 'Key pair'],
        [WarehouseTypes.DATABRICKS, 'Databricks', 'Client ID and secret'],
    ] as const)('%s status presentation', (type, name, method) => {
        const props = {
            ...project,
            warehouseConnection: { ...project.warehouseConnection, type },
        } as Project;
        const missing =
            'Agents are refused on this project until you add an AI service account.';
        const unused = `Agents on this project use each person's own ${name} credentials. The organization rule decides this.`;
        const used = `Agents on this project run as this account. The organization rule for ${name} requires it.`;
        const unreadableParent =
            "Lightdash can't read the parent project's AI service account. Add this preview's own account, or ask an admin of Production to replace it.";
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
        it.each(scenarios)(
            'renders %s with status first and guide last',
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
                credentialsReadable = !scenario.startsWith('own unreadable');
                const { container } = setup({
                    ...props,
                    type: inherited ? ProjectType.PREVIEW : ProjectType.DEFAULT,
                });
                const guide = await screen.findByRole('button', {
                    name: 'How to set up the AI service account',
                });
                expect(guide).toHaveAttribute('aria-expanded', String(empty));
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
                            name: 'AI service account',
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
                        "The AI service account can't be read. Replace it.",
                    );
                const summary = empty
                    ? screen.getByRole('button', {
                          name: 'Add AI service account',
                      })
                    : screen.getByText(method);
                expect(status.compareDocumentPosition(summary)).toBe(
                    Node.DOCUMENT_POSITION_FOLLOWING,
                );
                expect(summary.compareDocumentPosition(guide)).toBe(
                    Node.DOCUMENT_POSITION_FOLLOWING,
                );
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
                        inherited
                            ? [
                                  'Test',
                                  "Add this preview's own account",
                                  'How to set up the AI service account',
                              ]
                            : [
                                  'Test',
                                  'Replace',
                                  'Remove',
                                  'How to set up the AI service account',
                              ],
                    );
                    if (scenario === 'inherited') {
                        expect(
                            screen.getByText(
                                /Uses the AI service account from/,
                            ),
                        ).toHaveTextContent(
                            'Uses the AI service account from Production, the parent project. Changes there apply here on the next query.',
                        );
                        expect(
                            screen.getByRole('link', { name: 'Production' }),
                        ).toHaveAttribute(
                            'href',
                            '/generalSettings/projectManagement/parent-project/agentIdentity',
                        );
                    }
                    fireEvent.click(guide);
                }
                expect(
                    screen.getByText(`Create the account in ${name}`),
                ).toBeInTheDocument();
                expect(
                    screen.getByText('Grant it only the data agents may read'),
                ).toBeInTheDocument();
                expect(
                    screen.getByText('Add it here and select Test'),
                ).toBeInTheDocument();
                expect(
                    screen.queryByLabelText('Step 1 done'),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByLabelText('Step 2 done'),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByLabelText('Step 3 done'),
                ).not.toBeInTheDocument();
                expect(container).not.toHaveTextContent(' · ');
                expect(container).not.toHaveTextContent('M2M');
                expect(container).not.toHaveTextContent('agent-active');
                expect(lightdashApi).not.toHaveBeenCalledWith(
                    expect.objectContaining({ method: 'POST' }),
                );
            },
        );
        it.each(['failure', 'error'] as const)(
            'completes step 3 only after a passed Test and reports %s in an Alert',
            async (failure) => {
                slot = { ...savedSlot, warehouseType: type };
                setup(props);
                fireEvent.click(
                    await screen.findByRole('button', {
                        name: 'How to set up the AI service account',
                    }),
                );
                expect(
                    screen.queryByLabelText('Step 3 done'),
                ).not.toBeInTheDocument();
                if (failure === 'failure')
                    vi.mocked(lightdashApi).mockResolvedValueOnce({
                        ...snowflakeVerification,
                        ok: false,
                        principal: null,
                        message: 'Test failed.',
                    });
                else
                    vi.mocked(lightdashApi).mockRejectedValueOnce({
                        error: { message: 'Test failed.' },
                    });
                fireEvent.click(screen.getByRole('button', { name: 'Test' }));
                const alert = await screen.findByRole('alert');
                expect(alert).toHaveTextContent('Test failed.');
                expect(alert).toHaveClass('mantine-Alert-root');
                expect(
                    screen.queryByLabelText('Step 3 done'),
                ).not.toBeInTheDocument();
                fireEvent.click(screen.getByRole('button', { name: 'Test' }));
                expect(
                    await screen.findByLabelText('Step 3 done'),
                ).toBeInTheDocument();
                expect(screen.getByText(/^Tested /)).toHaveTextContent(
                    `Tested ${formatDate(type === WarehouseTypes.SNOWFLAKE ? snowflakeVerification.checkedAt : new Date())}. Added ${formatDate(savedSlot.updatedAt)}.`,
                );
                expect(lightdashApi).toHaveBeenCalledWith(
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
            setup(props);
            expect(await screen.findByText('In use')).toBeVisible();
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(
                screen.getByText(
                    'Not tested yet. Select Test to see who it signs in as.',
                ),
            ).toBeVisible();
        });
        it('uses own credentials ahead of an unreadable parent and orders preview controls', async () => {
            source = 'ai_service_account';
            slot = { ...savedSlot, warehouseType: type };
            parent = { ...parentAccount, credentialsReadable: false };
            setup({ ...props, type: ProjectType.PREVIEW });
            await screen.findByText('In use');
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(
                screen
                    .getAllByRole('button')
                    .map((button) => button.textContent),
            ).toEqual([
                'Test',
                'Replace',
                "Use the parent's account",
                'Remove',
                'How to set up the AI service account',
            ]);
            fireEvent.click(
                screen.getByRole('button', {
                    name: "Use the parent's account",
                }),
            );
            const dialog = await screen.findByRole('dialog', {
                name: "Use the parent's account",
            });
            expect(
                within(dialog).getByText(
                    "Remove this preview's own account and use the parent project's account? Agents use it on the next query.",
                ),
            ).toBeVisible();
            expect(
                within(dialog).getByText('parent@example.test'),
            ).toBeVisible();
        });
        it('uses a plain parent reference when its name is unavailable', async () => {
            source = 'ai_service_account';
            parent = {
                ...parentAccount,
                projectName: null,
                credentialsReadable: false,
            };
            setup(props);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                "Agents are refused on this preview. Lightdash can't read the parent project's AI service account. Add this preview's own account, or ask an admin of the parent project to replace it.",
            );
            expect(
                screen.queryByRole('link', { name: 'Production' }),
            ).not.toBeInTheDocument();
        });
        it('shows passed observations and dates without treating a BigQuery parent principal as a passed Test', async () => {
            parent = { ...parentAccount, verification: snowflakeVerification };
            setup(props);
            const guide = await screen.findByRole('button', {
                name: 'How to set up the AI service account',
            });
            fireEvent.click(guide);
            if (type === WarehouseTypes.BIGQUERY) {
                expect(
                    screen.getByText('Signs in as parent@example.test'),
                ).toBeVisible();
                expect(
                    screen.queryByLabelText('Step 3 done'),
                ).not.toBeInTheDocument();
                expect(screen.queryByText(/^Tested /)).not.toBeInTheDocument();
            } else {
                expect(
                    screen.getByLabelText('Step 3 done'),
                ).toBeInTheDocument();
                expect(
                    screen.getByText(
                        `Tested ${formatDate(snowflakeVerification.checkedAt)}.`,
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
                screen.queryByText('AI service account'),
            ).not.toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
            expect(lightdashApi).not.toHaveBeenCalled();
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
                credentialsReadable: !scenario.startsWith('own unreadable'),
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
                                      "The AI service account can't be read. Replace it.",
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
    it('keeps an initially open guide open after BigQuery Save without Test', async () => {
        setup();
        const dialog = await openForm();
        upload();
        const save = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(save).toBeEnabled());
        fireEvent.click(save);
        await screen.findByRole('button', { name: 'Replace' });
        expect(
            screen.getByRole('button', {
                name: 'How to set up the AI service account',
            }),
        ).toHaveAttribute('aria-expanded', 'true');
        expect(screen.queryByLabelText('Step 3 done')).not.toBeInTheDocument();
        expect(screen.queryByText(/^Tested /)).not.toBeInTheDocument();
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST' }),
        );
    });
    it('keeps the BigQuery parent principal gate after a passed Test', async () => {
        parent = { ...parentAccount, principal: null };
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        await screen.findByText(/^Tested /);
        expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Not tested yet. Select Test to see who it signs in as.',
            ),
        ).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'How to set up the AI service account',
            }),
        );
        expect(screen.getByLabelText('Step 3 done')).toBeInTheDocument();
    });
    it('derives own-slot precedence and readable unknown-parent status without mutation', () => {
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
                rule,
                slot: savedSlot,
                parent: unreadableParent,
                credentialsReadable: true,
            }),
        ).toMatchObject({ badge: 'In use', alert: null });
        expect(unreadableParent.credentialsReadable).toBe(false);
        expect(
            getAiServiceAccountStatus({
                rule,
                slot: null,
                parent: { ...parentAccount, principal: null },
                credentialsReadable: false,
            }),
        ).toMatchObject({ badge: 'In use', alert: null });
        expect(
            getAiServiceAccountStatus({
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
            vi.mocked(lightdashApi).mockResolvedValueOnce({
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
                    'The principal above is from the last successful check.',
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
        it('shows parent verification and permits a preview override with warehouse-correct copy', async () => {
            slot = null;
            parent = {
                ...parentAccount,
                principal: null,
                verification: recorded,
            };
            setup({ ...databricksProject, type: ProjectType.PREVIEW });
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
            fireEvent.click(
                screen.getByRole('button', {
                    name: "Add this preview's own account",
                }),
            );
            expect(
                await screen.findByLabelText('Client secret', { exact: false }),
            ).toBeVisible();
            expect(
                screen.getByRole('button', { name: 'Test and save' }),
            ).toBeDisabled();
        });
        it('restores the parent credentials after confirmation', async () => {
            parent = {
                ...parentAccount,
                principal: recorded.principal,
                verification: recorded,
            };
            setup({ ...databricksProject, type: ProjectType.PREVIEW });
            fireEvent.click(
                await screen.findByRole('button', {
                    name: "Use the parent's account",
                }),
            );
            const dialog = await screen.findByRole('dialog');
            expect(dialog).not.toHaveTextContent('key');
            expect(lightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'DELETE' }),
            );
            fireEvent.click(
                within(dialog).getByRole('button', {
                    name: "Use the parent's account",
                }),
            );
            expect(
                await screen.findByText(/Uses the AI service account from/),
            ).toBeVisible();
            expect(
                screen.getByText('Signs in as recorded-principal'),
            ).toBeVisible();
        });
        it('warns about required missing credentials and offers Add', async () => {
            slot = null;
            source = 'ai_service_account';
            setup(databricksProject);
            expect(await screen.findByRole('alert')).toHaveTextContent(
                'Agents are refused on this project until you add an AI service account.',
            );
            expect(
                screen.getByRole('button', {
                    name: 'Add AI service account',
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
                    screen.queryByText('AI service account'),
                ).not.toBeInTheDocument();
                expect(lightdashApi).not.toHaveBeenCalled();
            },
        );
    });
    it('shows an inherited key and opens the form for a different key', async () => {
        source = 'ai_service_account';
        parent = parentAccount;
        setup();
        expect(
            await screen.findByText(/Uses the AI service account from/),
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
            screen.queryByRole('button', { name: 'Add AI service account' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Remove' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Replace' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
        expect(
            screen.getByRole('button', {
                name: 'How to set up the AI service account',
            }),
        ).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(
            screen.getByRole('button', {
                name: "Add this preview's own account",
            }),
        );
        const dialog = await screen.findByRole('dialog', {
            name: 'AI service account',
        });
        upload();
        const save = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(save).toBeEnabled());
        fireEvent.click(save);
        expect(
            await screen.findByRole('button', { name: 'Replace' }),
        ).toBeVisible();
        expect(
            screen.queryByText(/Uses the AI service account from/),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: "Use the parent's account" }),
        ).toBeVisible();
    });
    it('keeps inherited controls available when the parent key cannot be read', async () => {
        parent = {
            ...parentAccount,
            principal: null,
            credentialsReadable: false,
        };
        setup();
        expect(
            await screen.findByText(
                "Lightdash can't read the parent project's AI service account. Add this preview's own account, or ask an admin of Production to replace it.",
            ),
        ).toBeVisible();
        expect(screen.queryByText(/Signs in as/)).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: "Add this preview's own account",
            }),
        ).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled();
    });
    it('clears inherited test results when the parent key rotates with the same principal', async () => {
        parent = parentAccount;
        const { client } = setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        await screen.findByText('Signs in as tested-principal');
        fireEvent.click(
            screen.getByRole('button', {
                name: 'How to set up the AI service account',
            }),
        );
        expect(screen.getByLabelText('Step 3 done')).toBeInTheDocument();

        parent = {
            ...parentAccount,
            identityUuid: 'rotated-parent-generation',
        };
        await client.invalidateQueries(['ai-access']);

        await waitFor(() => {
            expect(
                screen.queryByText('Signs in as tested-principal'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText('Step 3 done'),
            ).not.toBeInTheDocument();
        });
        expect(
            screen.getByText('Signs in as parent@example.test'),
        ).toBeVisible();
    });
    it('does not link a parent the user cannot view', async () => {
        parent = { ...parentAccount, projectName: null };
        setup();
        expect(
            await screen.findByText(
                'Uses the AI service account from the parent project. Changes there apply here on the next query.',
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
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        expect(
            await screen.findByText('Signs in as tested-principal'),
        ).toBeVisible();
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/ai-access/service-account/test',
                method: 'POST',
                body: JSON.stringify({ credentials: null }),
            }),
        );
    });
    it('uses the parent key only after confirmation and refreshes the summary', async () => {
        slot = savedSlot;
        parent = parentAccount;
        const { invalidate } = setup();
        fireEvent.click(
            await screen.findByRole('button', {
                name: "Use the parent's account",
            }),
        );
        const dialog = await screen.findByRole('dialog', {
            name: "Use the parent's account",
        });
        expect(dialog).toHaveTextContent(
            "Remove this preview's own account and use the parent project's account? Agents use it on the next query.",
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        fireEvent.click(
            within(dialog).getByRole('button', {
                name: "Use the parent's account",
            }),
        );
        expect(
            await screen.findByText(/Uses the AI service account from/),
        ).toBeVisible();
        expect(lightdashApi).toHaveBeenCalledWith({
            version: 'v2',
            url: '/projects/project/ai-access/service-account',
            method: 'DELETE',
            body: undefined,
        });
        expect(invalidate).toHaveBeenCalledWith(['ai-access']);
        expect(
            screen.queryByRole('button', { name: 'Remove' }),
        ).not.toBeInTheDocument();
    });
    it('keeps the own key when switching to the parent is cancelled', async () => {
        slot = savedSlot;
        parent = parentAccount;
        setup();
        fireEvent.click(
            await screen.findByRole('button', {
                name: "Use the parent's account",
            }),
        );
        fireEvent.click(
            within(await screen.findByRole('dialog')).getByRole('button', {
                name: 'Cancel',
            }),
        );
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        expect(screen.getByText('Key file')).toBeVisible();
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
                            ? WarehouseTypes.POSTGRES
                            : WarehouseTypes.BIGQUERY,
                },
            } as Project);
            expect(
                screen.queryByText('AI service account'),
            ).not.toBeInTheDocument();
            expect(lightdashApi).not.toHaveBeenCalled();
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
    it('collapses setup for a saved key and marks only a successful Test done', async () => {
        slot = savedSlot;
        setup();
        const control = await screen.findByRole('button', {
            name: 'How to set up the AI service account',
        });
        expect(control).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(control);
        expect(screen.queryByLabelText('Step 2 done')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Step 3 done')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        expect(await screen.findByLabelText('Step 3 done')).toBeInTheDocument();
    });
    it('shows an empty slot without repeating the organization rule', async () => {
        setup();
        expect(
            await screen.findByRole('button', {
                name: 'Add AI service account',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText(/When AI agents query/),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Organisation settings' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText(/Agents use the same credentials as the user/),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('warns when a required service account is missing', async () => {
        source = 'ai_service_account';
        setup();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Agents are refused on this project until you add an AI service account.',
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
                screen.getAllByRole('heading', { name: 'AI service account' }),
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
        expect(lightdashApi).toHaveBeenCalledWith({
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
        expect(lightdashApi).toHaveBeenCalledWith({
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
        expect(lightdashApi).not.toHaveBeenCalledWith(
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
                        vi.mocked(lightdashApi).mockResolvedValueOnce({
                            ok: false,
                            principal: null,
                            message: 'Access denied.',
                        });
                    else
                        vi.mocked(lightdashApi).mockRejectedValueOnce({
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
        vi.mocked(lightdashApi).mockResolvedValueOnce({
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
            name: 'Add AI service account',
        });
        expect(
            screen.queryByText('Signs in as tested-principal'),
        ).not.toBeInTheDocument();
    });
    it('saves, replaces and removes the slot only after confirmation', async () => {
        const { invalidate } = setup();
        const dialog = await openForm();
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
        expect(lightdashApi).toHaveBeenCalledWith({
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
            name: 'AI service account',
        });
        expect(
            within(replacement).getByRole('button', { name: 'Save' }),
        ).toBeDisabled();
        fireEvent.click(
            within(replacement).getByRole('button', { name: 'Cancel' }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        const confirmation = await screen.findByRole('dialog', {
            name: 'Remove AI service account',
        });
        expect(lightdashApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'DELETE' }),
        );
        fireEvent.click(
            within(confirmation).getByRole('button', { name: 'Remove' }),
        );
        expect(
            await screen.findByRole('button', {
                name: 'Add AI service account',
            }),
        ).toBeInTheDocument();
        expect(lightdashApi).toHaveBeenCalledWith({
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
        vi.mocked(lightdashApi).mockResolvedValueOnce({
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
                screen.queryByText('AI service account'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Agent identity' }),
            ).not.toBeInTheDocument();
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );
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
        expect(screen.getByText('AI service account')).toBeVisible();
    });
    it.each(['flag', 'permission'])(
        'does not load the identity page without %s',
        (gate) => {
            mocks.enabled = gate !== 'flag';
            mocks.canManage = gate !== 'permission';
            setup(project, false, true);
            expect(lightdashApi).not.toHaveBeenCalled();
            expect(
                screen.queryByText('Organization rule for this warehouse'),
            ).not.toBeInTheDocument();
        },
    );
    it('shows an unsupported warehouse state without fetching rules', () => {
        setup(
            {
                ...project,
                warehouseConnection: { type: WarehouseTypes.POSTGRES },
            } as Project,
            false,
            true,
        );
        expect(
            screen.getByText(
                'Agent identity is not available for this warehouse.',
            ),
        ).toBeVisible();
        expect(lightdashApi).not.toHaveBeenCalled();
    });
    it('keeps the form open and reports a failed save', async () => {
        setup();
        const dialog = await openForm();
        upload();
        const button = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(button).toBeEnabled());
        const error = { message: 'Could not save credentials.' };
        vi.mocked(lightdashApi).mockRejectedValueOnce({ error });
        fireEvent.click(button);
        await waitFor(() =>
            expect(mocks.errorToast).toHaveBeenCalledWith({
                title: 'Could not save the AI service account.',
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
            name: 'Remove AI service account',
        });
        const error = { message: 'Could not remove credentials.' };
        vi.mocked(lightdashApi).mockRejectedValueOnce({ error });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
        await waitFor(() =>
            expect(mocks.errorToast).toHaveBeenCalledWith({
                title: 'Could not remove the AI service account.',
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
        vi.mocked(lightdashApi).mockRejectedValueOnce({
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
        vi.mocked(lightdashApi).mockRejectedValue({
            error: { message: 'Unavailable' },
        });
        setup();
        expect(
            await screen.findByText('Could not load the AI service account.'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add AI service account' }),
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
                name: 'Add AI service account',
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
                setup(snowflakeProject);
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
                        screen.getByText(/Uses the AI service account from/),
                    ).toBeVisible();
                fireEvent.click(screen.getByRole('button', { name: 'Test' }));
                await waitFor(() =>
                    expect(lightdashApi).toHaveBeenCalledWith(
                        expect.objectContaining({
                            url: '/projects/project/ai-access/service-account/test',
                            body: JSON.stringify({ credentials: null }),
                        }),
                    ),
                );
                expect(lightdashApi).not.toHaveBeenCalledWith(
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
                setup(snowflakeProject);
                expect(await screen.findByRole('alert')).toHaveTextContent(
                    owner === 'own'
                        ? "The AI service account can't be read. Replace it."
                        : "Agents are refused on this preview. Lightdash can't read the parent project's AI service account. Add this preview's own account, or ask an admin of Production to replace it.",
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
                expect(
                    screen.getByRole('button', {
                        name:
                            owner === 'own'
                                ? 'Replace'
                                : "Add this preview's own account",
                    }),
                ).toBeEnabled();
                expect(lightdashApi).not.toHaveBeenCalledWith(
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
                setup(snowflakeProject);
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
                expect(
                    screen.getByRole('button', {
                        name:
                            owner === 'own'
                                ? 'Replace'
                                : "Add this preview's own account",
                    }),
                ).toBeEnabled();
                vi.mocked(lightdashApi).mockResolvedValueOnce({
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
            vi.mocked(lightdashApi).mockRejectedValueOnce({
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
                expect(lightdashApi).toHaveBeenCalledWith(
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
            vi.mocked(lightdashApi).mockRejectedValueOnce({
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
        it('returns to the parent only after removal is confirmed', async () => {
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
            setup(snowflakeProject);
            fireEvent.click(
                await screen.findByRole('button', {
                    name: "Use the parent's account",
                }),
            );
            const modal = within(await screen.findByRole('dialog'));
            expect(
                modal.getByText('PARENT with role PARENT_ROLE'),
            ).toBeVisible();
            expect(lightdashApi).not.toHaveBeenCalledWith(
                expect.objectContaining({ method: 'DELETE' }),
            );
            fireEvent.click(
                modal.getByRole('button', { name: "Use the parent's account" }),
            );
            expect(
                await screen.findByText(
                    'Signs in as PARENT with role PARENT_ROLE',
                ),
            ).toBeVisible();
            expect(
                screen.queryByText(
                    'Signs in as OBSERVED_USER with role OBSERVED_ROLE',
                ),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Remove' }),
            ).not.toBeInTheDocument();
        });
        it.each(['flag', 'permission'])(
            'renders no card or setup and makes no request without %s',
            (gate) => {
                mocks.enabled = gate !== 'flag';
                mocks.canManage = gate !== 'permission';
                const { container } = setup(snowflakeProject);
                expect(
                    container.querySelector('.mantine-Accordion-root'),
                ).toBeNull();
                expect(
                    screen.queryByText('AI service account'),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByText(
                        /Use TYPE = SERVICE_AGENT so Snowflake marks these sessions as agent sessions./,
                    ),
                ).not.toBeInTheDocument();
                expect(lightdashApi).not.toHaveBeenCalled();
            },
        );
    });
});
