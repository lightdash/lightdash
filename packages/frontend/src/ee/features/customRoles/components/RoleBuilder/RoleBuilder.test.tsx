import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { RoleBuilder } from './RoleBuilder';

const renderRoleBuilder = ({
    initialScopes = ['manage:Dashboard', 'view:Project'],
    mode = 'create',
}: {
    initialScopes?: string[];
    mode?: 'create' | 'edit';
} = {}) => {
    const onSubmit = vi.fn();

    renderWithProviders(
        <MemoryRouter>
            <RoleBuilder
                initialValues={{
                    name: 'Dashboard manager',
                    description: 'Manages dashboards',
                    level: 'project',
                    scopes: initialScopes,
                }}
                onSubmit={onSubmit}
                isWorking={false}
                mode={mode}
            />
        </MemoryRouter>,
    );

    return { onSubmit };
};

describe('RoleBuilder dependency status filters', () => {
    it('activates, switches, and clears a status without changing selections', async () => {
        const user = userEvent.setup();
        const { onSubmit } = renderRoleBuilder();
        const partialFilter = screen.getByRole('button', {
            name: 'Show 1 permissions with some dependencies selected',
        });
        const fullFilter = screen.getByRole('button', {
            name: 'Show 1 permissions with all dependencies selected',
        });

        await user.click(partialFilter);

        expect(partialFilter).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Manage Dashboard')).toBeInTheDocument();
        expect(screen.getByText('View Project')).not.toBeVisible();

        await user.type(
            screen.getByPlaceholderText(
                'Search permissions by name or group...',
            ),
            'View Project',
        );

        expect(
            await screen.findByText(
                'No permissions found matching your search.',
            ),
        ).toBeInTheDocument();

        await user.clear(
            screen.getByPlaceholderText(
                'Search permissions by name or group...',
            ),
        );
        expect(await screen.findByText('Manage Dashboard')).toBeInTheDocument();

        await user.click(fullFilter);

        expect(partialFilter).toHaveAttribute('aria-pressed', 'false');
        expect(fullFilter).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('View Project')).toBeInTheDocument();
        expect(screen.queryByText('Manage Dashboard')).not.toBeInTheDocument();

        await user.click(fullFilter);

        expect(fullFilter).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByText('Project Management')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Create role' }));

        expect(onSubmit).toHaveBeenCalledWith({
            name: 'Dashboard manager',
            description: 'Manages dashboards',
            level: 'project',
            scopes: ['manage:Dashboard', 'view:Project'],
        });
    });

    it('keeps the active status when the Role Type changes', async () => {
        const user = userEvent.setup();
        renderRoleBuilder();
        const partialFilter = screen.getByRole('button', {
            name: 'Show 1 permissions with some dependencies selected',
        });

        await user.click(partialFilter);
        await user.click(
            screen.getByRole('button', { name: /Organization role/ }),
        );

        expect(
            screen.getByRole('button', {
                name: /permissions with some dependencies selected/,
            }),
        ).toHaveAttribute('aria-pressed', 'true');
    });

    it('filters permissions with no selected dependencies', async () => {
        const user = userEvent.setup();
        renderRoleBuilder({ initialScopes: ['manage:Dashboard'] });
        const emptyFilter = screen.getByRole('button', {
            name: 'Show 1 permissions with no dependencies selected',
        });

        await user.click(emptyFilter);

        expect(emptyFilter).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Manage Dashboard')).toBeInTheDocument();
    });

    it('uses Role type wording in create and edit modes', () => {
        const { unmount } = renderWithProviders(
            <MemoryRouter>
                <RoleBuilder
                    initialValues={{
                        name: 'Dashboard manager',
                        description: 'Manages dashboards',
                        level: 'project',
                        scopes: ['view:Project'],
                    }}
                    onSubmit={vi.fn()}
                    isWorking={false}
                    mode="create"
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('Role type')).toBeInTheDocument();

        unmount();
        renderRoleBuilder({ mode: 'edit' });

        expect(
            screen.getByText("Role type can't be changed after creation."),
        ).toBeInTheDocument();
    });
});
