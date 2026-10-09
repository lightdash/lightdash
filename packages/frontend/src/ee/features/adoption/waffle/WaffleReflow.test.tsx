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
import { dept, metricsFixture } from '../utils/adoptionFixtures';
import { WaffleView } from './WaffleView';

// The waffle as it is drawn when the constant is switched to reflow
vi.mock('../map/colourTransition', async (importOriginal) => ({
    ...(await importOriginal<typeof ColourTransitionModule>()),
    COLOUR_TRANSITION: 'reflow',
}));

// Twelve people: ten on Lightdash, the first four active; five admins and five viewers, spread through them
const team: DepartmentWithMetrics = dept('Team', null, null, {
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

const summary: OrganizationAdoptionSummary = {
    organization: metricsFixture(0, null),
    departments: [team],
    attention: { conflictCount: 0, unassignedCount: 0 },
};

describe('WaffleView with the reflow transition', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('glides a square whose group changed to its new place, keeping its element, with no band', () => {
        const { container } = renderWithProviders(
            <MemoryRouter>
                <WaffleView summary={summary} canManage onEdit={vi.fn()} />
            </MemoryRouter>,
        );
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

        const board = screen.getByRole('group', {
            name: 'Departments in the waffle',
        });
        expect(board.style.getPropertyValue('--colour-move')).toBe('640ms');
        expect(board.style.getPropertyValue('--colour-fade')).toBe('380ms');
        expect(container.querySelector(`.${mapStyles.sweepBand}`)).toBeNull();

        // The last square, eleven places in, starts 3 ms late and glides for 640 ms
        vi.advanceTimersByTime(3 + 639);
        expect(board.style.getPropertyValue('--colour-move')).toBe('640ms');
        vi.advanceTimersByTime(1);
        expect(
            squares.every((square) => square.style.transitionDelay === ''),
        ).toBe(true);
        expect(board.style.getPropertyValue('--colour-move')).toBe('');
        expect(board.style.getPropertyValue('--colour-fade')).toBe('');
    });
});
