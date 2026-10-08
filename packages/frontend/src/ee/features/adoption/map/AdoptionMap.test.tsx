import {
    type DepartmentMember,
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import {
    dept,
    memberFixture,
    metricsFixture,
    seededOrganization,
} from '../utils/adoptionFixtures';
import { AdoptionMap } from './AdoptionMap';
import { estimateTextWidth } from './mapLayout';

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
        effectiveHeadcount: headcount,
        metrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active,
            coveragePct:
                headcount === null
                    ? null
                    : Math.round((100 * members) / headcount),
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
): OrganizationAdoptionSummary => ({
    organization: metricsFixture(12, null, { activeCount30d: 6 }),
    departments,
    attention: { conflictCount: 1, unassignedCount: 2 },
});

const renderMap = (
    departments: DepartmentWithMetrics[] = tree,
    { canManage = true, onEdit = vi.fn() } = {},
) =>
    renderWithProviders(
        <MemoryRouter>
            <AdoptionMap
                summary={summary(departments)}
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
        .map((item) => {
            const [label, count] = within(item)
                .getAllByText(/.+/)
                .map((node) => node.textContent ?? '');
            return { label, count: Number(count.replace(/,/g, '')) };
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
                name: /^Map of the organization: 2 departments, 38 people, 12 on Lightdash, 6 active in the last 30 days\./,
            }),
        ).toBeInTheDocument();
    });

    it('draws one circle per department and one dot per person', () => {
        const { container } = renderMap();
        expect(container.querySelectorAll('[data-department]')).toHaveLength(4);
        // Stores 20 + Depots 10 + Finance 8
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(38 + 3);
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

    it('ranks the cards among the departments at the current level only', async () => {
        renderMap();
        // Ops rolls up its children, so it leads at the top level
        expect(screen.getByText('Ops: 4 of 30 active')).toBeInTheDocument();
        expect(screen.queryByText(/^Stores:/)).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: /^Ops,/ }));
        expect(screen.getByText('Stores: 4 of 20 active')).toBeInTheDocument();
        expect(screen.queryByText(/^Ops:/)).toBeNull();
        expect(screen.queryByText(/^Finance:/)).toBeNull();
        [
            'Biggest gap',
            'Furthest behind',
            'Most seats unused',
            'Unplaced people',
        ].forEach((title) =>
            expect(screen.getByText(title)).toBeInTheDocument(),
        );
        expect(screen.getByText('3 people')).toBeInTheDocument();
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
        ]);
        const { container } = renderMap();
        await userEvent.click(
            screen.getByRole('button', { name: /^Finance,/ }),
        );
        expect(
            [...container.querySelectorAll('svg[role="img"] text')].map(
                (node) => node.textContent,
            ),
        ).toEqual(expect.arrayContaining(['Ada', 'Grace']));
        // The department's one circle carries its own name
        expect(
            [...container.querySelectorAll('svg[role="img"] text')].map(
                (node) => node.textContent,
            ),
        ).toContain('Finance');
        expect(screen.queryByText(/Directly in/)).toBeNull();
        expect(legendCounts()).toEqual([
            { label: 'Active in 30 days', count: 1 },
            { label: 'Not active in 30 days', count: 1 },
            { label: 'No account', count: 6 },
        ]);
        await userEvent.click(
            screen.getByRole('button', { name: 'Grace Hopper' }),
        );
        expect(screen.getByText('grace@example.com')).toBeInTheDocument();
        expect(screen.getByText('No recorded activity')).toBeInTheDocument();
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

    it('hides person dots above 5,000 people and says so', () => {
        const { container } = renderMap([
            d('Everyone', null, 5001, 10, 5),
            d('Few', null, 4, 2, 1),
        ]);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(0);
        expect(container.querySelectorAll('[data-department]')).toHaveLength(2);
        expect(
            screen.getByText(/Dots are hidden above 5,000 people/),
        ).toBeInTheDocument();
        expect(
            legendCounts().reduce((sum, entry) => sum + entry.count, 0),
        ).toBe(5005);
        expect(
            screen.getByRole('img', {
                name: /Each circle is a department sized by headcount\. The List view/,
            }),
        ).toBeInTheDocument();
    });

    it('still draws dots at exactly 5,000 people', () => {
        const { container } = renderMap([d('Everyone', null, 5000, 10, 5)]);
        expect(
            container.querySelectorAll('svg[role="img"] [data-dot]'),
        ).toHaveLength(5000);
        expect(screen.queryByText(/Dots are hidden/)).toBeNull();
    });

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
                    name: /^Map of Operations: 3 sub-departments, 40 people/,
                }),
            ).toBeInTheDocument();
            expect(
                departmentControls()
                    .map((control) => control.textContent?.replace(/,.*/, ''))
                    .sort(),
            ).toEqual(['Depots', 'North', 'Stores']);
            // The cards now compare the sub-departments of Operations
            expect(
                screen.getByText('Stores: 0 of 22 active'),
            ).toBeInTheDocument();
            expect(screen.queryByText(/^Supply chain:/)).toBeNull();
        };

        it('starts on the whole organization', () => {
            renderMap(seededOrganization());
            expect(
                screen.getByText('Supply chain: 0 of 80 active'),
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
                screen.getByRole('heading', { name: 'All departments' }),
            ).toBeInTheDocument();
            expect(document.activeElement).toHaveTextContent('All departments');
            // Nothing above the organization
            await userEvent.keyboard('{Escape}');
            expect(
                screen.getByRole('heading', { name: 'All departments' }),
            ).toBeInTheDocument();
        });

        it('leaves focus where it was when a department is opened with the pointer', async () => {
            const { container } = renderMap(seededOrganization());
            const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
            // A card under the map: moving focus to the breadcrumb would scroll the page up
            await userEvent.click(
                screen.getByText('Supply chain: 0 of 80 active'),
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
                screen.getByRole('heading', { name: 'All departments' }),
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

    it('lists departments lowest coverage first, the biggest first among equals', () => {
        renderMap(seededOrganization());
        const rows = within(
            screen.getByRole('complementary', { name: 'Details' }),
        ).getAllByRole('button');
        expect(rows.map((row) => row.textContent?.replace(/\d.*/, ''))).toEqual(
            [
                'Supply chain',
                'Marketing',
                'Finance',
                'Operations',
                'Data',
                'Product',
            ],
        );
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
        renderMap([d('Everyone', null, 5001, 10, 5), d('Few', null, 4, 2, 1)]);
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
});
