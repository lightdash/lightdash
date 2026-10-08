import {
    OrganizationMemberRole,
    type DepartmentMembership,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, memberFixture } from '../utils/adoptionFixtures';
import { DepartmentForm } from './DepartmentDrawer';

const create = vi.fn();
const update = vi.fn();
const setOwners = vi.fn();
const setGroups = vi.fn();
const setMembers = vi.fn();
const remove = vi.fn();
let removing = false;
const membershipEnabled = vi.fn();
let membership: DepartmentMembership[] = [];

const mutation = (mutateAsync: ReturnType<typeof vi.fn>) => ({
    mutateAsync,
    isLoading: false,
});

vi.mock('../../../hooks/useOrgDepartments', () => ({
    useCreateDepartment: () => mutation(create),
    useUpdateDepartment: () => mutation(update),
    useDeleteDepartment: () => ({ mutateAsync: remove, isLoading: removing }),
    useSetDepartmentOwners: () => mutation(setOwners),
    useSetDepartmentGroups: () => mutation(setGroups),
    useSetDepartmentMembers: () => mutation(setMembers),
    useDepartmentMembership: (enabled: boolean) => {
        membershipEnabled(enabled);
        return { data: membership };
    },
}));
const person = (userUuid: string, firstName: string) => ({
    userUuid,
    firstName,
    lastName: 'Test',
    email: `${userUuid}@example.com`,
});
let users = [person('u1', 'Ann'), person('u2', 'Bob')];
const groups = [
    { uuid: 'g1', name: 'Analysts' },
    { uuid: 'g2', name: 'Buyers' },
];
vi.mock('../../../../hooks/useOrganizationUsers', () => ({
    useOrganizationUsers: () => ({ data: users }),
}));
vi.mock('../../../../hooks/useOrganizationGroups', () => ({
    useOrganizationGroups: () => ({ data: groups }),
}));

const departments = [
    dept('Ops', null, 10, {
        headcount: 40,
        headcountNote: 'Store managers only',
    }),
    dept('Stores', 'Ops', 50),
    dept('Finance', null, 20),
];

const pick = async (label: RegExp | string, option: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: label }));
    await userEvent.click(await screen.findByRole('option', { name: option }));
};
// Mantine hides its clear button from assistive tech, so find it by its class
const clear = async (label: RegExp | string) => {
    const field = screen
        .getByRole('combobox', { name: label })
        .closest('.mantine-InputWrapper-root');
    const button = field?.querySelector('.mantine-InputClearButton-root');
    if (!button) throw new Error(`No clear button for ${String(label)}`);
    await userEvent.click(button);
};
const save = () =>
    userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
