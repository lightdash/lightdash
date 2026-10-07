import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept } from '../utils/adoptionFixtures';
import { DepartmentForm } from './DepartmentDrawer';

const create = vi.fn();
const update = vi.fn();
const setOwners = vi.fn();
const setGroups = vi.fn();
const setMembers = vi.fn();
const remove = vi.fn();

const mutation = (mutateAsync: ReturnType<typeof vi.fn>) => ({
    mutateAsync,
    isLoading: false,
});

vi.mock('../../../hooks/useOrgDepartments', () => ({
    useCreateDepartment: () => mutation(create),
    useUpdateDepartment: () => mutation(update),
    useDeleteDepartment: () => mutation(remove),
    useSetDepartmentOwners: () => mutation(setOwners),
    useSetDepartmentGroups: () => mutation(setGroups),
    useSetDepartmentMembers: () => mutation(setMembers),
    useDepartmentMembership: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({ data: [] }),
}));
vi.mock('../../../../hooks/useOrganizationGroups', () => ({
    useOrganizationGroups: () => ({ data: [] }),
}));

const departments = [
    dept('Ops', null, 10, {
        headcount: 40,
        headcountNote: 'Store managers only',
    }),
    dept('Stores', 'Ops', 50),
    dept('Finance', null, 20),
];

describe('DepartmentForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        create.mockResolvedValue({ departmentUuid: 'new' });
        update.mockResolvedValue({ departmentUuid: 'Ops' });
    });

    it('requires a name before creating', async () => {
        renderWithProviders(
            <DepartmentForm
                department={null}
                departments={departments}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Create department' }),
        );
        expect(screen.getByText('Enter a name')).toBeInTheDocument();
        expect(create).not.toHaveBeenCalled();
    });

    it('creates with nulls for the fields left empty and closes', async () => {
        const onClose = vi.fn();
        renderWithProviders(
            <DepartmentForm
                department={null}
                departments={departments}
                onClose={onClose}
            />,
        );
        await userEvent.type(screen.getByLabelText(/^Name/), 'Supply chain');
        await userEvent.click(
            screen.getByRole('button', { name: 'Create department' }),
        );
        expect(create).toHaveBeenCalledWith({
            name: 'Supply chain',
            parentDepartmentUuid: null,
            headcount: null,
            headcountNote: null,
            targetActiveUsers: null,
            targetDate: null,
        });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(setOwners).not.toHaveBeenCalled();
    });

    it('prefills an existing department, including the headcount note', () => {
        renderWithProviders(
            <DepartmentForm
                department={departments[0]}
                departments={departments}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByLabelText(/^Name/)).toHaveValue('Ops');
        expect(screen.getByLabelText('Headcount note')).toHaveValue(
            'Store managers only',
        );
        expect(
            screen.getByRole('button', { name: 'Save changes' }),
        ).toBeInTheDocument();
    });

    it('keeps the drawer open when saving fails', async () => {
        update.mockRejectedValue(new Error('conflict'));
        const onClose = vi.fn();
        renderWithProviders(
            <DepartmentForm
                department={departments[0]}
                departments={departments}
                onClose={onClose}
            />,
        );
        await userEvent.type(screen.getByLabelText(/^Name/), ' team');
        await userEvent.click(
            screen.getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(onClose).not.toHaveBeenCalled();
    });

    it('sends only the changed fields when editing', async () => {
        const onClose = vi.fn();
        renderWithProviders(
            <DepartmentForm
                department={departments[0]}
                departments={departments}
                onClose={onClose}
            />,
        );
        await userEvent.type(screen.getByLabelText(/^Name/), ' team');
        await userEvent.clear(screen.getByLabelText('Headcount note'));
        await userEvent.click(
            screen.getByRole('button', { name: 'Save changes' }),
        );
        expect(update).toHaveBeenCalledWith({
            departmentUuid: 'Ops',
            data: { name: 'Ops team', headcountNote: null },
        });
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(setOwners).not.toHaveBeenCalled();
        expect(setGroups).not.toHaveBeenCalled();
        expect(setMembers).not.toHaveBeenCalled();
    });

    it('does not call update when nothing changed', async () => {
        const onClose = vi.fn();
        renderWithProviders(
            <DepartmentForm
                department={departments[0]}
                departments={departments}
                onClose={onClose}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(update).not.toHaveBeenCalled();
    });

    it('rejects a name over 255 characters', async () => {
        renderWithProviders(
            <DepartmentForm
                department={null}
                departments={departments}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(screen.getByLabelText(/^Name/));
        await userEvent.paste('a'.repeat(256));
        await userEvent.click(
            screen.getByRole('button', { name: 'Create department' }),
        );
        expect(
            screen.getByText('Keep the name to 255 characters or fewer'),
        ).toBeInTheDocument();
        expect(create).not.toHaveBeenCalled();
    });

    it('asks before deleting and says sub-departments move up', async () => {
        const onClose = vi.fn();
        remove.mockResolvedValue(null);
        renderWithProviders(
            <DepartmentForm
                department={departments[0]}
                departments={departments}
                onClose={onClose}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Delete department' }),
        );
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('Delete Ops');
        expect(dialog).toHaveTextContent(
            'Its sub-departments move up one level',
        );
        expect(remove).not.toHaveBeenCalled();
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Delete department' }),
        );
        expect(remove).toHaveBeenCalledWith('Ops');
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('leaves out the sub-department note when there are none', async () => {
        renderWithProviders(
            <DepartmentForm
                department={departments[2]}
                departments={departments}
                onClose={vi.fn()}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Delete department' }),
        );
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toHaveTextContent('Delete Finance');
        expect(dialog).not.toHaveTextContent('sub-departments');
    });
});
