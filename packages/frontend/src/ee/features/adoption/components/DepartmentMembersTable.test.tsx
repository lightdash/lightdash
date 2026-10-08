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
    it('lists never active first, then the least recently active', () => {
        renderWithProviders(<DepartmentMembersTable members={members} />);
        const rows = bodyRows();
        expect(rows).toHaveLength(3);
        expect(within(rows[0]).getByText('never@example.com')).toBeVisible();
        expect(within(rows[0]).getByText('Never')).toBeVisible();
        expect(within(rows[0]).getByText('Via North')).toBeVisible();
        expect(within(rows[1]).getByText('stale@example.com')).toBeVisible();
        expect(within(rows[1]).getByText('Group ops-all')).toBeVisible();
        expect(within(rows[2]).getByText('recent@example.com')).toBeVisible();
        expect(within(rows[2]).getByText('Direct')).toBeVisible();
        expect(within(rows[2]).getByText('12')).toBeVisible();
    });
    it('filters to people who were never active', async () => {
        renderWithProviders(<DepartmentMembersTable members={members} />);
        await userEvent.click(screen.getByText('Never active (1)'));
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
        await userEvent.click(screen.getByText('Never active (0)'));
        expect(screen.getByText('Nobody matches this filter')).toBeVisible();
    });
    it('says so when no one has an account', () => {
        renderWithProviders(<DepartmentMembersTable members={[]} />);
        expect(
            screen.getByText('No one in this department has an account yet'),
        ).toBeVisible();
    });
});