const renderEdit = (department: ReturnType<typeof dept>, onClose = vi.fn()) =>
    renderWithProviders(
        <DepartmentForm
            department={department}
            departments={departments}
            members={null}
            onClose={onClose}
        />,
    );

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
                members={null}
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
                members={null}
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

    it('sends the name as the server stores it and the note on one line', async () => {
        renderWithProviders(
            <DepartmentForm
                department={null}
                departments={departments}
                members={null}
                onClose={vi.fn()}
            />,
        );
        await userEvent.type(
            screen.getByLabelText(/^Name/),
            '  Supply   chain ',
        );
        await userEvent.type(
            screen.getByLabelText('Headcount note'),
            'Store managers{enter}and buyers',
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Create department' }),
        );
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Supply chain',
                headcountNote: 'Store managers and buyers',
            }),
        );
    });

    it('prefills an existing department, including the headcount note', () => {
        renderWithProviders(
            <DepartmentForm
                department={departments[0]}
                departments={departments}
                members={null}
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
                members={null}
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
                members={null}
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
                members={null}
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
                members={null}
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
                members={null}
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

    const openConfirm = async (onClose: () => void) => {
        renderWithProviders(
            <DepartmentForm
                department={departments[0]}
                departments={departments}
                members={null}
                onClose={onClose}
            />,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Delete department' }),
        );
        return screen.findByRole('dialog');
    };

    it('keeps the drawer open and the confirm button busy while a delete is in flight', async () => {
        removing = true;
        const onClose = vi.fn();
        remove.mockReturnValue(new Promise(() => {}));
        const dialog = await openConfirm(onClose);
        const confirm = within(dialog).getByRole('button', {
            name: 'Delete department',
        });
        expect(confirm).toBeDisabled();
        await userEvent.click(confirm);
        expect(remove).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('stays in the confirmation when the delete fails, so the user can retry', async () => {
        removing = false;
        const onClose = vi.fn();
        remove.mockRejectedValueOnce(new Error('nope'));
        const dialog = await openConfirm(onClose);
        const confirm = within(dialog).getByRole('button', {
            name: 'Delete department',
        });
        await userEvent.click(confirm);
        await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(confirm).toBeEnabled();
        remove.mockResolvedValueOnce(null);
        await userEvent.click(confirm);
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('closes only after the delete succeeds', async () => {
        removing = false;
        let resolve: (value: null) => void = () => {};
        remove.mockReturnValueOnce(
            new Promise<null>((r) => {
                resolve = r;
            }),
        );
        const onClose = vi.fn();
        const dialog = await openConfirm(onClose);
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Delete department' }),
        );
        expect(onClose).not.toHaveBeenCalled();
        resolve(null);
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it('leaves out the sub-department note when there are none', async () => {
        renderWithProviders(
            <DepartmentForm
                department={departments[2]}
                departments={departments}
                members={null}
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

    it('diffs against the values it loaded, not a refetched prop', async () => {
        const { rerender } = renderEdit(departments[0]);
        rerender(
            <DepartmentForm
                department={{ ...departments[0], headcount: 99 }}
                departments={departments}
                members={null}
                onClose={vi.fn()}
            />,
        );
        await save();
        expect(update).not.toHaveBeenCalled();
    });

    it('sends no request at all when an existing department is saved untouched', async () => {
        const onClose = vi.fn();
        renderEdit(departments[0], onClose);
        await save();
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        [create, update, setOwners, setGroups, setMembers, remove].forEach(
            (mock) => expect(mock).not.toHaveBeenCalled(),
        );
    });

    it('does not create twice when a follow-up save fails, and retries it', async () => {
        setOwners.mockRejectedValueOnce(new Error('boom'));
        setOwners.mockResolvedValue({});
        const onClose = vi.fn();
        const onCreated = vi.fn();
        renderWithProviders(
            <DepartmentForm
                department={null}
                departments={departments}
                members={null}
                onClose={onClose}
                onCreated={onCreated}
            />,
        );
        await userEvent.type(screen.getByLabelText(/^Name/), 'Supply chain');
        await pick(/^Owners/, 'Ann Test');
        await userEvent.click(
            screen.getByRole('button', { name: 'Create department' }),
        );
        await waitFor(() => expect(setOwners).toHaveBeenCalledTimes(1));
        expect(onClose).not.toHaveBeenCalled();
        expect(onCreated).toHaveBeenCalledWith('Supply chain');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Save changes' }),
        );
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(create).toHaveBeenCalledTimes(1);
        expect(update).not.toHaveBeenCalled();
        expect(setOwners).toHaveBeenCalledTimes(2);
        expect(setOwners).toHaveBeenLastCalledWith({
            departmentUuid: 'new',
            owners: [{ type: 'user', uuid: 'u1' }],
        });
    });

    it('saves owners in the order they were chosen, users and groups mixed', async () => {
        renderEdit(departments[2]);
        await pick(/^Owners/, 'Buyers');
        await pick(/^Owners/, 'Ann Test');
        await pick(/^Owners/, 'Analysts');
        await save();
        await waitFor(() => expect(setOwners).toHaveBeenCalled());
        expect(setOwners).toHaveBeenCalledWith({
            departmentUuid: 'Finance',
            owners: [
                { type: 'group', uuid: 'g2' },
                { type: 'user', uuid: 'u1' },
                { type: 'group', uuid: 'g1' },
            ],
        });
        expect(update).not.toHaveBeenCalled();
    });

    it('appends an owner after the existing ones and clears them to an empty list', async () => {
        const withOwner = dept('Ops', null, 10, {
            headcount: 40,
            owners: [{ type: 'user', uuid: 'u1', name: 'Ann Test' }],
        });
        const { unmount } = renderEdit(withOwner);
        await pick(/^Owners/, 'Bob Test');
        await save();
        await waitFor(() => expect(setOwners).toHaveBeenCalled());
        expect(setOwners).toHaveBeenLastCalledWith({
            departmentUuid: 'Ops',
            owners: [
                { type: 'user', uuid: 'u1' },
                { type: 'user', uuid: 'u2' },
            ],
        });
        unmount();

        renderEdit(withOwner);
        await clear(/^Owners/);
        await save();
        await waitFor(() => expect(setOwners).toHaveBeenCalledTimes(2));
        expect(setOwners).toHaveBeenLastCalledWith({
            departmentUuid: 'Ops',
            owners: [],
        });
    });

    it('saves linked groups and assigned people on change and on clear', async () => {
        const linked = dept('Ops', null, 10, {
            headcount: 40,
            linkedGroups: [{ groupUuid: 'g1', name: 'Analysts' }],
            explicitMemberUuids: ['u1'],
        });
        const { unmount } = renderEdit(linked);
        await pick(/^Linked groups/, 'Buyers');
        await pick(/^Assigned people/, 'Bob Test');
        await save();
        await waitFor(() => expect(setMembers).toHaveBeenCalled());
        expect(setGroups).toHaveBeenCalledWith({
            departmentUuid: 'Ops',
            groupUuids: ['g1', 'g2'],
        });
        expect(setMembers).toHaveBeenCalledWith({
            departmentUuid: 'Ops',
            userUuids: ['u1', 'u2'],
        });
        expect(setOwners).not.toHaveBeenCalled();
        unmount();

        renderEdit(linked);
        await clear(/^Linked groups/);
        await clear(/^Assigned people/);
        await save();
        await waitFor(() => expect(setMembers).toHaveBeenCalledTimes(2));
        expect(setGroups).toHaveBeenLastCalledWith({
            departmentUuid: 'Ops',
            groupUuids: [],
        });
        expect(setMembers).toHaveBeenLastCalledWith({
            departmentUuid: 'Ops',
            userUuids: [],
        });
    });

    it('sends null for exactly the fields that were cleared', async () => {
        const full = dept('Ops', 'Finance', 10, {
            headcount: 40,
            headcountNote: 'Managers',
            targetActiveUsers: 30,
            targetDate: '2026-12-01',
        });
        renderEdit(full);
        await clear(/^Parent department/);
        await userEvent.clear(screen.getByLabelText('Headcount'));
        await userEvent.clear(screen.getByLabelText('Headcount note'));
        await userEvent.clear(screen.getByLabelText('Target date'));
        await save();
        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(update).toHaveBeenCalledWith({
            departmentUuid: 'Ops',
            data: {
                parentDepartmentUuid: null,
                headcount: null,
                headcountNote: null,
                targetDate: null,
            },
        });
    });

    describe('at scale', () => {
        beforeEach(() => {
            membershipEnabled.mockReset();
            membership = [];
        });

        it('uses the people the department page already loaded instead of fetching everyone', () => {
            const loaded = Array.from({ length: 60 }, (_, index) =>
                memberFixture(`m${index}`, null, {
                    firstName: `Member${index}`,
                    isDirect: index !== 0,
                    departmentName: index === 0 ? 'Stores' : 'Ops',
                }),
            );
            renderWithProviders(
                <DepartmentForm
                    department={departments[0]}
                    departments={departments}
                    members={loaded}
                    onClose={vi.fn()}
                />,
            );
            expect(membershipEnabled).toHaveBeenCalledWith(false);
            expect(membershipEnabled).not.toHaveBeenCalledWith(true);
            expect(
                screen.getByText('60 people in this department'),
            ).toBeInTheDocument();
            expect(screen.getByText('Member0 L')).toBeInTheDocument();
            expect(screen.getByText('Via Stores')).toBeInTheDocument();
            expect(screen.getByText('Member49 L')).toBeInTheDocument();
            expect(screen.queryByText('Member50 L')).not.toBeInTheDocument();
            expect(
                screen.getByText(
                    'Showing 50 of 60, everyone is listed under People on this page',
                ),
            ).toBeInTheDocument();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
        });

        it('shows the first 50 resolved people with a link to the department page for the rest', () => {
            membership = Array.from({ length: 60 }, (_, index) => ({
                ...person(`m${index}`, `Member${index}`),
                role: OrganizationMemberRole.VIEWER,
                resolution: {
                    kind: 'assigned' as const,
                    departmentUuid: 'Ops',
                    source: 'explicit' as const,
                    sourceGroupName: null,
                },
            }));
            renderWithProviders(
                <MemoryRouter>
                    <DepartmentForm
                        department={departments[0]}
                        departments={departments}
                        members={null}
                        onClose={vi.fn()}
                    />
                </MemoryRouter>,
            );
            expect(membershipEnabled).toHaveBeenCalledWith(true);
            expect(screen.getByText('Member49 Test')).toBeInTheDocument();
            expect(screen.queryByText('Member50 Test')).not.toBeInTheDocument();
            expect(
                screen.getByRole('link', {
                    name: 'Showing 50 of 60, see everyone on the department page',
                }),
            ).toHaveAttribute('href', '/generalSettings/adoption/Ops');
        });

        it('offers 50 people at a time in the pickers and finds the rest by search', async () => {
            const few = users;
            users = Array.from({ length: 60 }, (_, index) =>
                person(`p${index}`, `Person${String(index).padStart(2, '0')}`),
            );
            try {
                renderEdit(departments[0]);
                const picker = screen.getByRole('combobox', {
                    name: /Assigned people/,
                });
                await userEvent.click(picker);
                expect(await screen.findAllByRole('option')).toHaveLength(50);
                expect(
                    screen.queryByRole('option', { name: 'Person59 Test' }),
                ).not.toBeInTheDocument();
                await userEvent.type(picker, 'Person59');
                expect(
                    await screen.findByRole('option', {
                        name: 'Person59 Test',
                    }),
                ).toBeInTheDocument();
            } finally {
                users = few;
            }
        });
    });
});
