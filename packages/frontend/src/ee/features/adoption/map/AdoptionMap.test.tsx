import {
    type DepartmentMember,
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import {
    dept,
    memberFixture,
    metricsFixture,
    seededOrganization,
    withServerHeadcounts,
} from '../utils/adoptionFixtures';
import { getSweepDelay } from '../utils/sweepDelay';
import { AdoptionMap } from './AdoptionMap';
import styles from './DepartmentMap.module.css';
import { estimateTextWidth } from './mapLayout';
import { deepOrganization, flatOrganization } from './organizationFixtures';

// Only the network hook is replaced; the layout and geometry are the real ones
const useDepartmentDetail = vi.fn();
vi.mock('../../../hooks/useOrgDepartments', () => ({
    useDepartmentDetail: (departmentUuid: string | undefined) =>
        useDepartmentDetail(departmentUuid),
}));

const d = (
    name: string,
    parent: string | null,
    headcount: number | null,
    members: number,
    active: number,
    over: Partial<DepartmentWithMetrics> = {},
) =>
    dept(name, parent, null, {
        headcount,
        // Never below the people on Lightdash, as the server gives it
        effectiveHeadcount: Math.max(headcount ?? 0, members),
        hasHeadcount: headcount !== null,
        metrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active,
            coveragePct:
                Math.max(headcount ?? 0, members) === 0
                    ? null
                    : Math.round(
                          (100 * members) / Math.max(headcount ?? 0, members),
                      ),
        }),
        directMetrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active,
        }),
        ...over,
    });

// Ops holds nobody itself: its 30 people are all in Stores and Depots
const tree = [
    d('Ops', null, 30, 9, 4, { directMetrics: metricsFixture(0, null) }),
    d('Stores', 'Ops', 20, 6, 4),
    d('Depots', 'Ops', 10, 3, 0),
    d('Finance', null, 8, 3, 2),
];

const summary = (
    departments: DepartmentWithMetrics[],
    organization = metricsFixture(12, null, { activeCount30d: 6 }),
): OrganizationAdoptionSummary => ({
    organization,
    // Every tree the map is given is shaped as the server would send it
    departments: withServerHeadcounts(departments),
    attention: { conflictCount: 1, unassignedCount: 2 },
});

const renderMap = (
    departments: DepartmentWithMetrics[] = tree,
    {
        canManage = true,
        onEdit = vi.fn(),
        organization = metricsFixture(12, null, { activeCount30d: 6 }),
    } = {},
) =>
    renderWithProviders(
        <MemoryRouter>
            <AdoptionMap
                summary={summary(departments, organization)}
                canManage={canManage}
                onEdit={onEdit}
                measureText={estimateTextWidth}
            />
        </MemoryRouter>,
    );

const loadMembers = (departmentUuid: string, members: DepartmentMember[]) =>
    useDepartmentDetail.mockImplementation((uuid: string | undefined) => ({
        data:
            uuid === departmentUuid
                ? { department: { departmentUuid }, members }
                : undefined,
    }));

const departmentControls = () =>
    within(
        screen.getByRole('list', { name: 'Departments on the map' }),
    ).getAllByRole('button');

const legendCounts = () =>
    within(screen.getByRole('list', { name: 'Legend' }))
        .getAllByRole('listitem')
        .flatMap((item) => {
            const [label, count] = within(item)
                .getAllByText(/.+/)
                .map((node) => node.textContent ?? '');
            // The rings for departments with nobody or no headcount carry no count
            return count === undefined
                ? []
                : [{ label, count: Number(count.replace(/,/g, '')) }];
        });

