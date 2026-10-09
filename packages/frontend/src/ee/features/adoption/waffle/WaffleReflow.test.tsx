import {
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import type * as ColourTransitionModule from '../map/colourTransition';
import mapStyles from '../map/DepartmentMap.module.css';
import {
    dept,
    metricsFixture,
    withServerHeadcounts,
} from '../utils/adoptionFixtures';
import { WaffleView } from './WaffleView';

// The waffle as it is drawn when the constant is switched to reflow
vi.mock('../map/colourTransition', async (importOriginal) => ({
    ...(await importOriginal<typeof ColourTransitionModule>()),
    COLOUR_TRANSITION: 'reflow',
}));

// Twelve people: ten on Lightdash, the first four active; five admins and five viewers, spread through them
const team: DepartmentWithMetrics = dept('Team', null, null, {
    headcount: 12,
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

// The departments with their effective headcounts as the server works them out
const summaryOf = (
    departments: DepartmentWithMetrics[],
): OrganizationAdoptionSummary => ({
    organization: metricsFixture(0, null),
    departments: withServerHeadcounts(departments),
    attention: { conflictCount: 0, unassignedCount: 0 },
});

// A department of `headcount` people, half of them on Lightdash: two in five of those active, half of them admins
const crowd = (headcount: number): DepartmentWithMetrics => {
    const members = Math.floor(headcount / 2);
    const admins = Math.floor(members / 2);
    return dept('Crowd', null, null, {
        headcount,
        metrics: metricsFixture(members, null, {
            activeCount30d: Math.floor((members * 2) / 5),
            activeCount12w: Math.floor((members * 2) / 5),
            roleSplit: {
                admins,
                editors: 0,
                interactiveViewers: 0,
                viewers: members - admins,
            },
        }),
    });
};

const renderWaffle = (departments: DepartmentWithMetrics[]) =>
    renderWithProviders(
        <MemoryRouter>
            <WaffleView
                summary={summaryOf(departments)}
                canManage
                onEdit={vi.fn()}
            />
        </MemoryRouter>,
    );

const board = () =>
    screen.getByRole('group', { name: 'Departments in the waffle' });

describe('WaffleView with the reflow transition', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('glides a square whose group changed to its new place, keeping its element, with no band', () => {
        const { container } = renderWaffle([team]);
        const part = container.querySelector('[data-squares="own:Team"]');
        if (part === null) throw new Error('Team is not drawn');
        // One element per person in their own order, then the two without an account
        const squares = [...part.children] as HTMLElement[];
        expect(squares).toHaveLength(12);
        const places = squares.map((square) => square.style.transform);
        expect(squares.map((square) => square.dataset.kind)).toEqual([
            ...Array(4).fill('active'),
            ...Array(6).fill('idle'),
            'noAccount',
            'noAccount',
        ]);

        fireEvent.click(screen.getByRole('radio', { name: 'Role' }));

        // The same elements in the same order: only their places and colours change
        expect(
            [...part.children].every(
                (element, index) => element === squares[index],
            ),
        ).toBe(true);
        // The seventh person, an admin who was not active, moves from the seventh place to the fourth after
        // 0.3 ms for each place before their old one
        expect(squares[6].dataset.kind).toBe('admin');
        expect(squares[6].style.transform).toBe(places[3]);
        expect(squares[6].style.transitionDelay).toBe('2ms');
        // The second person, an active viewer, moves back to the sixth place
        expect(squares[1].dataset.kind).toBe('viewer');
        expect(squares[1].style.transform).toBe(places[5]);
        // The first person stays first, and the people without an account stay last
        expect(squares[0].style.transform).toBe(places[0]);
        expect(squares[11].style.transform).toBe(places[11]);

        expect(board().style.getPropertyValue('--colour-move')).toBe('640ms');
        expect(board().style.getPropertyValue('--colour-fade')).toBe('380ms');
        expect(container.querySelector(`.${mapStyles.sweepBand}`)).toBeNull();

        // The last square, eleven places in, starts 3 ms late and glides for 640 ms
        vi.advanceTimersByTime(3 + 639);
        expect(board().style.getPropertyValue('--colour-move')).toBe('640ms');
        vi.advanceTimersByTime(1);
        expect(
            squares.every((square) => square.style.transitionDelay === ''),
        ).toBe(true);
        expect(board().style.getPropertyValue('--colour-move')).toBe('');
        expect(board().style.getPropertyValue('--colour-fade')).toBe('');
    });

    it('still reflows with exactly 2,000 squares in view', () => {
        const { container } = renderWaffle([crowd(2000)]);
        const part = container.querySelector('[data-squares="own:Crowd"]');
        if (part === null) throw new Error('Crowd is not drawn');
        const squares = [...part.children] as HTMLElement[];
        expect(squares).toHaveLength(2000);
        const places = squares.map((square) => square.style.transform);
        fireEvent.click(screen.getByRole('radio', { name: 'Role' }));
        expect(board().style.getPropertyValue('--colour-move')).toBe('640ms');
        expect(container.querySelector(`.${mapStyles.sweepBand}`)).toBeNull();
        expect(
            squares.some(
                (square, index) => square.style.transform !== places[index],
            ),
        ).toBe(true);
    });

    it('sweeps instead above 2,000 squares in view, so every place keeps its square and nothing glides', () => {
        const { container } = renderWaffle([crowd(2001)]);
        const part = container.querySelector('[data-squares="own:Crowd"]');
        if (part === null) throw new Error('Crowd is not drawn');
        const squares = [...part.children] as HTMLElement[];
        expect(squares).toHaveLength(2001);
        const places = squares.map((square) => square.style.transform);
        const kinds = squares.map((square) => square.dataset.kind);
        fireEvent.click(screen.getByRole('radio', { name: 'Role' }));
        // The same elements in the same places, only their colours changed
        expect(
            [...part.children].every(
                (element, index) => element === squares[index],
            ),
        ).toBe(true);
        expect(squares.map((square) => square.style.transform)).toEqual(places);
        expect(
            squares.some(
                (square, index) => square.dataset.kind !== kinds[index],
            ),
        ).toBe(true);
        expect(board().style.getPropertyValue('--colour-move')).toBe('');
        expect(board().style.getPropertyValue('--colour-fade')).toBe('380ms');
        expect(
            container.querySelector(`.${mapStyles.sweepBand}`),
        ).not.toBeNull();
    });
});
