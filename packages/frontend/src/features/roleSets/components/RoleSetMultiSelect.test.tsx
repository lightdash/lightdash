import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { RoleSetMultiSelect } from './RoleSetMultiSelect';

const systemRoles = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'editor', label: 'Editor' },
];
const customRoles = [
    { value: 'role-a', label: 'Roadmap viewer' },
    { value: 'role-b', label: 'SQL runner' },
];

describe('RoleSetMultiSelect', () => {
    it('renders the current set as pills', () => {
        renderWithProviders(
            <RoleSetMultiSelect
                systemRoles={systemRoles}
                customRoles={customRoles}
                ariaLabel="Roles"
                value={{ systemRole: 'viewer', customRoleUuids: ['role-a'] }}
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByText('Viewer')).toBeInTheDocument();
        expect(screen.getByText('Roadmap viewer')).toBeInTheDocument();
    });

    it('selecting a system role replaces the existing system role', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <RoleSetMultiSelect
                systemRoles={systemRoles}
                customRoles={customRoles}
                ariaLabel="Roles"
                value={{ systemRole: 'viewer', customRoleUuids: ['role-a'] }}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('textbox', { name: 'Roles' }));
        await userEvent.click(
            await screen.findByRole('option', { name: 'Editor' }),
        );
        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({
                systemRole: 'editor',
                customRoleUuids: ['role-a'],
            }),
        );
    });

    it('selecting a custom role adds it on top', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <RoleSetMultiSelect
                systemRoles={systemRoles}
                customRoles={customRoles}
                ariaLabel="Roles"
                value={{ systemRole: 'viewer', customRoleUuids: ['role-a'] }}
                onChange={onChange}
            />,
        );
        await userEvent.click(screen.getByRole('textbox', { name: 'Roles' }));
        await userEvent.click(
            await screen.findByRole('option', { name: 'SQL runner' }),
        );
        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({
                systemRole: 'viewer',
                customRoleUuids: ['role-a', 'role-b'],
            }),
        );
    });

    it('does not emit an empty set when the last role is removed', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <RoleSetMultiSelect
                systemRoles={systemRoles}
                customRoles={customRoles}
                ariaLabel="Roles"
                value={{ systemRole: null, customRoleUuids: ['role-a'] }}
                onChange={onChange}
            />,
        );
        const pill = screen
            .getByText('Roadmap viewer')
            .closest('.mantine-Pill-root');
        await userEvent.click(pill!.querySelector('button')!);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('removing one of several roles keeps the rest', async () => {
        const onChange = vi.fn();
        renderWithProviders(
            <RoleSetMultiSelect
                systemRoles={systemRoles}
                customRoles={customRoles}
                ariaLabel="Roles"
                value={{ systemRole: 'viewer', customRoleUuids: ['role-a'] }}
                onChange={onChange}
            />,
        );
        const pill = screen.getByText('Viewer').closest('.mantine-Pill-root');
        await userEvent.click(pill!.querySelector('button')!);
        await waitFor(() =>
            expect(onChange).toHaveBeenCalledWith({
                systemRole: null,
                customRoleUuids: ['role-a'],
            }),
        );
    });
});
