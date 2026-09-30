import { ProjectType, type OrganizationProject } from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nock from 'nock';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import ProjectManagementPanel from '.';
import { BASE_API_URL } from '../../../api';
import { renderWithProviders } from '../../../testing/testUtils';

// Matches the defaults in testing/__mocks__/api/userResponse.mock.ts
const ORGANIZATION_UUID = '172a2270-000f-42be-9c68-c4752c23ae51';
const ME = 'b264d83a-9000-426a-85ec-3f9c20f368ce';
const ALICE = '0f8c1c6e-1111-4a2b-9c3d-aaaaaaaaaaaa';
const BOB = '0f8c1c6e-2222-4a2b-9c3d-bbbbbbbbbbbb';

const project = (
    overrides: Partial<OrganizationProject> &
        Pick<OrganizationProject, 'projectUuid' | 'name'>,
): OrganizationProject => ({
    type: ProjectType.PREVIEW,
    createdByUserUuid: ALICE,
    createdByUserName: 'Alice Adams',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    upstreamProjectUuid: null,
    expiresAt: null,
    ...overrides,
});

const mockProjects = (projects: OrganizationProject[]) =>
    nock(BASE_API_URL)
        .persist()
        .get('/api/v1/org/projects')
        .reply(200, { status: 'ok', results: projects });

// Sortable column headers are buttons too, so pick the one in the toolbar.
const getToolbarButton = (name: string) => {
    const button = screen
        .getAllByRole('button', { name })
        .find((element) => !element.closest('thead'));
    if (!button) throw new Error(`No toolbar button named "${name}"`);
    return button;
};

const renderPanel = (appMocks?: Parameters<typeof renderWithProviders>[1]) =>
    renderWithProviders(
        <MemoryRouter>
            <ProjectManagementPanel />
        </MemoryRouter>,
        appMocks,
    );

describe('ProjectManagementPanel bulk delete', () => {
    it('only deletes the selected projects that are still visible after narrowing the filter', async () => {
        const user = userEvent.setup();
        mockProjects([
            project({
                projectUuid: 'prod',
                name: 'Production',
                type: ProjectType.DEFAULT,
                createdByUserUuid: ME,
                createdByUserName: 'David Attenborough',
            }),
            project({ projectUuid: 'alice-1', name: 'alice preview 1' }),
            project({ projectUuid: 'alice-2', name: 'alice preview 2' }),
            project({
                projectUuid: 'bob-1',
                name: 'bob preview',
                createdByUserUuid: BOB,
                createdByUserName: 'Bob Brown',
            }),
        ]);
        const hiddenDeletes: string[] = [];
        nock(BASE_API_URL)
            .delete(/\/api\/v1\/org\/projects\/alice-/)
            .times(2)
            .optionally()
            .reply(function reply() {
                hiddenDeletes.push(this.req.path);
                return [200, { status: 'ok', results: null }];
            });
        const bobDeletion = nock(BASE_API_URL)
            .delete('/api/v1/org/projects/bob-1')
            .reply(200, { status: 'ok', results: null });

        renderPanel();
        await screen.findByText('bob preview');

        await user.click(screen.getByRole('radio', { name: 'Preview' }));
        await user.click(screen.getByRole('button', { name: 'Select all' }));
        expect(screen.getByText('3 selected')).toBeInTheDocument();

        await user.click(getToolbarButton('Created by'));
        await user.click(
            await screen.findByRole('checkbox', { name: 'Bob Brown' }),
        );
        expect(screen.queryByText('alice preview 1')).not.toBeInTheDocument();
        expect(screen.getByText('1 selected')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Delete' }));
        const dialog = await screen.findByRole('dialog', {
            name: 'Delete projects in bulk',
        });
        expect(dialog).toHaveTextContent('1 preview project');
        expect(dialog).not.toHaveTextContent('3 preview projects');

        await user.type(
            within(dialog).getByPlaceholderText('delete'),
            'delete',
        );
        await user.click(
            within(dialog).getByRole('button', { name: 'Delete' }),
        );

        await waitFor(() =>
            expect(
                screen.queryByRole('dialog', {
                    name: 'Delete projects in bulk',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(bobDeletion.isDone()).toBe(true);
        expect(hiddenDeletes).toEqual([]);
    });

    it('does not select projects the user cannot delete with "Select all"', async () => {
        const user = userEvent.setup();
        mockProjects([
            project({
                projectUuid: 'mine-1',
                name: 'my preview 1',
                createdByUserUuid: ME,
                createdByUserName: 'David Attenborough',
            }),
            project({
                projectUuid: 'mine-2',
                name: 'my preview 2',
                createdByUserUuid: ME,
                createdByUserName: 'David Attenborough',
            }),
            project({ projectUuid: 'alice-1', name: 'alice preview 1' }),
        ]);

        renderPanel({
            user: {
                abilityRules: [
                    {
                        action: 'view',
                        subject: 'Project',
                        conditions: { organizationUuid: ORGANIZATION_UUID },
                    },
                    {
                        action: 'delete',
                        subject: 'Project',
                        conditions: {
                            organizationUuid: ORGANIZATION_UUID,
                            type: ProjectType.PREVIEW,
                            createdByUserUuid: ME,
                        },
                    },
                ],
            },
        });
        await screen.findByText('alice preview 1');

        await user.click(screen.getByRole('radio', { name: 'Preview' }));
        await user.click(screen.getByRole('button', { name: 'Select all' }));

        expect(screen.getByText('2 selected')).toBeInTheDocument();
        const rowCheckboxes = screen
            .getAllByRole('checkbox')
            .filter((checkbox) => checkbox.hasAttribute('disabled'));
        expect(rowCheckboxes).toHaveLength(1);
        expect(rowCheckboxes[0]).not.toBeChecked();
    });
});
