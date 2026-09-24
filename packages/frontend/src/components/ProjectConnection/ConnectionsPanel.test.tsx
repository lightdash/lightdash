import {
    ProjectType,
    WarehouseTypes,
    type Project,
    type WarehouseConnection,
} from '@lightdash/common';
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
import ConnectionsPanel from './ConnectionsPanel';

const flag = vi.hoisted(() => ({ enabled: true }));

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

const mockApi = lightdashApi as unknown as Mock;

const original: WarehouseConnection = {
    warehouseConnectionUuid: 'original-uuid',
    projectUuid: 'project-uuid',
    name: 'Warehouse',
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

const listUrl = '/projects/project-uuid/warehouse-connections';

const organizationUuid = 'organization-uuid';

const projectRule = (action: 'manage' | 'update') => ({
    action,
    subject: 'Project' as const,
    conditions: { organizationUuid, projectUuid: 'project-uuid' },
});

const renderPanel = (
    type: ProjectType = ProjectType.DEFAULT,
    abilityRules = [projectRule('manage')],
) => {
    renderWithProviders(
        <ConnectionsPanel
            savedProject={
                {
                    projectUuid: 'project-uuid',
                    organizationUuid,
                    type,
                } as Project
            }
        />,
        { user: { abilityRules } },
    );
    return userEvent.setup();
};

describe('ConnectionsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders nothing and calls no API while the rollout flag is off', async () => {
        flag.enabled = false;
        renderPanel();

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('renders nothing and calls no API for a preview project', async () => {
        renderPanel(ProjectType.PREVIEW);

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('renders nothing for a single-connection project', async () => {
        mockApi.mockRejectedValue({
            status: 'error',
            error: {
                name: 'SingleConnectionProjectError',
                message: 'This project uses a single warehouse connection.',
                statusCode: 409,
                data: {},
            },
        });
        renderPanel();

        await waitFor(() =>
            expect(mockApi).toHaveBeenCalledWith(
                expect.objectContaining({ url: listUrl, method: 'GET' }),
            ),
        );
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Failed to load connections.'),
        ).not.toBeInTheDocument();
    });

    it('renders nothing and calls no API when the viewer can update but not manage the project', async () => {
        renderPanel(ProjectType.DEFAULT, [projectRule('update')]);

        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('renders nothing when the server refuses the viewer (403)', async () => {
        mockApi.mockRejectedValue({
            status: 'error',
            error: {
                name: 'ForbiddenError',
                message: 'You do not have permission to manage this project',
                statusCode: 403,
                data: {},
            },
        });
        renderPanel();

        await waitFor(() => expect(mockApi).toHaveBeenCalled());
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
        expect(screen.queryByText('Connections')).not.toBeInTheDocument();
        expect(
            screen.queryByText('Failed to load connections.'),
        ).not.toBeInTheDocument();
    });

    it('lists connections and only offers edit and removal for extra connections', async () => {
        mockApi.mockResolvedValue({
            connections: [original, extra],
            capabilities: { canAddConnection: true, reason: null },
        });
        const user = renderPanel();

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Warehouse',
            }),
        );
        const originalMenu = await screen.findByRole('menu');
        expect(
            within(originalMenu).getByRole('menuitem', { name: 'Rename' }),
        ).toBeInTheDocument();
        expect(
            within(originalMenu).queryByRole('menuitem', { name: 'Remove' }),
        ).not.toBeInTheDocument();
        expect(
            within(originalMenu).queryByRole('menuitem', { name: 'Edit' }),
        ).not.toBeInTheDocument();
        await user.keyboard('{Escape}');

        await user.click(
            screen.getByRole('button', { name: 'Actions for Finance' }),
        );
        const extraMenu = await screen.findByRole('menu');
        expect(
            within(extraMenu).getByRole('menuitem', { name: 'Remove' }),
        ).toBeInTheDocument();
        expect(
            within(extraMenu).getByRole('menuitem', { name: 'Edit' }),
        ).toBeInTheDocument();
    });

    it('disables adding a connection when the project cannot hold another', async () => {
        mockApi.mockResolvedValue({
            connections: [original],
            capabilities: {
                canAddConnection: false,
                reason: 'Extra connections are not enabled for this organisation yet.',
            },
        });
        renderPanel();

        expect(
            await screen.findByRole('button', { name: 'Add connection' }),
        ).toBeDisabled();
    });

    it('shows why a bound connection cannot be removed', async () => {
        const refusal =
            "Connection 'Finance' cannot be removed while content uses it. explores: orders.";
        mockApi.mockImplementation(({ method }: { method: string }) =>
            method === 'DELETE'
                ? Promise.reject({
                      status: 'error',
                      error: {
                          name: 'ConflictError',
                          message: refusal,
                          statusCode: 409,
                          data: {},
                      },
                  })
                : Promise.resolve({
                      connections: [original, extra],
                      capabilities: { canAddConnection: true, reason: null },
                  }),
        );
        const user = renderPanel();

        await user.click(
            await screen.findByRole('button', { name: 'Actions for Finance' }),
        );
        await user.click(
            await screen.findByRole('menuitem', { name: 'Remove' }),
        );
        const title = await screen.findByText('Remove connection');
        const dialog = title.closest<HTMLElement>(
            '[role="alertdialog"], [role="dialog"]',
        )!;
        await user.click(
            within(dialog).getByRole('button', { name: 'Remove' }),
        );

        expect(await within(dialog).findByText(refusal)).toBeInTheDocument();
        expect(mockApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `${listUrl}/extra-uuid`,
                method: 'DELETE',
            }),
        );
    });
});
