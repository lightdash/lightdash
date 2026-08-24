// Role badge rollup. Twin: lightdash-university academy/board/badges.ts.
// A change here lands in both repositories in the same piece of work.

import { type LearnCatalogueEntry } from '@lightdash/common';

/**
 * One badge per role, not per module: a role badge is the honest summary of a
 * course, and a shelf of per-module tiles only repeated the board underneath it.
 *
 * The badge sits at the WEAKEST held module, which is what makes it worth more
 * than the modules it contains: gold means every module the role holds is gold.
 * Per-module tiers are server-derived (docs/badges-contract.md); this is a
 * client-side rollup over them, and it never invents a rung the server did not
 * grant. A module the role does not hold is not in `held` at all, so role growth
 * can lower the badge but never revokes a module's own tier.
 */
export type Rung = 'locked' | 'bronze' | 'silver' | 'gold' | 'violet';

export const RUNG_LADDER: Rung[] = [
    'locked',
    'bronze',
    'silver',
    'gold',
    'violet',
];

const rank = (rung: Rung): number => RUNG_LADDER.indexOf(rung);

export type RoleBadge = {
    /** Where the role stands now. */
    rung: Rung;
    /** The rung being worked toward, null once everything is violet. */
    nextRung: Rung | null;
    /** Held modules already at or above `nextRung`. */
    at: number;
    /** Held modules in total. */
    of: number;
};

export const roleBadge = (
    held: LearnCatalogueEntry[],
    tiers: Map<string, Rung>,
): RoleBadge => {
    const of = held.length;
    const earned = held.map((entry) => tiers.get(entry.id) ?? 'locked');
    // A role with no modules is locked rather than violet: nothing was earned.
    const rung =
        earned.length === 0
            ? 'locked'
            : RUNG_LADDER[Math.min(...earned.map(rank))];
    const nextRung = rung === 'violet' ? null : RUNG_LADDER[rank(rung) + 1];
    if (nextRung === null) return { rung, nextRung: null, at: of, of };
    return {
        rung,
        nextRung,
        at: earned.filter((tier) => rank(tier) >= rank(nextRung)).length,
        of,
    };
};
