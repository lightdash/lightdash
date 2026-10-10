import { getSystemRoles, type RoleWithScopes } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomRoleDuplicate } from './CustomRoleDuplicate';

const mocks = vi.hoisted(() => ({
    createRole: vi.fn(),
    agentIdentityEnabled: true,
    roles: [] as RoleWithScopes[],
}));
vi.mock('../../features/customRoles/useCustomRoles', () => ({
    useCustomRoles: () => ({
        createRole: { mutateAsync: mocks.createRole, isLoading: false },
        getAllRoles: { data: mocks.roles, isLoading: false },
    }),
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: mocks.agentIdentityEnabled },
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentIdentityEnabled = true;
    mocks.roles = getSystemRoles();
});

const selectRole = async (name: string) => {
    render(
        <MemoryRouter>
            <MantineProvider env="test">
                <CustomRoleDuplicate />
            </MantineProvider>
        </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(
        screen.getByRole('combobox', { name: /Select role to duplicate/ }),
    );
    await user.click(await screen.findByRole('option', { name }));
    return user;
};

describe('CustomRoleDuplicate', () => {
    it.each(['project', 'organization', 'project again'])(
        'omits Raw SQL when copying a built-in role at %s level',
        async (level) => {
            const user = await selectRole('Editor');
            if (level !== 'project') {
                await user.click(
                    screen.getByRole('button', { name: /Organization role/ }),
                );
            }
            if (level === 'project again') {
                await user.click(
                    screen.getByRole('button', { name: /Project role/ }),
                );
            }
            await user.click(
                screen.getByRole('button', { name: 'Create role' }),
            );
            await waitFor(() =>
                expect(mocks.createRole).toHaveBeenCalledOnce(),
            );
            expect(mocks.createRole).toHaveBeenCalledWith(
                expect.objectContaining({
                    level:
                        level === 'organization' ? 'organization' : 'project',
                    scopes: expect.not.arrayContaining(['view:AgentRawSql']),
                }),
            );
            expect(mocks.createRole).toHaveBeenCalledWith(
                expect.objectContaining({
                    scopes: expect.arrayContaining([
                        'view:AgentReadDiscover',
                        'view:AgentQuery',
                        'view:AgentExport',
                    ]),
                }),
            );
        },
    );

    it('omits Raw SQL when copying a built-in role with agent identity disabled', async () => {
        mocks.agentIdentityEnabled = false;
        const user = await selectRole('Editor');
        await user.click(screen.getByRole('button', { name: /AI Features/ }));
        expect(screen.queryByText('Agent permissions')).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Create role' }));
        await waitFor(() => expect(mocks.createRole).toHaveBeenCalledOnce());
        expect(mocks.createRole).toHaveBeenCalledWith(
            expect.objectContaining({
                scopes: expect.not.arrayContaining(['view:AgentRawSql']),
            }),
        );
    });

    it('keeps an explicit Raw SQL grant when copying a custom role', async () => {
        mocks.roles = [
            {
                roleUuid: 'custom-role',
                name: 'SQL agent',
                description: null,
                level: 'project',
                organizationUuid: 'org',
                ownerType: 'user',
                createdBy: null,
                createdAt: null,
                updatedAt: null,
                scopes: ['view:AgentRawSql'],
            },
        ];
        const user = await selectRole('SQL agent');
        await user.click(screen.getByRole('button', { name: 'Create role' }));
        await waitFor(() =>
            expect(mocks.createRole).toHaveBeenCalledWith(
                expect.objectContaining({
                    scopes: ['view:AgentRawSql'],
                }),
            ),
        );
    });
});
