import {
    OrganizationMemberRole,
    type DepartmentMembership,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept } from '../utils/adoptionFixtures';
import { MembershipModal } from './MembershipModal';

// Succeeds at once, as the real hook does once the request returns
const mutate = vi.fn(
    (_variables: unknown, options?: { onSuccess?: () => void }) =>
        options?.onSuccess?.(),
);

const person = (userUuid: string, firstName: string): DepartmentMembership => ({
    userUuid,
    email: `${userUuid}@example.com`,
    firstName,
    lastName: 'Test',
    role: OrganizationMemberRole.VIEWER,
    resolution: { kind: 'unassigned' },
});
const membership: DepartmentMembership[] = [
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
    dept('Ops', null, 10, {
        explicitMemberUuids: ['u9'],
        linkedGroups: [{ groupUuid: 'g1', name: 'ops-team' }],
    }),
    dept('Finance', null, 20, {
        linkedGroups: [
            { groupUuid: 'g2', name: 'finance-leads' },
            { groupUuid: 'g3', name: 'finance-all' },
        ],
    }),
];

const perPersonSelects = () =>
    screen.getAllByRole('combobox', { name: /^Department for / });

const placedSoFar = () => mutate.mock.calls.map(([variables]) => variables);

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
        expect(screen.getByText('In more than one department')).toBeVisible();
        expect(screen.getAllByText('No department')).toHaveLength(2);
    });

    it('names the groups that put a person in more than one department', () => {
        renderModal();
        expect(
            screen.getByText('Finance through finance-all or finance-leads'),
        ).toBeVisible();
        expect(screen.getByText('Ops through ops-team')).toBeVisible();
    });

    it('places everyone selected in one request for the department chosen', async () => {
        renderModal();
        const bulk = screen.getByRole('combobox', {
            name: 'Place selected in',
        });
        expect(bulk).toBeDisabled();
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        );
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Select Cat Test' }),
        );
        expect(screen.getByText('2 selected')).toBeVisible();
        await place('Place selected in', 'Ops');
        expect(placedSoFar()).toEqual([
            { departmentUuid: 'Ops', userUuids: ['u9', 'u3', 'u1'] },
        ]);
        // The selection clears once they are placed, so the next choice starts afresh
        expect(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        ).not.toBeChecked();
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Select Bob Test' }),
        );
        await place('Place selected in', 'Finance');
        expect(placedSoFar()).toEqual([
            { departmentUuid: 'Ops', userUuids: ['u9', 'u3', 'u1'] },
            { departmentUuid: 'Finance', userUuids: ['u2'] },
        ]);
    });

    it('announces the number selected to screen readers as it changes', async () => {
        renderModal();
        // The live region is in place before the first change, so that change is announced
        const count = screen.getByRole('status');
        expect(count).toHaveAttribute('aria-live', 'polite');
        expect(count).toBeEmptyDOMElement();
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        );
        expect(count).toHaveTextContent('1 selected');
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Select Cat Test' }),
        );
        expect(count).toHaveTextContent('2 selected');
    });

    it('keeps the selection when a save fails', async () => {
        // The request fails: the hook shows the error and the per-call success never runs
        mutate.mockImplementationOnce(() => undefined);
        renderModal();
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        );
        await place('Place selected in', 'Ops');
        expect(placedSoFar()).toHaveLength(1);
        expect(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        ).toBeChecked();
        expect(screen.getByText('1 selected')).toBeVisible();
    });

    it('clears the selection when closed', async () => {
        const onClose = vi.fn();
        renderWithProviders(
            <MembershipModal
                opened
                onClose={onClose}
                departments={departments}
            />,
        );
        await userEvent.click(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        ).not.toBeChecked();
        expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    });

    it('selects and clears everyone shown at once', async () => {
        renderModal();
        const all = screen.getByRole('checkbox', { name: 'Select all shown' });
        await userEvent.click(all);
        ['Ann Test', 'Bob Test', 'Cat Test'].forEach((name) =>
            expect(
                screen.getByRole('checkbox', { name: `Select ${name}` }),
            ).toBeChecked(),
        );
        expect(screen.getByText('3 selected')).toBeVisible();
        await userEvent.click(all);
        expect(
            screen.getByRole('checkbox', { name: 'Select Ann Test' }),
        ).not.toBeChecked();
        expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
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
        expect(perPersonSelects()).toHaveLength(3);
        const selects = screen.getAllByRole('combobox');
        expect(selects).toHaveLength(4);
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
        expect(
            screen.getByRole('checkbox', {
                name: 'Select Ann Test (ann.other@example.com)',
            }),
        ).toBeInTheDocument();
    });

    describe('with more people than fit', () => {
        const crowd = Array.from({ length: 300 }, (_, index) =>
            person(`crowd${index}`, `Person${index}`),
        );
        const withCrowd = (run: () => Promise<void>) => async () => {
            membership.push(...crowd);
            try {
                await run();
            } finally {
                membership.splice(membership.length - crowd.length);
            }
        };

        it(
            'shows the first 50 and says how many there are',
            withCrowd(async () => {
                renderModal();
                expect(perPersonSelects()).toHaveLength(50);
                expect(
                    screen.getByText('Showing 50 of 303, search to narrow'),
                ).toBeInTheDocument();
            }),
        );

        it(
            'narrows by name or email when searching',
            withCrowd(async () => {
                renderModal();
                const search = screen.getByRole('textbox', {
                    name: 'Search people',
                });
                fireEvent.change(search, { target: { value: 'person299' } });
                expect(perPersonSelects()).toHaveLength(1);
                expect(
                    screen.getByRole('combobox', {
                        name: 'Department for Person299 Test',
                    }),
                ).toBeInTheDocument();
                expect(
                    screen.queryByText(/search to narrow/),
                ).not.toBeInTheDocument();
                fireEvent.change(search, { target: { value: 'U2@EXAMPLE' } });
                expect(
                    screen.getByRole('combobox', {
                        name: 'Department for Bob Test',
                    }),
                ).toBeInTheDocument();
                fireEvent.change(search, { target: { value: 'zzz' } });
                expect(
                    screen.getByText('Nobody matches this search'),
                ).toBeInTheDocument();
            }),
        );

        it(
            'selects only the people shown, and keeps a selection made before searching',
            withCrowd(async () => {
                renderModal();
                await userEvent.click(
                    screen.getByRole('checkbox', { name: 'Select Ann Test' }),
                );
                fireEvent.change(
                    screen.getByRole('textbox', { name: 'Search people' }),
                    { target: { value: 'person29' } },
                );
                await userEvent.click(
                    screen.getByRole('checkbox', { name: 'Select all shown' }),
                );
                // Person29 and Person290 to Person299, plus Ann from before the search
                expect(
                    screen.getByText('12 selected, 1 hidden by search'),
                ).toBeVisible();
                await place('Place selected in', 'Finance');
                const [placement] = placedSoFar();
                expect(placement).toMatchObject({ departmentUuid: 'Finance' });
                expect(
                    (placement as { userUuids: string[] }).userUuids,
                ).toHaveLength(12);
            }),
        );

        it(
            'says when selected people are past the first 50 shown',
            withCrowd(async () => {
                renderModal();
                const search = screen.getByRole('textbox', {
                    name: 'Search people',
                });
                fireEvent.change(search, { target: { value: 'person299' } });
                await userEvent.click(
                    screen.getByRole('checkbox', {
                        name: 'Select Person299 Test',
                    }),
                );
                fireEvent.change(search, { target: { value: '' } });
                expect(
                    screen.getByText('1 selected, 1 not shown'),
                ).toBeVisible();
            }),
        );

        it(
            'still places a person found by search, keeping existing members',
            withCrowd(async () => {
                renderModal();
                fireEvent.change(
                    screen.getByRole('textbox', { name: 'Search people' }),
                    { target: { value: 'person299' } },
                );
                await place('Department for Person299 Test', 'Ops');
                expect(mutate).toHaveBeenCalledWith({
                    departmentUuid: 'Ops',
                    userUuids: ['u9', 'crowd299'],
                });
            }),
        );
    });
});
