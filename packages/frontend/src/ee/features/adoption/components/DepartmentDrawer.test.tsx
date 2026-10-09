import {
    OrganizationMemberRole,
    type DepartmentMembership,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, memberFixture, metricsFixture } from '../utils/adoptionFixtures';
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
    // Like the real query: nothing until it is enabled
    useDepartmentMembership: (enabled: boolean) => {
        membershipEnabled(enabled);
        return { data: enabled ? membership : undefined };
    },
}));
const person = (userUuid: string, firstName: string) => ({
    userUuid,
    firstName,
    lastName: 'Test',
    email: `${userUuid}@example.com`,
    isActive: true,
    isPending: false,
});
// Someone on Lightdash placed in the departments given, counted in each
const placedIn = (
    userUuid: string,
    firstName: string,
    departmentUuids: string[],
): DepartmentMembership => ({
    ...person(userUuid, firstName),
    role: OrganizationMemberRole.VIEWER,
    kind:
        departmentUuids.length === 0
            ? 'unassigned'
            : departmentUuids.length === 1
              ? 'assigned'
              : 'shared',
    placements: departmentUuids.map((departmentUuid) => ({
        departmentUuid,
        source: 'explicit',
        sourceGroupName: null,
    })),
    primaryDepartmentUuid: null,
    countedDepartmentUuids: departmentUuids,
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
// The chips a picker shows for the values chosen, as read aloud
const chipsOf = (label: RegExp | string) =>
    Array.from(
        screen
            .getByRole('combobox', { name: label })
            .closest('.mantine-InputWrapper-root')
            ?.querySelectorAll('.mantine-Pill-root') ?? [],
        (chip) => chip.textContent,
    );
const renderEdit = (department: ReturnType<typeof dept>, onClose = vi.fn()) =>
    renderWithProviders(
        <DepartmentForm
            department={department}
            departments={departments}
            members={null}
            onClose={onClose}
        />,
    );

// The form's tests type into several fields, which is slow on a busy machine, so these get 20 s each
describe('DepartmentForm', { timeout: 20_000 }, () => {
    beforeEach(() => {
        vi.clearAllMocks();
        membership = [];
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

    it('says a department without sub-departments counts at least its people on Lightdash, and accepts any number', async () => {
        const busy = dept('Finance', null, null, {
            headcount: 4,
            effectiveHeadcount: 12,
            metrics: metricsFixture(12, 100),
            directMetrics: metricsFixture(12, 100),
        });
        renderEdit(busy);
        expect(
            screen.getByText(
                'How many people work in this department. Leave empty to add up its sub-departments. At least 12, the people already on Lightdash',
            ),
        ).toBeInTheDocument();
        // A lower number is still sent as typed; the server counts the people on Lightdash
        await userEvent.clear(screen.getByLabelText('Headcount'));
        await userEvent.type(screen.getByLabelText('Headcount'), '6');
        await save();
        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(update).toHaveBeenCalledWith({
            departmentUuid: 'Finance',
            data: { headcount: 6 },
        });
    });
    it('says a department with sub-departments counts at least them and its own people on Lightdash', () => {
        // Stores counts 10, and 2 people sit directly in Ops
        renderEdit(
            dept('Ops', null, null, {
                headcount: 5,
                effectiveHeadcount: 12,
                metrics: metricsFixture(7, null),
                directMetrics: metricsFixture(2, null),
            }),
        );
        expect(
            screen.getByText(
                'How many people work in this department. Leave empty to add up its sub-departments. At least 12: its sub-departments and the people already on Lightdash',
            ),
        ).toBeInTheDocument();
    });
    it('gives no minimum for a new department', () => {
        renderWithProviders(
            <DepartmentForm
                department={null}
                departments={departments}
                members={null}
                onClose={vi.fn()}
            />,
        );
        expect(
            screen.getByText(
                'How many people work in this department. Leave empty to add up its sub-departments',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/At least/)).toBeNull();
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

    describe('people in other departments', () => {
        beforeEach(() => {
            membershipEnabled.mockReset();
            membership = [];
        });

        it('offers people already in another department and says so on their chip', async () => {
            // Ann is assigned here and in Finance; her Ops assignment gave way to Stores, below it
            membership = [
                placedIn('u1', 'Ann', ['Finance', 'Stores']),
                placedIn('u2', 'Bob', ['Finance']),
            ];
            renderEdit(
                dept('Ops', null, 10, {
                    headcount: 40,
                    explicitMemberUuids: ['u1'],
                }),
            );
            expect(
                screen.getByText(
                    'Assigning someone here keeps them in any other department they are in',
                ),
            ).toBeInTheDocument();
            expect(chipsOf(/^Assigned people/)).toEqual([
                'Ann Test, also in Finance',
            ]);
            await pick(/^Assigned people/, 'Bob Test');
            expect(chipsOf(/^Assigned people/)).toEqual([
                'Ann Test, also in Finance',
                'Bob Test, also in Finance',
            ]);
            await save();
            await waitFor(() => expect(setMembers).toHaveBeenCalled());
            expect(setMembers).toHaveBeenCalledWith({
                departmentUuid: 'Ops',
                userUuids: ['u1', 'u2'],
            });
        });

        it('says nothing on the chip of someone in no other department', async () => {
            membership = [placedIn('u2', 'Bob', [])];
            renderEdit(departments[2]);
            await pick(/^Assigned people/, 'Bob Test');
            expect(chipsOf(/^Assigned people/)).toEqual(['Bob Test']);
        });

        it('on a new department, loads everyone once the picker opens and names every department a chosen person is in', async () => {
            membership = [placedIn('u2', 'Bob', ['Finance', 'Stores'])];
            renderWithProviders(
                <DepartmentForm
                    department={null}
                    departments={departments}
                    members={null}
                    onClose={vi.fn()}
                />,
            );
            expect(membershipEnabled).toHaveBeenCalledWith(false);
            expect(membershipEnabled).not.toHaveBeenCalledWith(true);
            await pick(/^Assigned people/, 'Bob Test');
            expect(membershipEnabled).toHaveBeenLastCalledWith(true);
            expect(chipsOf(/^Assigned people/)).toEqual([
                'Bob Test, also in Finance, Stores',
            ]);
            // Under Stores, Bob's place in Stores is part of the new department's line
            await pick(/^Parent department/, 'Ops / Stores');
            expect(chipsOf(/^Assigned people/)).toEqual([
                'Bob Test, also in Finance',
            ]);
        });

        it('for the selected department, reads chips from its people and loads everyone only once the picker opens', async () => {
            membership = [
                placedIn('u1', 'Ann', ['Finance', 'Ops']),
                placedIn('u2', 'Bob', ['Finance']),
            ];
            renderWithProviders(
                <DepartmentForm
                    department={dept('Ops', null, 10, {
                        headcount: 40,
                        explicitMemberUuids: ['u1'],
                    })}
                    departments={departments}
                    members={[
                        memberFixture('u1', null, {
                            firstName: 'Ann',
                            lastName: 'Test',
                            departmentUuid: 'Ops',
                            departmentName: 'Ops',
                            sharedWith: [
                                { departmentUuid: 'Finance', name: 'Finance' },
                            ],
                        }),
                    ]}
                    onClose={vi.fn()}
                />,
            );
            expect(membershipEnabled).not.toHaveBeenCalledWith(true);
            expect(chipsOf(/^Assigned people/)).toEqual([
                'Ann Test, also in Finance',
            ]);
            await pick(/^Assigned people/, 'Bob Test');
            expect(membershipEnabled).toHaveBeenLastCalledWith(true);
            expect(chipsOf(/^Assigned people/)).toEqual([
                'Ann Test, also in Finance',
                'Bob Test, also in Finance',
            ]);
        });

        it('for the selected department, loads everyone at once when an assigned person counts elsewhere', () => {
            // Bob is assigned here but counts in Finance, so the page's people leave him out
            membership = [
                placedIn('u1', 'Ann', ['Ops']),
                {
                    ...placedIn('u2', 'Bob', ['Finance', 'Ops']),
                    primaryDepartmentUuid: 'Finance',
                    countedDepartmentUuids: ['Finance'],
                },
            ];
            renderWithProviders(
                <DepartmentForm
                    department={dept('Ops', null, 10, {
                        headcount: 40,
                        explicitMemberUuids: ['u1', 'u2'],
                    })}
                    departments={departments}
                    members={[
                        memberFixture('u1', null, {
                            firstName: 'Ann',
                            lastName: 'Test',
                            departmentUuid: 'Ops',
                            departmentName: 'Ops',
                        }),
                    ]}
                    onClose={vi.fn()}
                />,
            );
            expect(membershipEnabled).toHaveBeenLastCalledWith(true);
            expect(chipsOf(/^Assigned people/)).toEqual([
                'Ann Test',
                'Bob Test, also in Finance',
            ]);
            // The list of people is still the page's own
            expect(
                screen.getByText('1 person in this department'),
            ).toBeInTheDocument();
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
        await save();
        await waitFor(() => expect(update).toHaveBeenCalled());
        expect(update).toHaveBeenCalledWith({
            departmentUuid: 'Ops',
            data: {
                parentDepartmentUuid: null,
                headcount: null,
                headcountNote: null,
            },
        });
    });

    it('has no target fields, and an edit leaves the targets already set alone', async () => {
        const aiming = dept('Ops', null, 10, {
            headcount: 40,
            targetActiveUsers: 30,
            targetDate: '2026-12-01',
        });
        renderEdit(aiming);
        expect(screen.queryByLabelText(/target/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/target/i)).not.toBeInTheDocument();
        await userEvent.type(screen.getByLabelText(/^Name/), ' team');
        await save();
        await waitFor(() => expect(update).toHaveBeenCalled());
        // Only the name is sent, so the server keeps the target
        expect(update).toHaveBeenCalledWith({
            departmentUuid: 'Ops',
            data: { name: 'Ops team' },
        });
    });

    describe('at scale', () => {
        beforeEach(() => {
            membershipEnabled.mockReset();
            membership = [];
        });

        it('uses the people the selected department already loaded instead of fetching everyone', () => {
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

        it('groups thousands in the count of people in the department', () => {
            const loaded = Array.from({ length: 1200 }, (_, index) =>
                memberFixture(`m${index}`, null, {
                    firstName: `Member${index}`,
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
            expect(
                screen.getByText('1,200 people in this department'),
            ).toBeInTheDocument();
            expect(
                screen.getByText(
                    'Showing 50 of 1,200, everyone is listed under People on this page',
                ),
            ).toBeInTheDocument();
        });

        it('counts one person in the singular', () => {
            renderWithProviders(
                <DepartmentForm
                    department={departments[0]}
                    departments={departments}
                    members={[memberFixture('m0', null)]}
                    onClose={vi.fn()}
                />,
            );
            expect(
                screen.getByText('1 person in this department'),
            ).toBeInTheDocument();
        });

        it('shows the first 50 resolved people with a link that selects the department, keeping the view, for the rest', async () => {
            membership = Array.from({ length: 60 }, (_, index) =>
                placedIn(`m${index}`, `Member${index}`, ['Ops']),
            );
            const onClose = vi.fn();
            renderWithProviders(
                <MemoryRouter
                    initialEntries={['/generalSettings/adoption?view=list']}
                >
                    <DepartmentForm
                        department={departments[0]}
                        departments={departments}
                        members={null}
                        onClose={onClose}
                    />
                </MemoryRouter>,
            );
            expect(membershipEnabled).toHaveBeenCalledWith(true);
            expect(screen.getByText('Member49 Test')).toBeInTheDocument();
            expect(screen.queryByText('Member50 Test')).not.toBeInTheDocument();
            const link = screen.getByRole('link', {
                name: 'Showing 50 of 60, see everyone in the department',
            });
            expect(link).toHaveAttribute(
                'href',
                '/generalSettings/adoption?view=list&department=Ops',
            );
            // Following it closes the drawer, so the department's people show
            await userEvent.click(link);
            expect(onClose).toHaveBeenCalled();
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
