// Badge card copy over the copied badges.ts.
// Shared by the in-app Learn section and learn.lightdash.com via @lightdash/learn-ui.

import { type LearnBadgeTier } from '../types';
import { RUNG_LADDER, type RoleBadge } from './badges';
import { plural } from './model';

/** The copied ladder, named against the published tier union. */
export type BadgeRung = 'locked' | LearnBadgeTier;

export const RUNG_WORD: Record<BadgeRung, string> = {
    locked: 'Locked',
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    violet: 'Violet',
};

// What earns the next rung, so a locked badge is a goal rather than a blank.
const RUNG_HINT: Record<BadgeRung, string> = {
    locked: '',
    bronze: 'Finish every module for bronze',
    silver: 'Pass every quiz for silver',
    gold: 'Score 90%+ on every quiz for gold',
    violet: 'Ace every quiz for violet',
};

/** The full ladder, so a learner can read what each rung takes. */
export const RUNG_REQ: Record<LearnBadgeTier, string> = {
    bronze: 'Finish every module',
    silver: 'Pass every quiz',
    gold: 'Score 90% or more on every quiz',
    violet: 'Ace every quiz (100%)',
};

/** The rungs a learner can earn, in ladder order: the copy owns the order. */
export const EARNABLE: LearnBadgeTier[] = RUNG_LADDER.filter(
    (rung): rung is LearnBadgeTier => rung !== 'locked',
);

/** Pending is not unavailable: an in-flight fetch says so and names no rung. */
export const BADGE_PENDING_DETAIL = 'Loading badges';

/**
 * The line under the rung word. A failed badges fetch is not "nothing earned":
 * saying Locked to a learner who holds gold reads as a revoked badge.
 */
export const badgeDetail = (badge: RoleBadge, available: boolean): string => {
    if (!available) return 'Badges unavailable right now';
    if (badge.nextRung === null) {
        return `All ${plural(badge.of, 'module')} at ${RUNG_WORD[
            badge.rung
        ].toLowerCase()}`;
    }
    return `${RUNG_HINT[badge.nextRung]} · ${badge.at} of ${badge.of} there`;
};
