import {
    type LearnBadgeTier,
    type LearnCatalogueEntry,
    type ProjectMemberRole,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { tierBadgeSvg } from '../badgeArt';
import { roleBadge } from '../badges';
import {
    BADGE_PENDING_DETAIL,
    badgeDetail,
    EARNABLE,
    RUNG_REQ,
    RUNG_WORD,
} from '../badgesView';
import { ROLE_LABEL } from '../model';
import styles from './LearnBoard.module.css';

export type RoleBadgeCardProps = {
    role: ProjectMemberRole;
    held: LearnCatalogueEntry[];
    /** Null when badges could not be loaded, which is not the same as none earned. */
    tiers: Map<string, LearnBadgeTier> | null;
    /** True while the badges query is in flight, which is not unavailable either. */
    isLoading: boolean;
};

export const RoleBadgeCard: FC<RoleBadgeCardProps> = ({
    role,
    held,
    tiers,
    isLoading,
}) => {
    // A role with nothing to learn has nothing to earn: no card rather than a
    // badge reading "0 of 0 there" beside the empty state.
    if (held.length === 0) return null;
    const badge = roleBadge(held, tiers ?? new Map());
    const detail = isLoading
        ? BADGE_PENDING_DETAIL
        : badgeDetail(badge, tiers !== null);

    return (
        <Stack gap={10}>
            <span className={styles.overline}>{ROLE_LABEL[role]} badge</span>
            <div className={styles.badgeHero}>
                {/* Local constant markup from badgeArt, never remote content. */}
                <span
                    className={styles.badgeEmblem}
                    dangerouslySetInnerHTML={{
                        __html: tierBadgeSvg(
                            isLoading ? 'locked' : badge.rung,
                            4,
                        ),
                    }}
                />
                <Stack gap={2}>
                    {!isLoading && (
                        <span className={styles.badgeRung}>
                            {RUNG_WORD[badge.rung]}
                        </span>
                    )}
                    <Text size="xs" className={styles.muted}>
                        {detail}
                    </Text>
                </Stack>
            </div>
            <details className={styles.badgeHowto}>
                <summary className={styles.badgeHowtoSummary}>
                    How badges work
                </summary>
                <ul className={styles.badgeHowtoList}>
                    {EARNABLE.map((rung) => (
                        <li key={rung} className={styles.badgeHowtoRung}>
                            <span
                                className={styles.badgeHowtoEmblem}
                                dangerouslySetInnerHTML={{
                                    __html: tierBadgeSvg(rung, 2),
                                }}
                            />
                            <b>{RUNG_WORD[rung]}</b>
                            <span className={styles.badgeHowtoReq}>
                                {RUNG_REQ[rung]}
                            </span>
                        </li>
                    ))}
                </ul>
            </details>
        </Stack>
    );
};
