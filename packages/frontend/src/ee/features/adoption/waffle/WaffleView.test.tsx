import {
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import mapStyles from '../map/DepartmentMap.module.css';
import { type ColourBy } from '../map/geometry';
import { COLOUR_BY_LABELS, LEGEND_KINDS } from '../map/mapStyles';
import {
    deepOrganization,
    flatOrganization,
    smallCompany,
} from '../map/organizationFixtures';
import {
    dept,
    metricsFixture,
    seededOrganization,
} from '../utils/adoptionFixtures';
import { getSweepDelay } from '../utils/sweepDelay';
import type * as Layout from './layout';
import styles from './Waffle.module.css';
import { WaffleView } from './WaffleView';

// The real layout, watched to see which squares are drawn again
const { getSquareOffset } = vi.hoisted(() => ({ getSquareOffset: vi.fn() }));
vi.mock('./layout', async (importOriginal) => {
    const actual = await importOriginal<typeof Layout>();
    getSquareOffset.mockImplementation(actual.getSquareOffset);
    return { ...actual, getSquareOffset };
});

const summary = (
    departments: DepartmentWithMetrics[],
): OrganizationAdoptionSummary => ({
    organization: metricsFixture(0, null),
    departments,
    attention: { conflictCount: 0, unassignedCount: 0 },
});

const renderWaffle = (
    departments: DepartmentWithMetrics[],
    { canManage = true, onEdit = vi.fn() } = {},
) =>
    renderWithProviders(
        <MemoryRouter>
            <WaffleView
                summary={summary(departments)}
                canManage={canManage}
                onEdit={onEdit}
            />
        </MemoryRouter>,
    );

// A department with people on Lightdash, some active, and a headcount
const d = (
    name: string,
    parent: string | null,
    headcount: number,
    members: number,
    active: number,
) =>
    dept(name, parent, null, {
        headcount,
        effectiveHeadcount: Math.max(headcount, members),
        hasHeadcount: true,
        metrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active,
        }),
        directMetrics: metricsFixture(members, null, {
            activeCount30d: active,
            activeCount12w: active,
        }),
    });

// Roles and 12-week activity spread over the people on Lightdash, so every colouring draws every kind
const withEveryKind = (
    departments: DepartmentWithMetrics[],
): DepartmentWithMetrics[] => {
    const spread = (metrics: DepartmentWithMetrics['metrics']) => {
        const members = metrics.memberCount;
        const admins = Math.round(members * 0.05);
        const editors = Math.round(members * 0.2);
        const interactiveViewers = Math.round(members * 0.25);
        return {
            ...metrics,
            activeCount12w: Math.min(
                members,
                Math.round(metrics.activeCount30d * 1.4),
            ),
            roleSplit: {
                admins,
                editors,
                interactiveViewers,
                viewers: members - admins - editors - interactiveViewers,
            },
        };
    };
    return departments.map((department) => ({
        ...department,
        metrics: spread(department.metrics),
        directMetrics: spread(department.directMetrics),
    }));
};

const blockNames = (container: HTMLElement) =>
    [...container.querySelectorAll(`.${styles.blockButton}`)].map((button) =>
        button.getAttribute('aria-label'),
    );

const drawnSquares = (container: Element, kind?: string) =>
    container.querySelectorAll(
        kind === undefined
            ? `.${styles.square}`
            : `.${styles.square}[data-kind="${kind}"]`,
    );

const legendCounts = () =>
    within(screen.getByRole('list', { name: 'Legend' }))
        .getAllByRole('listitem')
        .map((item) => {
            const [label, count] = within(item)
                .getAllByText(/.+/)
                .map((node) => node.textContent ?? '');
            return { label, count: Number(count.replace(/,/g, '')) };
        });

const panel = () => screen.getByRole('complementary', { name: 'Details' });

// Where each square is drawn in its part, reading left to right and then down
const readingOrder = (part: Element): string[] =>
    [...part.querySelectorAll<HTMLElement>(`.${styles.square}`)]
        .map((square) => {
            const [x, y] = (
                /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
                    square.style.transform,
                ) ?? []
            )
                .slice(1)
                .map(Number);
            return { x, y, kind: square.dataset.kind ?? '' };
        })
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((square) => square.kind);

