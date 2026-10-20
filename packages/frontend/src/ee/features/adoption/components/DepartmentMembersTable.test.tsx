import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { memberFixture } from '../utils/adoptionFixtures';
import { DepartmentMembersTable } from './DepartmentMembersTable';

const members = [
    memberFixture('recent', new Date().toISOString(), {
        queries30d: 12,
        isActive30d: true,
    }),
    memberFixture('stale', '2020-01-01T00:00:00Z', {
        source: 'group',
        sourceGroupName: 'ops-all',
    }),
    memberFixture('never', null, { isDirect: false, departmentName: 'North' }),
];

const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('DepartmentMembersTable', () => {
    it('lists people with no activity in 90 days first, then the least recently active', () => {
        renderWithProviders(<DepartmentMembersTable members={members} />);
        const rows = bodyRows();
        expect(rows).toHaveLength(3);
        expect(within(rows[0]).getByText('never@example.com')).toBeVisible();
        expect(
            within(rows[0]).getByText('No activity in 90 days'),
        ).toBeVisible();
        expect(within(rows[0]).getByText('Via North')).toBeVisible();
        expect(within(rows[1]).getByText('stale@example.com')).toBeVisible();
        expect(within(rows[1]).getByText('Group ops-all')).toBeVisible();
        expect(within(rows[2]).getByText('recent@example.com')).toBeVisible();
        expect(within(rows[2]).getByText('Direct')).toBeVisible();
        expect(within(rows[2]).getByText('12')).toBeVisible();
    });
    it('offers every activity filter, with counts', () => {
        renderWithProviders(<DepartmentMembersTable members={members} />);
        const chipLabels = screen
            .getAllByRole('radio')
            .map((chip) =>
                chip instanceof HTMLInputElement
                    ? chip.labels?.[0]?.textContent
                    : null,
            );
        expect(chipLabels).toEqual([
            'All (3)',
            'Active in 30 days (1)',
            'Not active in 30 days (1)',
            'No activity in 90 days (1)',
        ]);
        expect(screen.getByRole('radio', { name: 'All (3)' })).toBeChecked();
    });
    it('filters to people active in the last 30 days', async () => {
        renderWithProviders(<DepartmentMembersTable members={members} />);
        await userEvent.click(screen.getByText('Active in 30 days (1)'));
        expect(bodyRows()).toHaveLength(1);
        expect(
            within(bodyRows()[0]).getByText('recent@example.com'),
        ).toBeVisible();
    });
    it('filters to people with no activity in 90 days', async () => {
        renderWithProviders(<DepartmentMembersTable members={members} />);
        await userEvent.click(screen.getByText('No activity in 90 days (1)'));
        expect(bodyRows()).toHaveLength(1);
        expect(
            within(bodyRows()[0]).getByText('never@example.com'),
        ).toBeVisible();
    });
    it('filters to people not active in 30 days', async () => {
        renderWithProviders(<DepartmentMembersTable members={members} />);
        await userEvent.click(screen.getByText('Not active in 30 days (1)'));
        expect(bodyRows()).toHaveLength(1);
        expect(
            within(bodyRows()[0]).getByText('stale@example.com'),
        ).toBeVisible();
    });
    it('says so when a filter matches nobody', async () => {
        renderWithProviders(
            <DepartmentMembersTable
                members={[
                    memberFixture('recent', new Date().toISOString(), {
                        isActive30d: true,
                    }),
                ]}
            />,
        );
        await userEvent.click(screen.getByText('No activity in 90 days (0)'));
        expect(screen.getByText('Nobody matches this filter')).toBeVisible();
    });
    it('groups thousands in the filter counts', () => {
        renderWithProviders(
            <DepartmentMembersTable
                members={[
                    ...Array.from({ length: 1200 }, (_, i) =>
                        memberFixture(`p${String(i).padStart(4, '0')}`, null),
                    ),
                    memberFixture('busy', new Date().toISOString(), {
                        isActive30d: true,
                    }),
                ]}
            />,
        );
        expect(screen.getByText('All (1,201)')).toBeVisible();
        expect(
            screen.getByText('No activity in 90 days (1,200)'),
        ).toBeVisible();
    });
    it('groups thousands in queries and dashboard views', () => {
        renderWithProviders(
            <DepartmentMembersTable
                members={[
                    memberFixture('busy', new Date().toISOString(), {
                        isActive30d: true,
                        queries30d: 1234,
                        dashboardViews30d: 5678,
                    }),
                ]}
            />,
        );
        const [row] = bodyRows();
        expect(within(row).getByText('1,234')).toBeVisible();
        expect(within(row).getByText('5,678')).toBeVisible();
    });
    it('says so when no one has an account', () => {
        renderWithProviders(<DepartmentMembersTable members={[]} />);
        expect(
            screen.getByText('No one in this department has an account yet'),
        ).toBeVisible();
    });
    it('says which other departments a person is also in, under how they are in this one', () => {
        renderWithProviders(
            <DepartmentMembersTable
                members={[
                    memberFixture('shared', null, {
                        isDirect: false,
                        departmentName: 'North',
                        sharedWith: [
                            { departmentUuid: 'sales', name: 'Sales' },
                            { departmentUuid: 'finance', name: 'Finance' },
                        ],
                    }),
                    memberFixture('single', null),
                ]}
            />,
        );
        const [shared, single] = bodyRows();
        const cell = within(shared).getByText('Via North').closest('td');
        expect(cell).not.toBeNull();
        if (cell) {
            expect(
                within(cell).getByText('Also in Finance and Sales'),
            ).toBeVisible();
        }
        expect(within(single).queryByText(/Also in/)).not.toBeInTheDocument();
        expect(within(shared).getByText(/^Also in/)).not.toHaveAttribute(
            'title',
        );
    });
    it('names three other departments and counts the rest, with every name in its title', () => {
        const departments = ['Sales', 'Finance', 'Marketing', 'Data', 'Legal'];
        renderWithProviders(
            <DepartmentMembersTable
                members={[
                    memberFixture('many', null, {
                        sharedWith: departments.map((name) => ({
                            departmentUuid: name.toLowerCase(),
                            name,
                        })),
                    }),
                ]}
            />,
        );
        expect(
            screen.getByText('Also in Data, Finance, Legal and 2 more'),
        ).toHaveAttribute(
            'title',
            'Also in Data, Finance, Legal, Marketing and Sales',
        );
    });
});
