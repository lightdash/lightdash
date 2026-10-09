import {
    BigqueryAuthenticationType,
    DbtProjectType,
    ProjectType,
    WarehouseTypes,
    type AiIdentitySource,
    type AiServiceAccountSlot,
    type Project,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import UpdateProjectConnection from '../../components/ProjectConnection/UpdateProjectConnection';
import { renderWithProviders } from '../../testing/testUtils';
import { AiServiceAccountCard } from './AiServiceAccountCard';
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
vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
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

let source: AiIdentitySource = 'marked_person';
let slot: AiServiceAccountSlot | null = null;
const savedSlot = {
    uuid: 'slot',
    identityUuid: 'identity',
    projectUuid: 'project',
    warehouseType: WarehouseTypes.BIGQUERY,
    method: 'private_key',
    updatedAt: new Date('2026-10-08T12:00:00Z'),
} as AiServiceAccountSlot;
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
            name: 'Add an AI service account',
        }),
    );
    return screen.findByRole('dialog', { name: 'AI service account' });
};

describe('AI service account card', () => {
    it('tests saved agent access without changing the existing credential test', async () => {
        slot = savedSlot;
        setup();
        expect(
            await screen.findByRole('button', { name: 'Test' }),
        ).toBeVisible();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Test as agent' }),
        );
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    version: 'v2',
                    url: '/projects/project/ai-access/service-account/test-access',
                    method: 'POST',
                    sensitive: true,
                    body: JSON.stringify({
                        credentials: null,
                        entryPoint: 'project_agent_identity_page',
                    }),
                }),
            ),
        );
    });
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.enabled = true;
        mocks.canManage = true;
        source = 'marked_person';
        slot = null;
        vi.mocked(lightdashApi).mockImplementation(async ({ url, method }) => {
            if (url === '/org/agent-identity')
                return {
                    requireVerifiedAgentSessions: false,
                    rules: [
                        {
                            warehouseType: WarehouseTypes.BIGQUERY,
                            source,
                            projectsMissingAiServiceAccount: null,
                        },
                    ],
                };
            if (url.endsWith('/test-access'))
                return {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    subject: { kind: 'ai_service_account' },
                    credentialSource: 'saved',
                    status: 'failed',
                    failureReason: 'unknown',
                    principal: null,
                    message: 'Could not verify agent access.',
                    datasets: [],
                    tables: [],
                    readableCount: 0,
                    blockedCount: 0,
                    errorCount: 0,
                    checkedCount: 0,
                    notCheckedCount: 0,
                    totalCount: null,
                    truncatedCount: 0,
                    checkedAt: new Date(),
                };
            if (url.endsWith('/test'))
                return {
                    ok: true,
                    principal: 'tested-principal',
                    message: 'Connection works.',
                    observed: {},
                    checkedAt: new Date(),
                };
            if (method === 'PUT') slot = savedSlot;
            if (method === 'DELETE') slot = null;
            return slot;
        });
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
                            ? WarehouseTypes.SNOWFLAKE
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
            'gcloud iam service-accounts create lightdash-agents --project=data-project',
        );
        expect(code).toHaveTextContent(
            'gcloud projects add-iam-policy-binding job-project',
        );
        expect(code).toHaveTextContent(
            'serviceAccount:lightdash-agents@data-project.iam.gserviceaccount.com',
        );
        expect(code).toHaveTextContent('bq query --project_id=job-project');
        expect(code).toHaveTextContent('ON SCHEMA `data-project`.analytics');
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
            screen.getByText(/gcloud iam service-accounts create/),
        ).not.toHaveTextContent('bq query');
    });
    it('collapses setup for a saved key and marks upload and successful Test steps done', async () => {
        slot = savedSlot;
        setup();
        const control = await screen.findByRole('button', {
            name: 'Set up the AI service account',
        });
        expect(control).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(control);
        expect(screen.getByLabelText('Step 2 done')).toBeInTheDocument();
        expect(screen.queryByLabelText('Step 3 done')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        expect(await screen.findByLabelText('Step 3 done')).toBeInTheDocument();
    });
    it('shows an empty slot without repeating the organization rule', async () => {
        setup();
        expect(
            await screen.findByRole('button', {
                name: 'Add an AI service account',
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
            'AI agents on this connection are refused until an AI service account is added.',
        );
    });
    it.each([
        [
            'marked_person',
            "Queries are tagged as agent queries. Warehouse policies can't act on the tag.",
        ],
        [
            'ai_service_account',
            "Admins add it on each project connection. Everyone's agent gets that account's access.",
        ],
    ] as const)(
        'shows the %s helper only in the organization rule card',
        async (ruleSource, helper) => {
            source = ruleSource;
            setup(project, false, true);
            const heading = await screen.findByRole('heading', {
                name: 'Organization rule for this warehouse',
            });
            expect(screen.getAllByText(helper)).toHaveLength(1);
            expect(
                within(heading.parentElement!).getByText(helper),
            ).toBeVisible();
            expect(
                screen.getAllByRole('link', {
                    name: /Organi[sz]ation settings/,
                }),
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
        expect(
            screen.getByText('Service account key file'),
        ).toBeInTheDocument();
        expect(screen.getByText(/Last updated/)).toBeInTheDocument();
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
            name: 'Add an AI service account',
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
                name: 'Add an AI service account',
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
                screen.queryByRole('button', { name: 'Test as agent' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'Agent identity' }),
            ).not.toBeInTheDocument();
            expect(lightdashApi).not.toHaveBeenCalled();
        },
    );
    it('shows the read-only organization rule, card and Test as agent on the identity page', async () => {
        slot = savedSlot;
        setup(project, false, true);
        expect(
            await screen.findByText('Organization rule for this warehouse'),
        ).toBeVisible();
        expect(screen.getByText('Same credentials as the user')).toBeVisible();
        expect(screen.getByText(/Set by an organization admin/)).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Organization settings' }),
        ).toHaveAttribute('href', '/generalSettings/warehouseCredentials');
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Test as agent' }),
        );
        expect(
            await screen.findByText('Could not verify agent access.'),
        ).toBeVisible();
        expect(screen.getByText('AI service account')).toBeVisible();
    });
    it('keeps the access result until the saved slot is removed', async () => {
        slot = savedSlot;
        setup(project, false, true);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Test as agent' }),
        );
        await screen.findByText('Could not verify agent access.');
        fireEvent.click(screen.getByRole('button', { name: 'Test' }));
        await screen.findByText('Signs in as tested-principal');
        expect(
            screen.getByText('Could not verify agent access.'),
        ).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        fireEvent.click(
            within(await screen.findByRole('dialog')).getByRole('button', {
                name: 'Remove',
            }),
        );
        await screen.findByRole('button', {
            name: 'Add an AI service account',
        });
        expect(
            screen.queryByText('Could not verify agent access.'),
        ).not.toBeInTheDocument();
    });
    it('clears the access result when the saved key is replaced', async () => {
        slot = { ...savedSlot, identityUuid: 'previous-identity' };
        setup(project, false, true);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Test as agent' }),
        );
        await screen.findByText('Could not verify agent access.');
        fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
        const dialog = await screen.findByRole('dialog');
        expect(
            screen.getByText('Could not verify agent access.'),
        ).toBeVisible();
        upload();
        const saveButton = within(dialog).getByRole('button', { name: 'Save' });
        await waitFor(() => expect(saveButton).toBeEnabled());
        fireEvent.click(saveButton);
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(
            screen.queryByText('Could not verify agent access.'),
        ).not.toBeInTheDocument();
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
        expect(
            screen.getByText('Service account key file'),
        ).toBeInTheDocument();
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
            screen.queryByRole('button', { name: 'Add an AI service account' }),
        ).not.toBeInTheDocument();
    });
});
