import { DbtProjectType } from '@lightdash/common';
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import { lightdashApi } from '../../api';
import { renderWithProviders } from '../../testing/testUtils';
import DbtSourcesPanel from './DbtSourcesPanel';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: true } }),
}));

const mockApi = lightdashApi as unknown as Mock;

const source = {
    projectDbtSourceUuid: 'source-uuid',
    name: 'my source!',
    isPrimary: false,
    precedence: 1,
    hasCredentialError: false,
    type: DbtProjectType.GITHUB,
    repository: 'org/old-repo',
    branch: 'main',
    projectSubPath: '/',
};

const primarySource = {
    projectDbtSourceUuid: 'primary-source-uuid',
    name: 'dbt_project',
    isPrimary: true,
    precedence: 0,
    hasCredentialError: false,
    type: DbtProjectType.GITHUB,
    repository: 'org/primary',
    branch: 'main',
    projectSubPath: '/',
};

const connection = {
    type: DbtProjectType.GITHUB,
    environment: [],
    target: '',
    selector: '',
    repository: 'org/old-repo',
    personal_access_token: '',
    installation_id: '',
    authorization_method: 'personal_access_token' as const,
    branch: 'main',
    project_sub_path: '/',
    host_domain: 'github.com',
};

const routeApi = (sourceName?: string) => {
    mockApi.mockImplementation(
        ({ url, method }: { url: string; method: string }) => {
            if (url === '/projects/project-uuid/dbt-sources') {
                if (method === 'POST') {
                    return Promise.resolve({
                        projectDbtSourceUuid: 'source-uuid',
                        name: 'marketing',
                        isPrimary: false,
                        hasCredentialError: false,
                        type: DbtProjectType.GITHUB,
                        repository: 'org/repo',
                        branch: 'main',
                        projectSubPath: '/',
                    });
                }
                return Promise.resolve(
                    sourceName === undefined
                        ? [primarySource]
                        : [primarySource, { ...source, name: sourceName }],
                );
            }
            if (
                url === '/projects/project-uuid/dbt-sources/source-uuid' &&
                sourceName !== undefined
            ) {
                if (method === 'GET') {
                    return Promise.resolve({
                        ...source,
                        name: sourceName,
                        dbtConnection: connection,
                    });
                }
                return Promise.resolve({ ...source, name: sourceName });
            }
            if (
                url ===
                    '/projects/project-uuid/dbt-sources/primary-source-uuid' &&
                method === 'PATCH'
            ) {
                return Promise.resolve({
                    ...primarySource,
                    name: 'core_analytics',
                });
            }
            if (url === '/github/config') {
                return Promise.resolve({
                    enabled: true,
                    installationId: 'installation-id',
                });
            }
            if (url === '/github/repos/list') {
                return Promise.resolve([{ fullName: 'org/repo' }]);
            }
            return Promise.resolve(undefined);
        },
    );
};

const openAddSourceModal = async () => {
    const user = userEvent.setup();
    renderWithProviders(<DbtSourcesPanel projectUuid="project-uuid" />);
    await user.click(await screen.findByRole('button', { name: 'Add source' }));
    await screen.findByText('Add a dbt source');
    return {
        dialog: await screen.findByRole('dialog'),
        user,
    };
};