describe('WaffleView', () => {
    beforeEach(() => {
        getSquareOffset.mockClear();
    });

    it('draws a block for every top-level department of the 6,000-headcount organization, largest first', () => {
        const { container } = renderWaffle(deepOrganization);
        expect(blockNames(container)).toEqual([
            'Operations, 221 of 2,350 on Lightdash, 126 active',
            'Commercial, 834 of 1,900 on Lightdash, 495 active',
            'Product & Engineering, 385 of 650 on Lightdash, 230 active',
            'Finance, 187 of 420 on Lightdash, 115 active',
            'People, 61 of 125 on Lightdash, 36 active',
            'Data & Analytics, 67 of 70 on Lightdash, 67 active',
            'Legal & Compliance, 0 of 60 on Lightdash, 0 active',
            'Executive Office, 8 of 12 on Lightdash, 7 active',
        ]);
        // Each block shows its name and counts line
        expect(
            screen.getByText('221 of 2,350 · 126 active'),
        ).toBeInTheDocument();
        // Sub-departments are buttons of their own, labelled where there is room
        expect(
            screen.getByRole('button', {
                name: 'Supply Chain, 170 of 1,750 on Lightdash, 96 active',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Supply Chain · 170 of 1,750'),
        ).toBeInTheDocument();
    });

    it('draws a block for every top-level department of the small organization, with a square for each person', () => {
        const { container } = renderWaffle(seededOrganization());
        expect(blockNames(container)).toEqual([
            'Supply chain, 0 of 80 on Lightdash, 0 active',
            'Marketing, 0 of 40 on Lightdash, 0 active',
            'Operations, 1 of 40 on Lightdash, 1 active',
            'Finance, 0 of 32 on Lightdash, 0 active',
            'Data, 1 of 9 on Lightdash, 1 active',
            'Product, 1 on Lightdash, 1 active',
        ]);
        expect(drawnSquares(container)).toHaveLength(80 + 40 + 40 + 32 + 9 + 1);
        expect(drawnSquares(container, 'active')).toHaveLength(3);
        expect(drawnSquares(container, 'noAccount')).toHaveLength(199);
    });

    it.each(['active', 'role', 'lastActive'] as ColourBy[])(
        'counts in the legend exactly the squares drawn of each kind when colouring by %s',
        async (colourBy) => {
            const { container } = renderWaffle(withEveryKind(flatOrganization));
            await userEvent.click(
                screen.getByRole('radio', { name: COLOUR_BY_LABELS[colourBy] }),
            );
            expect(drawnSquares(container)).toHaveLength(2339);
            expect(legendCounts().map((entry) => entry.count)).toEqual(
                LEGEND_KINDS[colourBy].map(
                    (kind) => drawnSquares(container, kind).length,
                ),
            );
            // Every kind is drawn, so none of the counts agree by being 0
            LEGEND_KINDS[colourBy].forEach((kind) =>
                expect(drawnSquares(container, kind).length).toBeGreaterThan(0),
            );
        },
    );

    it('gives the panel the same three numbers as the legend', () => {
        renderWaffle(flatOrganization);
        const [active, idle, noAccount] = legendCounts().map((entry) =>
            entry.count.toLocaleString('en-US'),
        );
        expect(
            within(panel())
                .getAllByText(
                    /^(Active|On Lightdash, not active|No account) [\d,]+$/,
                )
                .map((node) => node.textContent),
        ).toEqual([
            `Active ${active}`,
            `On Lightdash, not active ${idle}`,
            `No account ${noAccount}`,
        ]);
        expect(
            screen.getByText('Legend counts people placed in a department'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                'One square per person. Select a department to see its numbers',
            ),
        ).toBeInTheDocument();
    });

    it('draws a 33-person company as a band of 16 px squares in a waffle 160 px tall, at the 720 px it is drawn at here', () => {
        const { container } = renderWaffle(smallCompany);
        const canvas = screen.getByRole('group', {
            name: 'Departments in the waffle',
        }).parentElement;
        expect(canvas?.style.getPropertyValue('--waffle-height')).toBe('160px');
        const parts = [
            ...container.querySelectorAll<HTMLElement>('[data-squares]'),
        ];
        expect(parts).toHaveLength(4);
        parts.forEach((part) =>
            expect(part.style.getPropertyValue('--cell')).toBe('16px'),
        );
        expect(drawnSquares(container)).toHaveLength(33);
    });

    it('is as tall as its content rather than a fixed drawing', () => {
        renderWaffle(deepOrganization);
        const height = Number.parseFloat(
            screen
                .getByRole('group', { name: 'Departments in the waffle' })
                .parentElement?.style.getPropertyValue('--waffle-height') ?? '',
        );
        expect(height).toBeGreaterThan(160);
        expect(height).toBeLessThan(560);
    });

    it("groups each part's squares in legend order, so the part reads as a stacked bar", async () => {
        const { container } = renderWaffle(deepOrganization);
        const engineering = container.querySelector(
            '[data-squares="Engineering"]',
        );
        if (engineering === null) throw new Error('Engineering is not drawn');
        const isInLegendOrder = (kinds: string[], order: string[]) => {
            const ranks = kinds.map((kind) => order.indexOf(kind));
            return (
                ranks.every((rank) => rank >= 0) &&
                ranks.every(
                    (rank, index) => index === 0 || rank >= ranks[index - 1],
                )
            );
        };
        const byActivity = readingOrder(engineering);
        expect(byActivity).toHaveLength(452);
        expect(isInLegendOrder(byActivity, LEGEND_KINDS.active)).toBe(true);
        expect(new Set(byActivity)).toEqual(
            new Set(['active', 'idle', 'noAccount']),
        );
        await userEvent.click(
            screen.getByRole('radio', { name: 'Last active' }),
        );
        expect(
            isInLegendOrder(readingOrder(engineering), LEGEND_KINDS.lastActive),
        ).toBe(true);
    });

    it('colours by the same options as the map, with the same legend', async () => {
        const { container } = renderWaffle(deepOrganization);
        expect(screen.getByText('Color by')).toBeInTheDocument();
        expect(
            screen
                .getAllByRole('radio')
                .map((radio) => radio.getAttribute('value')),
        ).toEqual(['active', 'role', 'lastActive']);
        await userEvent.click(screen.getByRole('radio', { name: 'Role' }));
        expect(legendCounts().map((entry) => entry.label)).toEqual([
            'Admin',
            'Editor',
            'Interactive viewer',
            'Viewer',
            'No account',
        ]);
        // Everyone in the fixture is a viewer
        expect(drawnSquares(container, 'active')).toHaveLength(0);
        expect(drawnSquares(container, 'viewer').length).toBeGreaterThan(0);
    });

    it('selects a department from its block, as a click on its circle on the map does, and goes back from the breadcrumb', async () => {
        const { container } = renderWaffle(deepOrganization);
        expect(
            within(panel()).getByRole('heading', { name: 'Organization' }),
        ).toBeInTheDocument();
        const finance = screen.getByRole('button', { name: /^Finance,/ });
        await userEvent.click(finance);
        expect(
            within(panel()).getByRole('heading', { name: 'Finance' }),
        ).toBeInTheDocument();
        expect(within(panel()).getByText('Department')).toBeInTheDocument();
        expect(finance).toHaveAttribute('aria-current', 'true');
        expect(
            container.querySelector('[aria-current="location"]'),
        ).toHaveTextContent('Finance');
        await userEvent.click(
            screen.getByRole('button', { name: 'All departments' }),
        );
        expect(
            within(panel()).getByRole('heading', { name: 'Organization' }),
        ).toBeInTheDocument();
        expect(finance).not.toHaveAttribute('aria-current');
    });

    it('selects a sub-department from its part, with its parent beside it in the panel', async () => {
        renderWaffle(deepOrganization);
        const supplyChain = screen.getByRole('button', {
            name: /^Supply Chain,/,
        });
        await userEvent.click(supplyChain);
        expect(
            within(panel()).getByRole('heading', { name: 'Supply Chain' }),
        ).toBeInTheDocument();
        expect(within(panel()).getByText('Operations')).toBeInTheDocument();
        expect(supplyChain).toHaveAttribute('aria-current', 'true');
        expect(
            screen.getByRole('button', { name: /^Operations,/ }),
        ).not.toHaveAttribute('aria-current');
        // The breadcrumb leads back up through the parent
        await userEvent.click(
            screen.getByRole('button', { name: 'Operations' }),
        );
        expect(
            within(panel()).getByRole('heading', { name: 'Operations' }),
        ).toBeInTheDocument();
    });

    it('marks the part holding a department selected deeper from the panel, without calling the part current', async () => {
        renderWaffle(deepOrganization);
        const customerSuccess = screen.getByRole('button', {
            name: /^Customer Success,/,
        });
        await userEvent.click(customerSuccess);
        expect(customerSuccess).toHaveAttribute('aria-current', 'true');
        await userEvent.click(
            within(panel()).getByRole('button', { name: /^Support/ }),
        );
        expect(
            within(panel()).getByRole('heading', { name: 'Support' }),
        ).toBeInTheDocument();
        expect(customerSuccess).toHaveAttribute('data-selected');
        expect(customerSuccess).not.toHaveAttribute('aria-current');
        expect(
            screen.getByRole('button', { name: /^Commercial,/ }),
        ).not.toHaveAttribute('data-selected');
    });

    it('selects a department with the keyboard', async () => {
        renderWaffle(deepOrganization);
        screen.getByRole('button', { name: /^People,/ }).focus();
        await userEvent.keyboard('{Enter}');
        expect(
            within(panel()).getByRole('heading', { name: 'People' }),
        ).toBeInTheDocument();
    });

    it('selects a department from its row in the panel', async () => {
        renderWaffle(deepOrganization);
        await userEvent.click(
            within(panel()).getByRole('button', {
                name: /^Legal & Compliance/,
            }),
        );
        expect(
            screen.getByRole('button', { name: /^Legal & Compliance,/ }),
        ).toHaveAttribute('aria-current', 'true');
    });

    it("draws people directly in a department and a department's only part as part of its block, with no button of their own", () => {
        const { container } = renderWaffle(deepOrganization);
        const direct = container.querySelector(
            '[data-squares="own:Operations"]',
        )?.parentElement;
        expect(direct).toHaveAttribute('data-passive');
        expect(direct?.tagName).not.toBe('BUTTON');
        expect(
            screen.getByText('Directly in Operations · 2 of 345'),
        ).toBeInTheDocument();
        const only = container.querySelector(
            '[data-squares="own:Legal & Compliance"]',
        )?.parentElement;
        expect(only).toHaveAttribute('data-passive');
    });

    it("shows a block's full name and counts in a tooltip, and nothing about a person", async () => {
        const { container } = renderWaffle(deepOrganization);
        await userEvent.hover(
            screen.getByRole('button', { name: /^Product & Engineering,/ }),
        );
        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip).toHaveTextContent('Product & Engineering');
        expect(tooltip).toHaveTextContent('385 of 650 · 230 active');
        // Squares carry no name, title or role, and are hidden from screen readers
        const square = drawnSquares(container)[0];
        expect(square.getAttributeNames().sort()).toEqual([
            'class',
            'data-kind',
            'style',
        ]);
        expect(square.closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it('redraws no square when a department is selected', async () => {
        renderWaffle(deepOrganization);
        expect(getSquareOffset).toHaveBeenCalled();
        getSquareOffset.mockClear();
        await userEvent.click(
            screen.getByRole('button', { name: /^Finance,/ }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: /^Supply Chain,/ }),
        );
        expect(getSquareOffset).not.toHaveBeenCalled();
    });

    it('draws every part as a bar above 20,000 people and says so', () => {
        const { container } = renderWaffle([
            d('Everyone', null, 20000, 10, 5),
            d('One more', null, 1, 1, 1),
        ]);
        expect(drawnSquares(container)).toHaveLength(0);
        const bars = [...container.querySelectorAll(`.${styles.bar}`)];
        expect(bars).toHaveLength(2);
        // One segment per kind in legend order, as wide as its people, the people without an account last
        const segments = (bar: Element) =>
            [...bar.children].map((segment) => [
                (segment as HTMLElement).dataset.kind,
                (segment as HTMLElement).style.flexGrow,
            ]);
        expect(segments(bars[0])).toEqual([
            ['active', '5'],
            ['idle', '5'],
            ['noAccount', '19990'],
        ]);
        // Kinds nobody holds are left out
        expect(segments(bars[1])).toEqual([['active', '1']]);
        expect(
            screen.getByText(
                'Departments are drawn as bars above 20,000 people',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Each square is a person/)).toBeNull();
        expect(
            screen.getByText('Select a department to see its numbers'),
        ).toBeInTheDocument();
    });

    it('draws squares at exactly 20,000 people', () => {
        const { container } = renderWaffle([d('Everyone', null, 20000, 10, 5)]);
        expect(container.querySelectorAll(`.${styles.bar}`)).toHaveLength(0);
        expect(drawnSquares(container)).toHaveLength(20000);
        expect(screen.queryByText(/drawn as bars/)).toBeNull();
    });

    it('says so when there is nothing to draw', () => {
        // Two departments that are each other's parent sit under no top level
        renderWaffle([d('A', 'B', 10, 1, 1), d('B', 'A', 10, 1, 1)]);
        expect(
            screen.getByText('No people or headcount in this department yet'),
        ).toBeInTheDocument();
    });

    it('shows a name typed with markup as text', () => {
        const name = 'Ops "><img src=x onerror=alert(1)>';
        const { container } = renderWaffle([d(name, null, 10, 2, 1)]);
        expect(screen.getAllByText(name).length).toBeGreaterThan(0);
        expect(container.querySelector('img')).toBeNull();
    });

    describe('changing the colouring', () => {
        // The drawing the sweep crosses: the measured width and the height of the content
        const areaOf = () => ({
            width: 720,
            height: Number.parseFloat(
                screen
                    .getByRole('group', { name: 'Departments in the waffle' })
                    .parentElement?.style.getPropertyValue('--waffle-height') ??
                    '',
            ),
        });
        const varOf = (element: Element | null, name: string): number =>
            element instanceof HTMLElement
                ? Number.parseFloat(element.style.getPropertyValue(name))
                : Number.NaN;
        // The centre of a square in the drawing, from where its block, part and squares are placed
        const centreOf = (square: HTMLElement) => {
            const content = square.parentElement;
            const part = content?.parentElement ?? null;
            const block = square.closest(`.${styles.block}`);
            const [x, y] = (
                /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
                    square.style.transform,
                ) ?? []
            )
                .slice(1)
                .map(Number);
            const half = varOf(content, '--cell') / 2;
            return {
                x:
                    varOf(block, '--block-x') +
                    varOf(part, '--part-x') +
                    varOf(content, '--content-x') +
                    x +
                    half,
                y:
                    varOf(block, '--block-y') +
                    varOf(part, '--part-y') +
                    varOf(content, '--content-y') +
                    y +
                    half,
            };
        };
        const wave = (container: HTMLElement) => {
            const board = screen.getByRole('group', {
                name: 'Departments in the waffle',
            });
            const squares = [
                ...container.querySelectorAll<HTMLElement>(`.${styles.square}`),
            ];
            return {
                squares,
                delays: squares.map((square) => square.style.transitionDelay),
                fade: board.style.getPropertyValue('--colour-fade'),
                move: board.style.getPropertyValue('--colour-move'),
                band: container.querySelector(`.${mapStyles.sweepBand}`),
            };
        };
        const isStill = (container: HTMLElement) => {
            const { delays, fade, move, band } = wave(container);
            return (
                delays.every((delay) => delay === '') &&
                fade === '' &&
                move === '' &&
                band === null
            );
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

        it('sweeps the new colours across the squares from the top-left corner, then leaves no delay on any square', () => {
            const { container } = renderWaffle(flatOrganization);
            const before = wave(container).squares;
            fireEvent.click(screen.getByRole('radio', { name: 'Last active' }));
            const during = wave(container);
            expect(during.squares).toHaveLength(2339);
            // Every place keeps its element and only changes colour
            expect(
                during.squares.every(
                    (square, index) => square === before[index],
                ),
            ).toBe(true);
            // Each square waits for the sweep to reach its centre
            const area = areaOf();
            expect(area.height).toBeGreaterThan(160);
            expect(during.delays).toEqual(
                during.squares.map(
                    (square) => `${getSweepDelay(centreOf(square), area)}ms`,
                ),
            );
            expect(new Set(during.delays).size).toBeGreaterThan(100);
            expect(during.fade).toBe('380ms');
            expect(during.move).toBe('');
            expect(during.band).not.toBeNull();

            vi.advanceTimersByTime(1500);
            expect(isStill(container)).toBe(true);
            expect(drawnSquares(container, 'inactive').length).toBeGreaterThan(
                0,
            );
        });

        it("keeps every place's element under the sweep, so nobody moves and only the colours change", () => {
            // Five admins and five viewers spread through ten people, so colouring by role regroups them
            const team = dept('Team', null, null, {
                headcount: 12,
                effectiveHeadcount: 12,
                hasHeadcount: true,
                metrics: metricsFixture(10, null, {
                    activeCount30d: 4,
                    activeCount12w: 4,
                    roleSplit: {
                        admins: 5,
                        editors: 0,
                        interactiveViewers: 0,
                        viewers: 5,
                    },
                }),
            });
            const { container } = renderWaffle([team]);
            const part = container.querySelector('[data-squares="own:Team"]');
            if (part === null) throw new Error('Team is not drawn');
            const squares = [...part.children] as HTMLElement[];
            const places = squares.map((square) => square.style.transform);
            fireEvent.click(screen.getByRole('radio', { name: 'Role' }));
            expect(
                [...part.children].every(
                    (element, index) => element === squares[index],
                ),
            ).toBe(true);
            expect(squares.map((square) => square.style.transform)).toEqual(
                places,
            );
            expect(squares.map((square) => square.dataset.kind)).toEqual([
                ...Array(5).fill('admin'),
                ...Array(5).fill('viewer'),
                'noAccount',
                'noAccount',
            ]);
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
            const { container } = renderWaffle(flatOrganization);
            fireEvent.click(screen.getByRole('radio', { name: 'Last active' }));
            expect(isStill(container)).toBe(true);
            expect(drawnSquares(container, 'inactive').length).toBeGreaterThan(
                0,
            );
        });

        it('ends the sweep at once when new numbers arrive, and animates nothing else: new numbers, selection or hover', () => {
            const { container, rerender } = renderWaffle(seededOrganization());
            const redraw = (departments: DepartmentWithMetrics[]) =>
                rerender(
                    <MemoryRouter>
                        <WaffleView
                            summary={summary(departments)}
                            canManage
                            onEdit={vi.fn()}
                        />
                    </MemoryRouter>,
                );
            fireEvent.click(screen.getByRole('radio', { name: 'Role' }));
            expect(isStill(container)).toBe(false);
            const moreActive = seededOrganization().map((department) =>
                department.name === 'Data'
                    ? d('Data', null, 9, 5, 5)
                    : department,
            );
            redraw(moreActive);
            expect(isStill(container)).toBe(true);
            fireEvent.click(screen.getByRole('button', { name: /^Finance,/ }));
            fireEvent.mouseEnter(
                screen.getByRole('button', { name: /^Marketing,/ }),
            );
            redraw(seededOrganization());
            expect(isStill(container)).toBe(true);
        });
    });
});
