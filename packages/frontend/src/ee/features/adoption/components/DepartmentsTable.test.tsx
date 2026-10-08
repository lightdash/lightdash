import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { DepartmentsTable } from './DepartmentsTable';
import styles from './DepartmentsTable.module.css';

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

// jsdom has no layout, so the table's width is reported by hand
const setTableWidth = (width: number) =>
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(private readonly callback: ResizeObserverCallback) {}

            observe(target: Element) {
                this.callback(
                    [
                        {
                            target,
                            contentRect: new DOMRect(0, 0, width, 600),
                            borderBoxSize: [],
                            contentBoxSize: [],
                            devicePixelContentBoxSize: [],
                        },
                    ],
                    new ResizeObserver(() => {}),
                );
            }

            unobserve() {}

            disconnect() {}
        },
    );
const WIDE = 1400;

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
    afterEach(() => {
        vi.unstubAllGlobals();
    });

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
    it('shows only non-zero roles, or a placeholder when there are none', async () => {
        setTableWidth(WIDE);
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
        expect(await screen.findByText('No one yet')).toBeInTheDocument();
        expect(
            screen.getByText('1 viewer, 1 editor, 1 admin'),
        ).toBeInTheDocument();
    });
    it('shows the role split only once the table is 1,300 px wide', async () => {
        setTableWidth(1300);
        const { unmount } = renderTable();
        expect(
            await screen.findByRole('columnheader', { name: 'Roles' }),
        ).toBeInTheDocument();
        unmount();
        // Below that the map inspector still shows it
        setTableWidth(1299);
        renderTable();
        await screen.findByRole('columnheader', { name: 'Owner' });
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(
            screen.queryByRole('columnheader', { name: 'Roles' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/viewers?/)).not.toBeInTheDocument();
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
    it('shows the headcount note in a tooltip on the headcount, on hover and on keyboard focus', async () => {
        renderTable();
        expect(
            screen.queryByText('Full-time staff only'),
        ).not.toBeInTheDocument();
        const headcount = screen.getByText('300');
        await userEvent.hover(headcount);
        // The tooltip repeats the value, as a narrow column can cut it short
        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent('300');
        expect(tooltip).toHaveTextContent('Full-time staff only');
        await userEvent.unhover(headcount);
        headcount.focus();
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Full-time staff only',
        );
    });
    it('keeps every cell on one line, shortening long text with the full text in a title', async () => {
        setTableWidth(WIDE);
        const name = 'Customer Success Managers for Enterprise Accounts';
        const roles =
            '493 viewers, 169 interactive viewers, 165 editors, 7 admins';
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept(name, null, 50, {
                            owners: [
                                {
                                    type: 'user',
                                    uuid: 'u1',
                                    name: 'Valentina Choi-Attenborough',
                                },
                                {
                                    type: 'group',
                                    uuid: 'g1',
                                    name: 'emea-sales-leadership',
                                },
                            ],
                            metrics: metricsFixture(5, 50, {
                                roleSplit: {
                                    viewers: 493,
                                    interactiveViewers: 169,
                                    editors: 165,
                                    admins: 7,
                                },
                            }),
                        }),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        const link = screen.getByRole('link', { name });
        expect(link).toHaveAttribute('data-truncate', 'end');
        expect(link).toHaveAttribute('title', name);
        const rolesCell = await screen.findByText(roles);
        expect(rolesCell).toHaveAttribute('data-truncate', 'end');
        expect(rolesCell).toHaveAttribute('title', roles);
        expect(screen.getByText('50% (5)')).toHaveAttribute(
            'data-truncate',
            'end',
        );
        // Only the owner's name gives way, so the count of other owners stays in sight
        const owner = screen.getByText('Valentina Choi-Attenborough');
        expect(owner).toHaveAttribute('data-truncate', 'end');
        const others = screen.getByText('+1');
        expect(others).not.toHaveAttribute('data-truncate');
        expect(owner.parentElement).toBe(others.parentElement);
        expect(owner.parentElement).toHaveAttribute(
            'title',
            'Valentina Choi-Attenborough, emea-sales-leadership',
        );
    });
    it('lets the count of deeper sub-departments give way before the name', async () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept('Commercial', null, 50),
                        dept('Customer Success', 'Commercial', 50),
                        dept('Support', 'Customer Success', 50),
                        dept('Tier one', 'Support', 50),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Expand Commercial' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Expand Customer Success' }),
        );
        expect(screen.getByRole('link', { name: 'Support' })).toBeVisible();
        const name = screen.getByRole('link', { name: 'Support' });
        const count = screen.getByText('1 sub-department');
        expect(count).toHaveAttribute('data-truncate', 'end');
        expect(count).toHaveAttribute('title', '1 sub-department');
        expect(count).toHaveStyle({ minWidth: '0rem' });
        // Both can shrink, and the count shrinks first
        expect(name).toHaveAttribute('data-truncate', 'end');
        expect(count).toHaveClass(styles.yields);
        expect(name).not.toHaveClass(styles.yields);
        expect(name.parentElement).toBe(count.parentElement);
    });
    it('groups thousands in every number', async () => {
        setTableWidth(WIDE);
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept('Operations', null, null, {
                            headcount: 2350,
                            effectiveHeadcount: 2350,
                            metrics: metricsFixture(1317, 56, {
                                activeCount30d: 1200,
                                activePct: 51,
                                roleSplit: {
                                    viewers: 1317,
                                    interactiveViewers: 0,
                                    editors: 0,
                                    admins: 0,
                                },
                            }),
                        }),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        expect(await screen.findByText('1,317 viewers')).toBeVisible();
        expect(screen.getByText('2,350')).toBeVisible();
        expect(screen.getByText('56% (1,317)')).toBeVisible();
        expect(screen.getByText('51% (1,200)')).toBeVisible();
    });
    it('has no target column, even for a department with a target', async () => {
        setTableWidth(WIDE);
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept('Operations', null, 50, {
                            targetActiveUsers: 1200,
                            targetDate: '2026-11-30',
                        }),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        expect(
            await screen.findByRole('columnheader', { name: 'Roles' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('columnheader', { name: 'Target' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByText(/1,200|30 Nov 2026/)).not.toBeInTheDocument();
    });
    it('shows coverage above 100% with the counts behind it, explained in a tooltip', async () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept('Data governance', null, null, {
                            headcount: 8,
                            effectiveHeadcount: 8,
                            metrics: metricsFixture(9, 113),
                        }),
                        dept('Sales', null, 80),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        await userEvent.hover(screen.getByText('113% (9 of 8)'));
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'More accounts than headcount',
        );
        // Coverage within the headcount needs no explanation
        expect(screen.getByText('80% (8)')).toHaveAttribute(
            'data-truncate',
            'end',
        );
    });
    it('keeps a long coverage above 100% inside its column, with the whole value in the tooltip', async () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept('Data', null, null, {
                            headcount: 110,
                            effectiveHeadcount: 110,
                            metrics: metricsFixture(191, 174),
                        }),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        const coverage = screen.getByText('174% (191 of 110)');
        expect(coverage).toHaveAttribute('data-truncate', 'end');
        expect(coverage).toHaveClass(styles.explained);
        await userEvent.hover(coverage);
        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent('174% (191 of 110)');
        expect(tooltip).toHaveTextContent('More accounts than headcount');
    });
    it('explains active people above the headcount the same way', async () => {
        renderWithProviders(
            <MemoryRouter>
                <DepartmentsTable
                    departments={[
                        dept('Data governance', null, null, {
                            headcount: 8,
                            effectiveHeadcount: 8,
                            metrics: metricsFixture(9, 113, {
                                activeCount30d: 9,
                                activePct: 113,
                            }),
                        }),
                    ]}
                    canManage
                    onEdit={vi.fn()}
                />
            </MemoryRouter>,
        );
        const [coverage, active] = screen.getAllByText('113% (9 of 8)');
        expect(coverage).toHaveClass(styles.explained);
        expect(active).toHaveClass(styles.explained);
        expect(active).toHaveAttribute('data-truncate', 'end');
        await userEvent.hover(active);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'More accounts than headcount',
        );
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
    it('hides edit controls from people who cannot manage', async () => {
        setTableWidth(WIDE);
        renderTable(false);
        await screen.findByRole('columnheader', { name: 'Roles' });
        // Department, headcount, coverage, active, roles, 12 weeks and owner, with no edit column
        expect(screen.getAllByRole('columnheader')).toHaveLength(7);
        expect(
            screen.queryByRole('button', { name: /Add headcount/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit Ops' }),
        ).not.toBeInTheDocument();
    });
});