const openEditSourceModal = async (sourceName: string) => {
    const user = userEvent.setup();
    renderWithProviders(<DbtSourcesPanel projectUuid="project-uuid" />);
    await user.click(
        await screen.findByRole('button', {
            name: `Actions for ${sourceName}`,
        }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    return { dialog: await screen.findByRole('dialog'), user };
};

describe('DbtSourcesPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        routeApi();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('describes additional sources as merged on every deploy', async () => {
        const { dialog } = await openAddSourceModal();

        expect(
            within(dialog).getByText(
                "Connect another git-backed dbt project. Its models are merged with this project's dbt connection on every deploy.",
            ),
        ).toBeInTheDocument();
    });

    it('closes after a source is created without waiting for list invalidation', async () => {
        vi.spyOn(QueryClient.prototype, 'invalidateQueries').mockReturnValue(
            new Promise(() => {}),
        );
        const { dialog, user } = await openAddSourceModal();

        await user.type(
            within(dialog).getByRole('textbox', { name: /Name/ }),
            'marketing',
        );
        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({ url: '/github/repos/list' }),
            ),
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Add source' }),
        );

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/projects/project-uuid/dbt-sources',
                    method: 'POST',
                }),
            ),
        );
        await waitFor(() =>
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
    });

    it('updates a legacy source connection without resubmitting its invalid name', async () => {
        routeApi(source.name);
        const { dialog, user } = await openEditSourceModal(source.name);
        const repository = within(dialog).getByRole('textbox', {
            name: 'Repository',
        });

        await user.clear(repository);
        await user.type(repository, 'org/new-repo');
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/projects/project-uuid/dbt-sources/source-uuid',
                    method: 'PATCH',
                    body: expect.not.stringContaining('"name"'),
                }),
            ),
        );
    });

    it('rejects the same legacy value when it is an actual rename', async () => {
        routeApi('analytics');
        const { dialog, user } = await openEditSourceModal('analytics');
        const name = within(dialog).getByRole('textbox', { name: 'Name' });

        await user.clear(name);
        await user.type(name, source.name);
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );

        expect(
            within(dialog).getByText(
                'Use only letters, numbers, and underscores',
            ),
        ).toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PATCH' }),
        );
    });

    it('rejects the reserved qualifier separator on an actual rename', async () => {
        routeApi('analytics');
        const { dialog, user } = await openEditSourceModal('analytics');
        const name = within(dialog).getByRole('textbox', { name: 'Name' });

        await user.clear(name);
        await user.type(name, 'sales__orders');
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );

        expect(
            within(dialog).getByText('Name cannot contain "__"'),
        ).toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalledWith(
            expect.objectContaining({ method: 'PATCH' }),
        );
    });

    it('marks the access token as optional for public repositories', async () => {
        const { dialog, user } = await openAddSourceModal();

        await user.click(
            within(dialog).getByRole('textbox', {
                name: 'Authorization method',
            }),
        );
        await user.click(
            await screen.findByRole('option', {
                name: 'Personal Access Token',
            }),
        );

        expect(
            within(dialog).getByLabelText(/Personal access token/),
        ).not.toBeRequired();
        expect(
            within(dialog).getByText('Required for private repositories'),
        ).toBeInTheDocument();
    });

    it('starts app authentication with no repository selected', async () => {
        const { dialog } = await openAddSourceModal();
        const repository = await within(dialog).findByRole('textbox', {
            name: 'Repository',
        });

        expect(repository).toHaveValue('');
        expect(repository).toHaveAttribute(
            'placeholder',
            'Select a repository',
        );
    });

    it('shows and renames the primary source with an explore-name warning', async () => {
        const user = userEvent.setup();
        renderWithProviders(<DbtSourcesPanel projectUuid="project-uuid" />);

        expect(await screen.findByText('dbt_project')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Actions for dbt_project' }),
        );
        await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

        const dialog = await screen.findByRole('dialog');
        expect(
            within(dialog).getByText(
                'Renaming this source changes qualified explore names on the next deploy.',
            ),
        ).toBeInTheDocument();

        const nameInput = within(dialog).getByRole('textbox', { name: 'Name' });
        await user.clear(nameInput);
        await user.type(nameInput, 'core-analytics');
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );
        expect(
            within(dialog).getByText(
                'Use only letters, numbers, and underscores',
            ),
        ).toBeInTheDocument();

        await user.clear(nameInput);
        await user.type(nameInput, 'core_analytics');
        await user.click(
            within(dialog).getByRole('button', { name: 'Save changes' }),
        );

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/projects/project-uuid/dbt-sources/primary-source-uuid',
                    method: 'PATCH',
                    body: JSON.stringify({ name: 'core_analytics' }),
                }),
            ),
        );
    });
});