describe('AdoptionMap', () => {
    beforeEach(() => {
        useDepartmentDetail.mockReset();
        useDepartmentDetail.mockReturnValue({ data: undefined });
    });

    it('gives every department on the map a real control named with its numbers', () => {
        renderMap();
        expect(
            departmentControls().map((control) => control.textContent),
        ).toEqual([
            'Ops, 9 of 30 on Lightdash, 4 active in the last 30 days, 2 sub-departments',
            'Finance, 3 of 8 on Lightdash, 2 active in the last 30 days',
            'Stores, 6 of 20 on Lightdash, 4 active in the last 30 days',
            'Depots, 3 of 10 on Lightdash, 0 active in the last 30 days',
        ]);
    });

    it('describes the organization in words on the drawing itself', () => {
        renderMap();
        expect(
            screen.getByRole('img', {
                name: /^Map of the organization: 2 departments, 38 people, 12 on Lightdash placed in a department, 6 active in the last 30 days\./,
            }),
        ).toBeInTheDocument();
    });

    it('draws one circle per department and one dot per person', () => {
        const { container } = renderMap();
        expect(container.querySelectorAll('[data-department]')).toHaveLength(4);
        // Stores 20 + Depots 10 + Finance 8, and the three swatches of each legend
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(
            38 + 3 + 3,
        );
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(38);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot="active"]'),
        ).toHaveLength(6);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot="idle"]'),
        ).toHaveLength(6);
        expect(
            container.querySelectorAll(
                'svg[role="img"] [data-dot="noAccount"]',
            ),
        ).toHaveLength(26);
    });

    it('sizes the drawing in pixels rather than leaving it to a default', () => {
        const { container } = renderMap();
        const svg = container.querySelector('svg[role="img"]');
        expect(Number(svg?.getAttribute('width'))).toBeGreaterThan(0);
        expect(Number(svg?.getAttribute('height'))).toBeGreaterThan(0);
        expect(svg?.getAttribute('viewBox')).toBeNull();
    });

    it('takes its pixel size from the measured container', () => {
        const measured = vi
            .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
            .mockReturnValue(new DOMRect(0, 0, 640, 480));
        const { container } = renderMap();
        const svg = container.querySelector('svg[role="img"]');
        expect(svg).toHaveAttribute('width', '640');
        expect(svg).toHaveAttribute('height', '480');
        // Every circle sits inside the measured box
        container.querySelectorAll('[data-department]').forEach((circle) => {
            const cx = Number(circle.getAttribute('cx'));
            const cy = Number(circle.getAttribute('cy'));
            const r = Number(circle.getAttribute('r'));
            expect(cx - r).toBeGreaterThanOrEqual(0);
            expect(cx + r).toBeLessThanOrEqual(640);
            expect(cy + r).toBeLessThanOrEqual(480);
        });
        measured.mockRestore();
    });

    it('shows legend counts that add up to the people in view', async () => {
        renderMap();
        expect(legendCounts()).toEqual([
            { label: 'Active in 30 days', count: 6 },
            { label: 'Not active in 30 days', count: 6 },
            { label: 'No account', count: 26 },
        ]);
        await userEvent.click(screen.getByRole('radio', { name: 'Role' }));
        const byRole = legendCounts();
        expect(byRole.map((entry) => entry.label)).toEqual([
            'Admin',
            'Editor',
            'Interactive viewer',
            'Viewer',
            'No account',
        ]);
        expect(byRole.reduce((sum, entry) => sum + entry.count, 0)).toBe(38);
    });

    it('zooms into a department from its control and back out through the breadcrumb', async () => {
        renderMap();
        await userEvent.click(screen.getByRole('button', { name: /^Ops,/ }));
        expect(
            departmentControls().map((control) =>
                control.textContent?.replace(/,.*/, ''),
            ),
        ).toEqual(['Stores', 'Depots']);
        expect(
            screen.getByRole('img', {
                name: /^Map of Ops: 2 sub-departments, 30 people/,
            }),
        ).toBeInTheDocument();
        expect(useDepartmentDetail).toHaveBeenLastCalledWith('Ops');
        await userEvent.click(
            screen.getByRole('button', { name: 'All departments' }),
        );
        expect(
            screen.getByRole('button', { name: /^Finance,/ }),
        ).toBeInTheDocument();
    });

    it('zooms into a department when its circle is clicked', () => {
        const { container } = renderMap();
        const circle = container.querySelector('[data-department="Finance"]');
        expect(circle).not.toBeNull();
        // A bare click: jsdom pointer events carry no window, which the drag handling reads
        if (circle) fireEvent.click(circle);
        expect(
            screen.getByRole('heading', { name: 'Finance' }),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Ops,/ })).toBeNull();
    });

    it('shows no cards under the map', () => {
        renderMap();
        [
            'Biggest gap',
            'Furthest behind',
            'Most seats unused',
            'Unplaced people',
        ].forEach((title) => expect(screen.queryByText(title)).toBeNull());
        expect(screen.queryByText(/: \d+ of \d+ active$/)).toBeNull();
    });

    it('names people inside a small department and inspects the one selected', async () => {
        loadMembers('Finance', [
            memberFixture('ada', new Date().toISOString(), {
                isActive30d: true,
                firstName: 'Ada',
                lastName: 'Lovelace',
                departmentUuid: 'Finance',
                departmentName: 'Finance',
            }),
            memberFixture('grace', null, {
                firstName: 'Grace',
                lastName: 'Hopper',
                departmentUuid: 'Finance',
                departmentName: 'Finance',
            }),
            memberFixture('alan', new Date().toISOString(), {
                isActive30d: true,
                firstName: 'Alan',
                lastName: 'Turing',
                departmentUuid: 'Finance',
                departmentName: 'Finance',
            }),
        ]);
        const { container } = renderMap();
        await userEvent.click(
            screen.getByRole('button', { name: /^Finance,/ }),
        );
        expect(
            [...container.querySelectorAll('svg[role="img"] text')].map(
                (node) => node.textContent,
            ),
        ).toEqual(expect.arrayContaining(['Ada', 'Grace', 'Alan']));
        // No department name at rest; on hover the department's one circle carries its own name
        expect(
            [...container.querySelectorAll('svg[role="img"] text')].map(
                (node) => node.textContent,
            ),
        ).not.toContain('Finance');
        const circle = container.querySelector(
            '[data-kind][data-circle="own:Finance"]',
        );
        expect(circle).not.toBeNull();
        if (circle) fireEvent.pointerOver(circle);
        expect(
            [
                ...container.querySelectorAll(
                    'svg[role="img"] [data-label="own:Finance"]',
                ),
            ].map((node) => node.textContent),
        ).toEqual(['Finance', '3 of 8']);
        expect(screen.queryByText(/Directly in/)).toBeNull();
        expect(legendCounts()).toEqual([
            { label: 'Active in 30 days', count: 2 },
            { label: 'Not active in 30 days', count: 1 },
            { label: 'No account', count: 5 },
        ]);
        await userEvent.click(
            screen.getByRole('button', { name: 'Grace Hopper' }),
        );
        expect(screen.getByText('grace@example.com')).toBeInTheDocument();
        expect(screen.getByText('No activity in 90 days')).toBeInTheDocument();
        expect(container.querySelectorAll('[data-selected]')).toHaveLength(1);
    });

    it('does not fetch the people of a department with more than 150 in view, and draws its dots from the counts', async () => {
        const big = [d('Field', null, 151, 1, 1)];
        loadMembers('Field', [
            memberFixture('ada', new Date().toISOString(), {
                isActive30d: true,
                firstName: 'Ada',
                departmentUuid: 'Field',
            }),
        ]);
        const { container } = renderMap(big);
        await userEvent.click(screen.getByRole('button', { name: /^Field,/ }));
        expect(useDepartmentDetail).not.toHaveBeenCalledWith('Field');
        expect(useDepartmentDetail).toHaveBeenLastCalledWith(undefined);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(151);
        expect(
            container.querySelectorAll('svg[role="img"] [data-user]'),
        ).toHaveLength(0);
        expect(
            screen.queryByRole('list', { name: 'People on the map' }),
        ).toBeNull();
        expect(
            [...container.querySelectorAll('svg[role="img"] text')].map(
                (node) => node.textContent,
            ),
        ).not.toContain('Ada');
    });

    it('fetches the people of a department with 150 in view', async () => {
        renderMap([d('Field', null, 150, 1, 1)]);
        await userEvent.click(screen.getByRole('button', { name: /^Field,/ }));
        expect(useDepartmentDetail).toHaveBeenLastCalledWith('Field');
    });

    it('hides person dots above 20,000 people and says so', () => {
        const { container } = renderMap([
            d('Everyone', null, 19997, 10, 5),
            d('Few', null, 4, 2, 1),
        ]);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(0);
        expect(container.querySelectorAll('[data-department]')).toHaveLength(2);
        expect(
            screen.getByText('Dots are hidden above 20,000 people'),
        ).toBeInTheDocument();
        expect(
            legendCounts().reduce((sum, entry) => sum + entry.count, 0),
        ).toBe(20001);
        expect(
            screen.getByRole('img', {
                name: /Each circle is a department sized by headcount\. The List view/,
            }),
        ).toBeInTheDocument();
    });

    it('still draws dots at exactly 20,000 people', () => {
        const { container } = renderMap([d('Everyone', null, 20000, 10, 5)]);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(20000);
        expect(screen.queryByText(/Dots are hidden/)).toBeNull();
    });

    it('draws the dots of a 6,000-headcount organization at the organization level, with no note about them', () => {
        const { container } = renderMap(deepOrganization);
        const drawing = screen.getByRole('img', {
            name: /^Map of the organization/,
        });
        const inView = Number(
            /, ([\d,]+) people,/
                .exec(drawing.getAttribute('aria-label') ?? '')?.[1]
                .replace(/,/g, ''),
        );
        expect(inView).toBeGreaterThan(4000);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(inView);
        // Every top-level effective headcount is drawn, so the legend counts the same people
        expect(
            legendCounts().reduce((sum, entry) => sum + entry.count, 0),
        ).toBe(inView);
        expect(inView).toBe(5587);
        expect(screen.queryByText(/Dots are hidden/)).toBeNull();
        expect(screen.queryByText(/^Dots show/)).toBeNull();
        expect(screen.queryByText(/Open a department to see/)).toBeNull();
    });

    it.each([
        ['6,000-headcount', deepOrganization],
        ['enterprise-shaped', flatOrganization],
    ])(
        'counts in the legend exactly the dots drawn of each kind across the %s organization',
        (_, departments) => {
            const { container } = renderMap(departments);
            const drawn = (kind: string) =>
                container.querySelectorAll(
                    `svg[role="img"] [data-dot="${kind}"]`,
                ).length;
            expect(legendCounts()).toEqual([
                { label: 'Active in 30 days', count: drawn('active') },
                { label: 'Not active in 30 days', count: drawn('idle') },
                { label: 'No account', count: drawn('noAccount') },
            ]);
            // And the panel beside the map gives the same three numbers
            const [active, idle, noAccount] = legendCounts().map((entry) =>
                entry.count.toLocaleString('en-US'),
            );
            expect(
                within(screen.getByRole('complementary', { name: 'Details' }))
                    .getAllByText(
                        /^(Active|On Lightdash, not active|No account) [\d,]+$/,
                    )
                    .map((node) => node.textContent),
            ).toEqual([
                `Active ${active}`,
                `On Lightdash, not active ${idle}`,
                `No account ${noAccount}`,
            ]);
        },
    );

    it('says when small circles are not to scale', () => {
        renderMap([d('Huge', null, 4000, 10, 5), d('Tiny', null, 1, 1, 1)]);
        expect(
            screen.getByRole('button', { name: /^Tiny,.*not to scale$/ }),
        ).toBeInTheDocument();
        expect(screen.getByText(/they are not to scale/)).toBeInTheDocument();
    });

    it('does not mention scale when every circle is to scale', () => {
        renderMap();
        expect(screen.queryByText(/not to scale/)).toBeNull();
    });

    it('marks a department with nobody on Lightdash and one without a headcount', () => {
        const { container } = renderMap([
            d('Supply', null, 40, 0, 0),
            d('Product', null, null, 5, 5),
            d('Finance', null, 8, 3, 2),
        ]);
        expect(
            container.querySelector('[data-department="Supply"]'),
        ).toHaveAttribute('data-empty');
        expect(
            container.querySelector('[data-department="Product"]'),
        ).toHaveAttribute('data-no-headcount');
        const finance = container.querySelector('[data-department="Finance"]');
        expect(finance).not.toHaveAttribute('data-empty');
        expect(finance).not.toHaveAttribute('data-no-headcount');
        expect(screen.getByText('Nobody on Lightdash yet')).toBeInTheDocument();
        expect(screen.getByText('No headcount set')).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Product, 5 on Lightdash, 5 active in the last 30 days, no headcount set',
            }),
        ).toBeInTheDocument();
    });

    it('draws a single department', () => {
        const { container } = renderMap([d('Only', null, 12, 4, 1)]);
        expect(departmentControls()).toHaveLength(1);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(12);
        expect(
            screen.getByRole('img', {
                name: /^Map of the organization: 1 department, 12 people/,
            }),
        ).toBeInTheDocument();
    });

    it('says so when a focused department has nobody and no headcount', async () => {
        renderMap([d('Blank', null, null, 0, 0), d('Finance', null, 8, 3, 2)]);
        await userEvent.click(screen.getByRole('button', { name: /^Blank,/ }));
        expect(
            screen.getByText('No people or headcount in this department yet'),
        ).toBeInTheDocument();
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('offers editing only to people who can manage departments', async () => {
        const onEdit = vi.fn();
        const { unmount } = renderMap(tree, { canManage: true, onEdit });
        await userEvent.click(
            screen.getByRole('button', { name: /^Finance,/ }),
        );
        expect(
            screen.getByRole('link', { name: 'Open Finance' }),
        ).toHaveAttribute('href', '/generalSettings/adoption/Finance');
        await userEvent.click(
            screen.getByRole('button', { name: 'Edit department' }),
        );
        expect(onEdit).toHaveBeenCalledWith(
            expect.objectContaining({ departmentUuid: 'Finance' }),
        );
        unmount();

        renderMap(tree, { canManage: false });
        await userEvent.click(
            screen.getByRole('button', { name: /^Finance,/ }),
        );
        expect(
            screen.getByRole('link', { name: 'Open Finance' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Edit department' }),
        ).toBeNull();
    });

    it('offers zoom controls', () => {
        renderMap();
        ['Zoom in', 'Zoom out', 'Reset view'].forEach((name) =>
            expect(screen.getByRole('button', { name })).toBeInTheDocument(),
        );
    });

    describe('opening a department', () => {
        const expectOperationsOpen = () => {
            expect(
                screen.getByText('Operations', { selector: '[aria-current]' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('img', {
                    // Its 40, the 8 it keeps beyond its sub-departments included, though nobody is in it yet
                    name: /^Map of Operations: 3 sub-departments, 40 people/,
                }),
            ).toBeInTheDocument();
            expect(
                departmentControls()
                    .map((control) => control.textContent?.replace(/,.*/, ''))
                    .sort(),
            ).toEqual(['Depots', 'North', 'Stores']);
        };

        it('starts on the whole organization', () => {
            renderMap(seededOrganization());
            expect(
                screen.getByRole('img', {
                    name: /^Map of the organization: 6 departments/,
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByText('All departments', {
                    selector: '[aria-current]',
                }),
            ).toBeInTheDocument();
        });

        it('opens from a click on the department circle', () => {
            const { container } = renderMap(seededOrganization());
            const circle = container.querySelector(
                '[data-department="Operations"]',
            );
            expect(circle).not.toBeNull();
            if (circle) fireEvent.click(circle);
            expectOperationsOpen();
        });

        it('opens from its accessible button', async () => {
            renderMap(seededOrganization());
            await userEvent.click(
                screen.getByRole('button', { name: /^Operations,/ }),
            );
            expectOperationsOpen();
        });

        it('opens the top-level department from a click on anything inside its circle', () => {
            const { container } = renderMap(seededOrganization());
            const nested = container.querySelector(
                '[data-department="Stores"]',
            );
            expect(nested).toHaveAttribute('data-opens', 'Operations');
            if (nested) fireEvent.click(nested);
            expectOperationsOpen();
        });

        it('does not open a department at the end of a drag', () => {
            const { container } = renderMap(seededOrganization());
            const svg = container.querySelector('svg[role="img"]');
            const circle = container.querySelector(
                '[data-department="Operations"]',
            );
            expect(svg && circle).toBeTruthy();
            if (!svg || !circle) return;
            const press = () =>
                fireEvent(
                    svg,
                    new MouseEvent('pointerdown', {
                        bubbles: true,
                        clientX: 10,
                        clientY: 10,
                    }),
                );
            press();
            fireEvent.click(circle, { clientX: 90, clientY: 10 });
            expect(
                screen.queryByRole('heading', { name: 'Operations' }),
            ).toBeNull();
            // The same press without travel is a selection
            press();
            fireEvent.click(circle, { clientX: 12, clientY: 11 });
            expectOperationsOpen();
        });
    });

    describe('keyboard', () => {
        it('moves focus to the breadcrumb after opening a department', async () => {
            renderMap(seededOrganization());
            screen.getByRole('button', { name: /^Operations,/ }).focus();
            await userEvent.keyboard('{Enter}');
            expect(document.activeElement).toHaveTextContent('Operations');
            expect(document.activeElement).toHaveAttribute(
                'aria-current',
                'location',
            );
        });

        const openWithKeyboard = async (name: RegExp) => {
            screen.getByRole('button', { name }).focus();
            await userEvent.keyboard('{Enter}');
        };

        it('goes up one level on Escape and keeps focus on the map', async () => {
            renderMap(seededOrganization());
            await openWithKeyboard(/^Operations,/);
            await openWithKeyboard(/^Stores,/);
            expect(document.activeElement).toHaveTextContent('Stores');
            await userEvent.keyboard('{Escape}');
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toBeInTheDocument();
            expect(document.activeElement).toHaveTextContent('Operations');
            await userEvent.keyboard('{Escape}');
            expect(
                screen.getByRole('heading', { name: 'Organization' }),
            ).toBeInTheDocument();
            expect(document.activeElement).toHaveTextContent('All departments');
            // Nothing above the organization
            await userEvent.keyboard('{Escape}');
            expect(
                screen.getByRole('heading', { name: 'Organization' }),
            ).toBeInTheDocument();
        });

        it('leaves focus where it was when a department is opened with the pointer', async () => {
            const { container } = renderMap(seededOrganization());
            const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
            // A row in the panel beside the map: moving focus to the breadcrumb would scroll the page up
            await userEvent.click(
                within(
                    screen.getByRole('complementary', { name: 'Details' }),
                ).getByText('Supply chain'),
            );
            expect(
                screen.getByRole('heading', { name: 'Supply chain' }),
            ).toBeInTheDocument();
            expect(document.activeElement).not.toHaveAttribute('aria-current');
            const circle = container.querySelector(
                '[data-department="Procurement"]',
            );
            if (circle) fireEvent.click(circle);
            expect(document.activeElement).not.toHaveAttribute('aria-current');
            expect(
                focusSpy.mock.contexts.some(
                    (element) =>
                        element instanceof HTMLElement &&
                        element.hasAttribute('aria-current'),
                ),
            ).toBe(false);
            focusSpy.mockRestore();
        });

        it("leaves Escape alone on controls that are not the map's way-finding", async () => {
            renderMap(seededOrganization());
            await openWithKeyboard(/^Operations,/);
            screen.getByRole('radio', { name: 'Role' }).focus();
            await userEvent.keyboard('{Escape}');
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toBeInTheDocument();
            screen.getByRole('button', { name: 'Zoom in' }).focus();
            await userEvent.keyboard('{Escape}');
            expect(
                screen.getByRole('heading', { name: 'Operations' }),
            ).toBeInTheDocument();
            // From a department control it goes up
            screen.getByRole('button', { name: /^Stores,/ }).focus();
            await userEvent.keyboard('{Escape}');
            expect(
                screen.getByRole('heading', { name: 'Organization' }),
            ).toBeInTheDocument();
        });
    });

    it('names what a click will open when hovering a sub-department at the top level', () => {
        const { container } = renderMap(seededOrganization());
        const title = (uuid: string) =>
            container.querySelector(`[data-department="${uuid}"] title`)
                ?.textContent;
        expect(title('Stores')).toBe(
            'Stores, 22 people, nobody on Lightdash yet. Select to open Operations',
        );
        expect(title('Operations')).toMatch(
            /^Operations, 1 of 40 on Lightdash/,
        );
        expect(title('Operations')).not.toMatch(/Select to open/);
        // Everything inside a top-level department shares one hover group
        const group = container.querySelector(
            '[data-department="Stores"]',
        )?.parentElement;
        expect(group).toHaveAttribute('data-opens', 'Operations');
        expect(
            group?.querySelector('[data-department="Operations"]'),
        ).not.toBeNull();
        expect(group?.querySelector('[data-department="Finance"]')).toBeNull();
    });

    it("draws a small department's people as dots large enough to read", async () => {
        const { container } = renderMap(seededOrganization());
        await userEvent.click(screen.getByRole('button', { name: /^Data,/ }));
        const dots = [
            ...container.querySelectorAll('svg[role="img"] [data-dot]'),
        ];
        expect(dots).toHaveLength(9);
        const diameters = dots.map((dot) => Number(dot.getAttribute('r')) * 2);
        // The eight without an account are smaller than the one with, and none is a speck
        expect(Math.max(...diameters)).toBeGreaterThanOrEqual(16);
        expect(Math.min(...diameters)).toBeGreaterThanOrEqual(12);
        expect(Math.min(...diameters)).toBeLessThan(Math.max(...diameters));
    });

    it('leaves a plain wheel to the page and zooms with Ctrl held', () => {
        const { container } = renderMap(seededOrganization());
        const svg = container.querySelector('svg[role="img"]');
        const viewport = () =>
            container
                .querySelector('svg[role="img"] > g')
                ?.getAttribute('transform');
        expect(svg).not.toBeNull();
        if (!svg) return;
        const fitted = viewport();
        const plain = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY: -120,
        });
        fireEvent(svg, plain);
        expect(viewport()).toBe(fitted);
        expect(plain.defaultPrevented).toBe(false);

        const held = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            deltaY: -120,
            ctrlKey: true,
        });
        fireEvent(svg, held);
        expect(viewport()).not.toBe(fitted);
        expect(held.defaultPrevented).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
        expect(viewport()).toBe(fitted);
    });

    describe('the panel beside the map', () => {
        const details = () =>
            screen.getByRole('complementary', { name: 'Details' });
        // The legend under the panel's bar, one "label count" line per part
        const panelLegend = () =>
            within(details())
                .getAllByText(
                    /^(Active|On Lightdash, not active|No account) [\d,]+$/,
                )
                .map((node) => node.textContent);
        // The share of a bar each coloured part takes; the rest is its track, the people without an account
        const barShares = (bar: Element | null | undefined) =>
            ['active', 'onLightdashNotActive'].map((part) =>
                Number.parseFloat(
                    bar
                        ?.querySelector<HTMLElement>(`[data-part="${part}"]`)
                        ?.style.getPropertyValue('--progress-section-size') ??
                        'NaN',
                ),
            );
        const mainBar = () =>
            details().querySelector('[data-part="active"]')?.parentElement;
        const rowsUnder = (label: 'Departments' | 'Sub-departments') => [
            ...(within(details()).getByText(label).nextElementSibling
                ?.children ?? []),
        ];
        // Each row as its name and its last column; the bar between them has no text
        const listed = (label: 'Departments' | 'Sub-departments') =>
            rowsUnder(label).map((row) =>
                [...row.children]
                    .map((cell) => cell.textContent)
                    .filter(Boolean)
                    .join(' | '),
            );
        const row = (name: string) =>
            within(details())
                .getAllByRole('button')
                .find((each) => each.textContent?.startsWith(name));

        it('sums the organization into one bar with the same numbers as the legend under the map', () => {
            renderMap();
            expect(
                within(details()).getByRole('heading', {
                    name: 'Organization',
                }),
            ).toBeInTheDocument();
            expect(
                within(details()).getByText('All departments'),
            ).toBeInTheDocument();
            // Placed: Stores 6, Depots 3 and Finance 3, 6 of them active. Headcount: Ops 30 and Finance 8
            expect(panelLegend()).toEqual([
                'Active 6',
                'On Lightdash, not active 6',
                'No account 26',
            ]);
            expect(legendCounts()).toEqual([
                { label: 'Active in 30 days', count: 6 },
                { label: 'Not active in 30 days', count: 6 },
                { label: 'No account', count: 26 },
            ]);
            const [active, notActive] = barShares(mainBar());
            expect(active).toBeCloseTo((100 * 6) / 38);
            expect(notActive).toBeCloseTo((100 * 6) / 38);
        });

        it('counts the people placed, not everyone on Lightdash, and nothing more than the bar', () => {
            renderMap(tree, {
                organization: metricsFixture(1951, null, {
                    activeCount30d: 1181,
                }),
            });
            expect(panelLegend()).toEqual([
                'Active 6',
                'On Lightdash, not active 6',
                'No account 26',
            ]);
            expect(within(details()).queryByText(/1,951|1,181/)).toBeNull();
            expect(
                within(details()).queryByText(
                    /Placed in a department|Without an account|^On Lightdash$|^Active in 30 days$|without a headcount/,
                ),
            ).toBeNull();
            expect(within(details()).queryByRole('link')).toBeNull();
        });

        it('lists the departments lowest coverage first, each with its own bar over its headcount', () => {
            renderMap();
            // Ops 9 of 30, Finance 3 of 8
            expect(listed('Departments')).toEqual([
                'Ops | 30%',
                'Finance | 38%',
            ]);
            const [active, notActive] = barShares(row('Finance'));
            expect(active).toBeCloseTo(25);
            expect(notActive).toBeCloseTo(12.5);
            expect(barShares(row('Ops'))).toEqual([
                expect.closeTo((100 * 4) / 30),
                expect.closeTo((100 * 5) / 30),
            ]);
        });

        it('opens a department from its row, as a click on its circle does', async () => {
            renderMap();
            const finance = row('Finance');
            expect(finance?.tagName).toBe('BUTTON');
            if (finance) await userEvent.click(finance);
            expect(
                screen.getByText('Finance', { selector: '[aria-current]' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('img', { name: /^Map of Finance:/ }),
            ).toBeInTheDocument();
        });

        it('opens a department from its row with the keyboard', async () => {
            renderMap();
            row('Finance')?.focus();
            expect(document.activeElement).toBe(row('Finance'));
            await userEvent.keyboard('{Enter}');
            expect(
                within(details()).getByRole('heading', { name: 'Finance' }),
            ).toBeInTheDocument();
        });

        it("titles a department with its parent's name, or Department at the top level, and keeps its own numbers", async () => {
            renderMap();
            await userEvent.click(
                screen.getByRole('button', { name: /^Ops,/ }),
            );
            expect(
                within(details()).getByRole('heading', { name: 'Ops' }),
            ).toBeInTheDocument();
            expect(
                within(details()).getByText('Department'),
            ).toBeInTheDocument();
            expect(panelLegend()).toEqual([
                'Active 4',
                'On Lightdash, not active 5',
                'No account 21',
            ]);
            // Stores and Depots both 30%: the larger first
            expect(listed('Sub-departments')).toEqual([
                'Stores | 30%',
                'Depots | 30%',
            ]);
            await userEvent.click(within(details()).getByText('Stores'));
            expect(
                within(details()).getByRole('heading', { name: 'Stores' }),
            ).toBeInTheDocument();
            expect(within(details()).getByText('Ops')).toBeInTheDocument();
            expect(panelLegend()).toEqual([
                'Active 4',
                'On Lightdash, not active 2',
                'No account 14',
            ]);
            expect(within(details()).queryByText('Sub-departments')).toBeNull();
        });

        it('lists the people directly in a department last, over the headcount it keeps for them, with nothing to open', async () => {
            // Ops is 40: Stores 20, Depots 10, and the 10 it keeps for the 4 directly in it, 1 of them active
            const { container } = renderMap([
                d('Ops', null, 40, 13, 3, {
                    directMetrics: metricsFixture(4, null, {
                        activeCount30d: 1,
                    }),
                }),
                d('Stores', 'Ops', 20, 6, 2),
                d('Depots', 'Ops', 10, 3, 0),
            ]);
            await userEvent.click(
                screen.getByRole('button', { name: /^Ops,/ }),
            );
            // Every person in Ops's 40 has a dot, the 6 it keeps without an account included
            expect(
                container.querySelectorAll('svg[role="img"] [data-dot]'),
            ).toHaveLength(20 + 10 + 10);
            const direct = container.querySelector(
                '[data-kind="direct"][data-circle="own:Ops"]',
            );
            expect(direct).not.toBeNull();
            if (direct) fireEvent.pointerOver(direct);
            expect(
                [
                    ...container.querySelectorAll(
                        'svg[role="img"] [data-label="own:Ops"]',
                    ),
                ].map((node) => node.textContent),
            ).toEqual(['Directly in Ops', '4 of 10 on Lightdash · 1 active']);
            expect(listed('Sub-departments')).toEqual([
                'Stores | 30%',
                'Depots | 30%',
                'Directly in Ops · 4 | 40%',
            ]);
            const directRow = rowsUnder('Sub-departments').at(-1);
            expect(directRow?.tagName).not.toBe('BUTTON');
            expect(within(details()).getByTitle('Directly in Ops · 4')).toBe(
                directRow?.firstElementChild,
            );
            expect(barShares(directRow)).toEqual([10, 30]);
            // The department's own bar, the legend under the map and the rings drawn all count its 27
            expect(panelLegend()).toEqual([
                'Active 3',
                'On Lightdash, not active 10',
                'No account 27',
            ]);
            expect(legendCounts()).toEqual([
                { label: 'Active in 30 days', count: 3 },
                { label: 'Not active in 30 days', count: 10 },
                { label: 'No account', count: 27 },
            ]);
            expect(
                container.querySelectorAll(
                    'svg[role="img"] [data-dot="noAccount"]',
                ),
            ).toHaveLength(27);
        });

        it('leaves out the people directly in a department without sub-departments, as they are the department', async () => {
            renderMap();
            await userEvent.click(
                screen.getByRole('button', { name: /^Finance,/ }),
            );
            expect(within(details()).queryByText(/Directly in/)).toBeNull();
            expect(within(details()).queryByText('Sub-departments')).toBeNull();
        });

        it('asks for a headcount where a department has none and no sub-departments, and sorts it with the zeros', async () => {
            renderMap(seededOrganization());
            expect(listed('Departments')).toEqual([
                'Supply chain | 0%',
                'Marketing | 0%',
                'Finance | 0%',
                'Product | Add headcount',
                'Operations | 3%',
                'Data | 11%',
            ]);
            // Its one person is on Lightdash and active, so the bar is full
            expect(barShares(row('Product'))).toEqual([100, 0]);
            await userEvent.click(
                screen.getByRole('button', { name: /^Operations,/ }),
            );
            // Operations keeps 8 beyond its sub-departments, with nobody in it yet
            expect(listed('Sub-departments')).toEqual([
                'Stores | 0%',
                'Depots | 0%',
                'North | Add headcount',
                'Directly in Operations · 0 | 0%',
            ]);
        });

        it('says there is no headcount, without asking for one, to people who cannot edit departments', () => {
            renderMap(seededOrganization(), { canManage: false });
            expect(listed('Departments')).toContain('Product | No headcount');
            expect(within(details()).queryByText('Add headcount')).toBeNull();
        });

        it('says nobody is counted yet where a department has a headcount of 0 and nobody on Lightdash', () => {
            renderMap([d('Legal', null, 0, 0, 0), d('Finance', null, 8, 3, 2)]);
            expect(listed('Departments')).toEqual([
                'Legal | Nobody yet',
                'Finance | 38%',
            ]);
            // An empty track
            expect(barShares(row('Legal'))).toEqual([0, 0]);
        });

        it('reads the people directly in a department without a headcount as the other rows without one do', async () => {
            const hub = [
                d('Hub', null, null, 13, 3, {
                    directMetrics: metricsFixture(4, null, {
                        activeCount30d: 1,
                    }),
                }),
                d('Team', 'Hub', null, 6, 2),
                d('Crew', 'Hub', null, 3, 0),
            ];
            const { container, unmount } = renderMap(hub);
            await userEvent.click(
                screen.getByRole('button', { name: /^Hub,/ }),
            );
            expect(listed('Sub-departments')).toEqual([
                'Team | Add headcount',
                'Crew | Add headcount',
                'Directly in Hub · 4 | Add headcount',
            ]);
            const direct = container.querySelector(
                '[data-kind="direct"][data-circle="own:Hub"]',
            );
            if (direct) fireEvent.pointerOver(direct);
            expect(
                [
                    ...container.querySelectorAll(
                        'svg[role="img"] [data-label="own:Hub"]',
                    ),
                ].map((node) => node.textContent),
            ).toEqual(['Directly in Hub', '4 on Lightdash · 1 active']);
            unmount();

            renderMap(hub, { canManage: false });
            await userEvent.click(
                screen.getByRole('button', { name: /^Hub,/ }),
            );
            expect(listed('Sub-departments')).toContain(
                'Directly in Hub · 4 | No headcount',
            );
        });

        it('keys the bar with the same dots the map draws', () => {
            renderMap();
            expect(
                [...details().querySelectorAll('li [data-dot]')].map((dot) =>
                    dot.getAttribute('data-dot'),
                ),
            ).toEqual(['active', 'idle', 'noAccount']);
        });

        it('counts a headcount below its sub-departments as their total, so the panel, the legend and the dots agree', async () => {
            // Stores has more accounts than headcount, so it counts 25; Ops' own 30 is below the 35 of Stores
            // and Depots, so it counts 35
            const lopsided = [
                d('Ops', null, 30, 25, 0, {
                    directMetrics: metricsFixture(0, null),
                }),
                d('Stores', 'Ops', 20, 25, 0),
                d('Depots', 'Ops', 10, 0, 0),
            ];
            const { container } = renderMap(lopsided);
            await userEvent.click(
                screen.getByRole('button', { name: /^Ops,/ }),
            );
            expect(panelLegend()).toEqual([
                'Active 0',
                'On Lightdash, not active 25',
                'No account 10',
            ]);
            expect(legendCounts()).toEqual([
                { label: 'Active in 30 days', count: 0 },
                { label: 'Not active in 30 days', count: 25 },
                { label: 'No account', count: 10 },
            ]);
            // Depots' 10
            expect(
                container.querySelectorAll(
                    'svg[role="img"] [data-dot="noAccount"]',
                ),
            ).toHaveLength(10);
        });

        it('shows the same numbers as the legend under the map where a headcount is above its sub-departments', () => {
            // Ops is 40: Stores 20, Depots 10, and 10 directly in Ops, 4 of them on Lightdash
            const { container } = renderMap([
                d('Ops', null, 40, 13, 3, {
                    directMetrics: metricsFixture(4, null, {
                        activeCount30d: 1,
                    }),
                }),
                d('Stores', 'Ops', 20, 6, 2),
                d('Depots', 'Ops', 10, 3, 0),
                d('Finance', null, 8, 3, 2),
            ]);
            expect(panelLegend()).toEqual([
                'Active 5',
                'On Lightdash, not active 11',
                'No account 32',
            ]);
            expect(
                legendCounts().find((entry) => entry.label === 'No account')
                    ?.count,
            ).toBe(32);
            // Stores 14, Depots 7, Finance 5, and the 6 Ops keeps for its own people without an account
            expect(
                container.querySelectorAll(
                    'svg[role="img"] [data-dot="noAccount"]',
                ),
            ).toHaveLength(32);
        });

        it('never shows coverage above 100%, in the rows or for the department opened', async () => {
            // A headcount of 8 entered for 9 people on Lightdash, all active, counts 9
            const over = d('Data', null, 8, 9, 9, {
                metrics: metricsFixture(9, 100, {
                    activeCount30d: 9,
                    activePct: 100,
                }),
            });
            renderMap([over, d('Finance', null, 8, 3, 2)]);
            expect(listed('Departments')).toEqual([
                'Finance | 38%',
                'Data | 100%',
            ]);
            await userEvent.click(
                screen.getByRole('button', { name: /^Data,/ }),
            );
            expect(panelLegend()).toEqual([
                'Active 9',
                'On Lightdash, not active 0',
                'No account 0',
            ]);
            expect(barShares(mainBar())).toEqual([100, 0]);
            expect(
                within(details()).queryByText(/More accounts than headcount/),
            ).toBeNull();
        });

        it('shows no tiles, owners, groups, roles, targets or captions for a department', async () => {
            // Finance's 8 is below its sub-department's 10, which the old panel had a caption for
            renderMap([
                d('Finance', null, 8, 3, 2, {
                    owners: [
                        { type: 'user', uuid: 'owner', name: 'Ada Owner' },
                    ],
                    linkedGroups: [
                        { groupUuid: 'group', name: 'Finance team' },
                    ],
                    targetActiveUsers: 6,
                    targetDate: '2026-12-31',
                    directMetrics: metricsFixture(0, null),
                }),
                d('Payroll', 'Finance', 10, 3, 2),
                d('Legal', null, 60, 0, 0),
            ]);
            await userEvent.click(
                screen.getByRole('button', { name: /^Finance,/ }),
            );
            expect(panelLegend()).toEqual([
                'Active 2',
                'On Lightdash, not active 1',
                'No account 7',
            ]);
            expect(
                within(details()).queryByText(
                    /Ada Owner|Finance team|group|viewer|editor|admin|target|to go|headcount entered is below|^On Lightdash$|of 8/i,
                ),
            ).toBeNull();
            expect(
                within(details()).getByRole('link', { name: 'Open Finance' }),
            ).toBeInTheDocument();
        });
    });

    it('keys a "Directly in" circle with nobody in it, which is drawn dashed once its department is open', async () => {
        // Ops keeps 10 beyond Stores and Depots with nobody of its own on Lightdash
        renderMap([
            d('Ops', null, 40, 9, 4, {
                directMetrics: metricsFixture(0, null),
            }),
            d('Stores', 'Ops', 20, 6, 4),
            d('Depots', 'Ops', 10, 3, 0),
        ]);
        // Inside Ops at the top it is a plain ring, so there is nothing to key
        expect(screen.queryByText('Nobody on Lightdash yet')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: /^Ops,/ }));
        expect(screen.getByText('Nobody on Lightdash yet')).toBeInTheDocument();
    });

    it('says the legend counts the people placed in a department across the organization', async () => {
        renderMap();
        const caption = 'Legend counts people placed in a department';
        expect(screen.getByText(caption)).toBeInTheDocument();
        // Inside a department everyone counted is in it
        await userEvent.click(screen.getByRole('button', { name: /^Ops,/ }));
        expect(screen.queryByText(caption)).toBeNull();
    });

    it('says sizes compare within a department when sub-departments are drawn', async () => {
        renderMap();
        const note = 'Circles are to scale within their department';
        expect(screen.getByText(note)).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: /^Ops,/ }));
        expect(screen.queryByText(note)).toBeNull();
    });

    it('draws people without an account as light rings', () => {
        const { container } = renderMap();
        const rings = container.querySelectorAll(
            'svg[role="img"] [data-dot="noAccount"]',
        );
        expect(rings.length).toBeGreaterThan(0);
        rings.forEach((ring) => {
            expect(Number(ring.getAttribute('stroke-width'))).toBeGreaterThan(
                0,
            );
        });
    });

    it("draws no department names at rest and shows a circle's name and numbers while it is hovered", () => {
        // Forty long names in one small panel
        const crowd = Array.from({ length: 40 }, (_, index) =>
            d(
                `A department with a long name, number ${index}`,
                null,
                4 + index * 7,
                3,
                2,
            ),
        );
        const { container } = renderMap(crowd);
        expect(
            container.querySelector('svg[role="img"] [data-label]'),
        ).toBeNull();
        expect(container.querySelector('svg[role="img"] text')).toBeNull();
        const circles = [
            ...container.querySelectorAll<SVGCircleElement>(
                'svg[role="img"] [data-department]',
            ),
        ];
        expect(circles).toHaveLength(40);
        const [circle] = circles;
        const id = circle.dataset.department ?? '';
        fireEvent.pointerOver(circle);
        const shown = [
            ...container.querySelectorAll(`[data-label="${id}"]`),
        ].map((node) => node.textContent);
        // In full, with its numbers on the line under it
        expect(shown).toEqual([id, expect.stringMatching(/^3 of \d+$/)]);
        fireEvent.pointerLeave(circle);
        expect(container.querySelector(`[data-label="${id}"]`)).toBeNull();
    });

    it("shows a department's name and numbers while its control has keyboard focus", () => {
        const { container } = renderMap();
        expect(
            container.querySelector('svg[role="img"] [data-label]'),
        ).toBeNull();
        const control = screen.getByRole('button', { name: /^Finance,/ });
        fireEvent.focus(control);
        expect(
            [
                ...container.querySelectorAll(
                    'svg[role="img"] [data-label="Finance"]',
                ),
            ].map((node) => node.textContent),
        ).toEqual(['Finance', '3 of 8']);
        fireEvent.blur(control);
        expect(
            container.querySelector('svg[role="img"] [data-label]'),
        ).toBeNull();
    });

    it("keeps a hovered circle's label while the pointer is on one of its people", async () => {
        // Small enough to name everyone
        const teams = Array.from({ length: 40 }, (_, index) =>
            d(
                `Team with a long descriptive name, number ${index}`,
                'Hub',
                3,
                3,
                1,
            ),
        );
        const hub = d('Hub', null, 120, 120, 40, {
            directMetrics: metricsFixture(0, null),
        });
        loadMembers(
            'Hub',
            teams.flatMap((team) =>
                Array.from({ length: 3 }, (_, index) =>
                    memberFixture(`${team.departmentUuid}-${index}`, null, {
                        departmentUuid: team.departmentUuid,
                        firstName: `Person${index}`,
                    }),
                ),
            ),
        );
        const { container } = renderMap([hub, ...teams]);
        await userEvent.click(screen.getByRole('button', { name: /^Hub,/ }));
        const unlabelled = [
            ...container.querySelectorAll<SVGCircleElement>(
                'svg[role="img"] [data-department]',
            ),
        ].find(
            (circle) =>
                container.querySelector(
                    `[data-label="${circle.dataset.department}"]`,
                ) === null &&
                container.querySelector(
                    `[data-dot][data-circle="${circle.dataset.circle}"][data-user]`,
                ) !== null,
        );
        expect(unlabelled).toBeDefined();
        if (!unlabelled) return;
        const id = unlabelled.dataset.circle ?? '';
        const person = container.querySelector<SVGCircleElement>(
            `[data-dot][data-circle="${id}"][data-user]`,
        );
        expect(person).not.toBeNull();
        if (!person) return;
        const shown = () => container.querySelector(`[data-label="${id}"]`);
        fireEvent.pointerOver(unlabelled);
        expect(shown()).not.toBeNull();
        // Onto one of its people, then off the map altogether
        fireEvent(
            unlabelled,
            new MouseEvent('pointerout', {
                bubbles: true,
                relatedTarget: person,
            }),
        );
        fireEvent(person, new MouseEvent('pointerover', { bubbles: true }));
        expect(shown()).not.toBeNull();
        fireEvent(
            person,
            new MouseEvent('pointerout', {
                bubbles: true,
                relatedTarget: null,
            }),
        );
        expect(shown()).toBeNull();
    });

    it('says when names could not be loaded, and nothing while they load', async () => {
        useDepartmentDetail.mockImplementation((uuid: string | undefined) =>
            uuid === 'Finance'
                ? { data: undefined, isError: true }
                : { data: undefined, isError: false, isInitialLoading: true },
        );
        renderMap();
        expect(screen.queryByText('Names could not be loaded')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: /^Ops,/ }));
        expect(screen.queryByText('Names could not be loaded')).toBeNull();
        await userEvent.click(
            screen.getByRole('button', { name: 'All departments' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: /^Finance,/ }),
        );
        expect(
            screen.getByText('Names could not be loaded'),
        ).toBeInTheDocument();
        // Dots still come from the summary counts
        expect(
            legendCounts().reduce((sum, entry) => sum + entry.count, 0),
        ).toBe(8);
    });

    it('does not ask for names when the view is too large to draw people', async () => {
        renderMap([d('Everyone', null, 20001, 10, 5), d('Few', null, 4, 2, 1)]);
        await userEvent.click(
            screen.getByRole('button', { name: /^Everyone,/ }),
        );
        expect(
            screen.getByRole('heading', { name: 'Everyone' }),
        ).toBeInTheDocument();
        expect(useDepartmentDetail).toHaveBeenLastCalledWith(undefined);
        expect(screen.queryByText('Names could not be loaded')).toBeNull();
    });

    it('labels the color control in American English', () => {
        renderMap();
        expect(screen.getByText('Color by')).toBeInTheDocument();
    });

    describe('changing the colouring', () => {
        const drawing = (container: HTMLElement) => {
            const svg = container.querySelector('svg[role="img"]');
            const dots = [
                ...container.querySelectorAll<SVGCircleElement>(
                    'svg[role="img"] [data-dot]',
                ),
            ];
            return {
                area: {
                    width: Number(svg?.getAttribute('width')),
                    height: Number(svg?.getAttribute('height')),
                },
                dots,
                delays: dots.map((dot) => dot.style.transitionDelay),
                fade: dots[0]?.parentElement?.style.getPropertyValue(
                    '--colour-fade',
                ),
                band: container.querySelector(`.${styles.sweepBand}`),
            };
        };

        let matchMedia: typeof window.matchMedia;
        beforeEach(() => {
            ({ matchMedia } = window);
            vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        });
        afterEach(() => {
            vi.useRealTimers();
            window.matchMedia = matchMedia;
        });

        it('sweeps the new colours across the dots from the top-left corner, then leaves no delay on any dot', () => {
            const { container } = renderMap();
            fireEvent.click(screen.getByRole('radio', { name: 'Role' }));
            const during = drawing(container);
            expect(during.dots).toHaveLength(38);
            // Each dot waits for the sweep to reach it on screen
            expect(during.delays).toEqual(
                during.dots.map(
                    (dot) =>
                        `${getSweepDelay(
                            {
                                x: Number(dot.getAttribute('cx')),
                                y: Number(dot.getAttribute('cy')),
                            },
                            during.area,
                        )}ms`,
                ),
            );
            expect(new Set(during.delays).size).toBeGreaterThan(1);
            expect(during.fade).toBe('380ms');
            expect(during.band).not.toBeNull();

            vi.advanceTimersByTime(1500);
            const after = drawing(container);
            expect(after.delays.every((delay) => delay === '')).toBe(true);
            expect(after.fade).toBe('');
            expect(after.band).toBeNull();
            expect(
                container.querySelector('svg[role="img"] [data-dot="viewer"]'),
            ).not.toBeNull();
        });

        it('changes the colours at once for people who prefer reduced motion', () => {
            window.matchMedia = vi.fn().mockImplementation((query: string) => ({
                matches: query === '(prefers-reduced-motion: reduce)',
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })) as unknown as typeof window.matchMedia;
            const { container } = renderMap();
            fireEvent.click(screen.getByRole('radio', { name: 'Role' }));
            const { delays, fade, band } = drawing(container);
            expect(delays.every((delay) => delay === '')).toBe(true);
            expect(fade).toBe('');
            expect(band).toBeNull();
            expect(
                container.querySelector('svg[role="img"] [data-dot="viewer"]'),
            ).not.toBeNull();
        });

        it('ends the sweep at once when a person is selected during it, so the selection shows straight away', () => {
            loadMembers('Finance', [
                memberFixture('ada', new Date().toISOString(), {
                    isActive30d: true,
                    firstName: 'Ada',
                    lastName: 'Lovelace',
                    departmentUuid: 'Finance',
                    departmentName: 'Finance',
                }),
                memberFixture('grace', null, {
                    firstName: 'Grace',
                    lastName: 'Hopper',
                    departmentUuid: 'Finance',
                    departmentName: 'Finance',
                }),
            ]);
            const { container } = renderMap();
            fireEvent.click(screen.getByRole('button', { name: /^Finance,/ }));
            fireEvent.click(screen.getByRole('radio', { name: 'Role' }));
            expect(
                drawing(container).delays.some((delay) => delay !== ''),
            ).toBe(true);
            fireEvent.click(
                screen.getByRole('button', { name: 'Grace Hopper' }),
            );
            const { delays, fade, band } = drawing(container);
            expect(delays.every((delay) => delay === '')).toBe(true);
            expect(fade).toBe('');
            expect(band).toBeNull();
            expect(
                container.querySelectorAll('svg[role="img"] [data-selected]'),
            ).toHaveLength(1);
        });

        it('animates nothing else that changes the dots: zooming, new numbers or opening a department', () => {
            const { container, rerender } = renderMap();
            const isStill = () => {
                const { delays, fade, band } = drawing(container);
                return (
                    delays.every((delay) => delay === '') &&
                    fade === '' &&
                    band === null
                );
            };
            const viewport = () =>
                container
                    .querySelector('svg[role="img"] > g')
                    ?.getAttribute('transform');
            const fitted = viewport();
            fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
            expect(viewport()).not.toBe(fitted);
            expect(isStill()).toBe(true);
            rerender(
                <MemoryRouter>
                    <AdoptionMap
                        summary={summary([
                            ...tree.slice(0, 3),
                            d('Finance', null, 8, 3, 3),
                        ])}
                        canManage
                        onEdit={vi.fn()}
                        measureText={estimateTextWidth}
                    />
                </MemoryRouter>,
            );
            expect(
                container.querySelectorAll(
                    'svg[role="img"] [data-dot="active"]',
                ),
            ).toHaveLength(7);
            expect(isStill()).toBe(true);
            fireEvent.click(screen.getByRole('button', { name: /^Ops,/ }));
            expect(
                screen.getByRole('heading', { name: 'Ops' }),
            ).toBeInTheDocument();
            expect(isStill()).toBe(true);
        });
    });
});
