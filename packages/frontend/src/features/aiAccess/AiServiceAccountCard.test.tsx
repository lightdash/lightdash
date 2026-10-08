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
    warehouseConnection: { type: WarehouseTypes.BIGQUERY },
    dbtConnection: { type: DbtProjectType.NONE },
} as Project;
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
let required = false;
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
const setup = (props = project, connectionPage = false) => {
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
                ) : (
                    <AiServiceAccountCard project={props} />
                )}
            </MemoryRouter>
        </QueryClientProvider>,
    );
    return { ...rendered, invalidate };
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
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.enabled = true;
        mocks.canManage = true;
        source = 'marked_person';
        required = false;
        slot = null;
        vi.mocked(lightdashApi).mockImplementation(async ({ url, method }) => {
            if (url === '/org/agent-identity')
                return {
                    requireVerifiedAgentSessions: false,
                    rules: [
                        {
                            warehouseType: WarehouseTypes.BIGQUERY,
                            source,
                            required,
                        },
                    ],
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
    it('shows an empty slot and the read-only organisation rule', async () => {
        setup();
        expect(
            await screen.findByText(
                'When AI agents query BigQuery, they run as Same credentials as the user.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Organisation settings' }),
        ).toHaveAttribute('href', '/generalSettings/warehouseCredentials');
        expect(
            screen.getByRole('button', { name: 'Add an AI service account' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });
    it('warns when a required service account is missing', async () => {
        source = 'ai_service_account';
        required = true;
        setup();
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'AI agents on this connection are refused until an AI service account is added.',
        );
        expect(
            screen.getByText('Required by your organisation.'),
        ).toBeInTheDocument();
    });
    it('explains the fallback for an optional service account', async () => {
        source = 'ai_service_account';
        setup();
        expect(
            await screen.findByText(
                'AI agents use the same credentials as the user until an AI service account is added.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('tests a saved slot with null credentials and shows only the returned principal', async () => {
        slot = savedSlot;
        setup();
        fireEvent.click(await screen.findByRole('button', { name: 'Test' }));
        expect(await screen.findByRole('status')).toHaveTextContent(
            'tested-principal',
        );
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
        expect(await screen.findByRole('status')).toHaveTextContent(
            'tested-principal',
        );
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
    it('mounts outside the connection form and never submits it', async () => {
        const { container } = setup(project, true);
        const add = await screen.findByRole('button', {
            name: 'Add an AI service account',
        });
        expect(container.querySelectorAll('form')).toHaveLength(1);
        expect(add.closest('form')).toBeNull();
        fireEvent.click(add);
        upload();
        const saveButton = within(await screen.findByRole('dialog')).getByRole(
            'button',
            { name: 'Save' },
        );
        await waitFor(() => expect(saveButton).toBeEnabled());
        fireEvent.click(saveButton);
        expect(
            await screen.findByRole('button', { name: 'Replace' }),
        ).toBeInTheDocument();
        expect(mocks.submit).not.toHaveBeenCalled();
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
        expect(await screen.findByRole('status')).toHaveTextContent(
            'tested-principal',
        );
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
