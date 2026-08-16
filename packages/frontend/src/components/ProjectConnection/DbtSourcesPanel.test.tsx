import { DbtProjectType } from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
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

const routeApi = (sourceName = source.name) => {
    mockApi.mockImplementation(
        ({ url, method }: { url: string; method: string }) => {
            if (url === '/projects/project-uuid/dbt-sources') {
                return Promise.resolve([{ ...source, name: sourceName }]);
            }
            if (url === '/projects/project-uuid/dbt-sources/source-uuid') {
                if (method === 'GET') {
                    return Promise.resolve({
                        ...source,
                        name: sourceName,
                        dbtConnection: connection,
                    });
                }
                return Promise.resolve({ ...source, name: sourceName });
            }
            if (url === '/github/config') {
                return Promise.resolve({ enabled: false });
            }
            return Promise.resolve(undefined);
        },
    );
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
    });

    it('updates a legacy source connection without resubmitting its invalid name', async () => {
        routeApi();
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
});
