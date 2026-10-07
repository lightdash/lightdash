import { OrganizationMemberRole } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept } from '../utils/adoptionFixtures';
import { MembershipModal } from './MembershipModal';

const mutate = vi.fn();

const person = (userUuid: string, firstName: string) => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName,
    lastName: 'Test',
    role: OrganizationMemberRole.VIEWER,
    resolution: { kind: 'unassigned' as const },
});
const membership = [
    person('u1', 'Ann'),
    person('u2', 'Bob'),
    {
        ...person('u3', 'Cat'),
        resolution: {
            kind: 'conflict' as const,
            departmentUuids: ['Ops', 'Finance'],
        },
    },
    {
        ...person('u4', 'Dan'),
        resolution: {
            kind: 'assigned' as const,
            departmentUuid: 'Ops',
            source: 'explicit' as const,
            sourceGroupName: null,
        },
    },
];

let isPlacing = false;
vi.mock('../../../hooks/useOrgDepartments', () => ({
    useDepartmentMembership: () => ({
        data: membership,
        isInitialLoading: false,
    }),
    useSetDepartmentMembers: () => ({ mutate, isLoading: isPlacing }),
}));

const departments = [
    dept('Ops', null, 10, { explicitMemberUuids: ['u9'] }),
    dept('Finance', null, 20),
];

const place = async (label: string, option: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: label }));
    await userEvent.click(await screen.findByRole('option', { name: option }));
};

describe('MembershipModal', () => {
    beforeEach(() => {
        mutate.mockReset();
        isPlacing = false;
    });

    const renderModal = () =>
        renderWithProviders(
            <MembershipModal
                opened
                onClose={vi.fn()}
                departments={departments}
            />,
        );

    it('lists only people who need a department, each with a labelled select', () => {
        renderModal();
        expect(
            screen.getByRole('combobox', { name: 'Department for Ann Test' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('combobox', { name: 'Department for Cat Test' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('combobox', { name: /Dan/ }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('In Finance and Ops')).toBeInTheDocument();
    });

    it('sends the department existing explicit members plus the placed person', async () => {
        renderModal();
        await place('Department for Ann Test', 'Ops');
        expect(mutate).toHaveBeenCalledWith({
            departmentUuid: 'Ops',
            userUuids: ['u9', 'u1'],
        });
    });

    it('keeps an earlier placement when a second person goes to the same department', async () => {
        const { rerender } = renderModal();
        await place('Department for Ann Test', 'Ops');
        // Fresh data after the first placement now holds both explicit members
        rerender(
            <MembershipModal
                opened
                onClose={vi.fn()}
                departments={[
                    { ...departments[0], explicitMemberUuids: ['u9', 'u1'] },
                    departments[1],
                ]}
            />,
        );
        await place('Department for Bob Test', 'Ops');
        expect(mutate).toHaveBeenLastCalledWith({
            departmentUuid: 'Ops',
            userUuids: ['u9', 'u1', 'u2'],
        });
    });

    it('disables every select while a placement is saving', () => {
        isPlacing = true;
        renderModal();
        const selects = screen.getAllByRole('combobox');
        expect(selects).toHaveLength(3);
        selects.forEach((select) => expect(select).toBeDisabled());
    });

    it('tells apart two people with the same name by email', () => {
        membership.push({
            ...person('u5', 'Ann'),
            email: 'ann.other@example.com',
        });
        renderModal();
        membership.pop();
        expect(
            screen.getByRole('combobox', {
                name: 'Department for Ann Test (u1@example.com)',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('combobox', {
                name: 'Department for Ann Test (ann.other@example.com)',
            }),
        ).toBeInTheDocument();
    });
});
