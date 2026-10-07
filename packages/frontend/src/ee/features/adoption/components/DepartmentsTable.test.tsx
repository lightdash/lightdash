import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { DepartmentsTable } from './DepartmentsTable';

// ECharts needs a real layout engine
vi.mock('../../../../components/EChartsReactWrapper', () => ({
    default: () => null,
}));

const departments = [
    dept('Sales', null, 80),
    dept('Ops', null, 10, { headcountBelowChildren: true }),
    dept('Legal', null, null),
    dept('Stores', 'Ops', 50),
    dept('Small', null, 0, {
        headcount: 300,
        effectiveHeadcount: 300,
        metrics: metricsFixture(1, 0),
        headcountNote: 'Full-time staff only',
    }),
];

const renderTable = (canManage = true, onEdit = vi.fn()) =>
    renderWithProviders(
        <MemoryRouter>
            <DepartmentsTable
                departments={departments}
                canManage={canManage}
                onEdit={onEdit}
            />
        </MemoryRouter>,
    );

describe('DepartmentsTable', () => {
    it('lists top-level departments with the lowest coverage first', () => {
        renderTable();
        const links = screen.getAllByRole('link').map((l) => l.textContent);
        expect(links).toEqual(['Small', 'Ops', 'Sales', 'Legal']);
    });
    it('reveals children when a parent is expanded, with state on the button', async () => {
        renderTable();
        expect(screen.queryByText('Stores')).not.toBeInTheDocument();
        const expand = screen.getByRole('button', { name: 'Expand Ops' });
        expect(expand).toHaveAttribute('aria-expanded', 'false');
        await userEvent.click(expand);
        expect(screen.getByText('Stores')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Collapse Ops' }),
        ).toHaveAttribute('aria-expanded', 'true');
    });
    it('shows only non-zero roles, or a placeholder when there are none', () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept('Empty', null, 0, {
                            metrics: metricsFixture(0, 0),
                        }),
                        dept('Staffed', null, 50, {
                            metrics: metricsFixture(3, 50, {
                                roleSplit: {
                                    viewers: 1,
                                    interactiveViewers: 0,
                                    editors: 1,
                                    admins: 1,
                                },
                            }),
                        }),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        expect(screen.getByText('No one yet')).toBeInTheDocument();
        expect(
            screen.getByText('1 viewer, 1 editor, 1 admin'),
        ).toBeInTheDocument();
    });
    it('lets the keyboard expand a row', async () => {
        renderTable();
        screen.getByRole('button', { name: 'Expand Ops' }).focus();
        await userEvent.keyboard('{Enter}');
        expect(screen.getByText('Stores')).toBeInTheDocument();
    });
    it('shows a share that rounds to zero as less than 1% with its count', () => {
        renderTable();
        const row = screen.getByRole('link', { name: 'Small' }).closest('tr')!;
        expect(within(row).getByText('<1% (1)')).toBeInTheDocument();
    });
    it('prompts for a missing headcount and warns when a headcount is below its sub-departments', () => {
        renderTable();
        expect(
            screen.getByRole('button', { name: 'Add headcount for Legal' }),
        ).toBeInTheDocument();
        expect(
            screen.getByLabelText(
                'Headcount is lower than the total of its sub-departments',
            ),
        ).toBeInTheDocument();
    });
    it('opens the editor from the prompt and the edit button', async () => {
        const onEdit = vi.fn();
        renderTable(true, onEdit);
        await userEvent.click(
            screen.getByRole('button', { name: 'Add headcount for Legal' }),
        );
        expect(onEdit).toHaveBeenLastCalledWith(
            expect.objectContaining({ departmentUuid: 'Legal' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Edit Ops' }));
        expect(onEdit).toHaveBeenLastCalledWith(
            expect.objectContaining({ departmentUuid: 'Ops' }),
        );
    });
    it('shows the headcount note as visible text without hovering', () => {
        renderTable();
        expect(screen.getByText('Full-time staff only')).toBeVisible();
    });
    it('announces the headcount warning and makes it focusable', async () => {
        renderTable();
        const warning = screen.getByRole('img', {
            name: 'Headcount is lower than the total of its sub-departments',
        });
        expect(warning).toHaveAttribute('tabindex', '0');
        await userEvent.tab();
        warning.focus();
        expect(warning).toHaveFocus();
    });
    it('labels the sparkline in words', () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[dept('Sales', null, 80)]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        expect(
            screen.getByRole('img', {
                name: 'No activity in the last 12 weeks',
            }),
        ).toBeInTheDocument();
    });
    it('hides edit controls from people who cannot manage', () => {
        renderTable(false);
        expect(screen.getAllByRole('columnheader')).toHaveLength(8);
        expect(
            screen.queryByRole('button', { name: /Add headcount/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit Ops' }),
        ).not.toBeInTheDocument();
    });
});
