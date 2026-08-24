import {
    type LearnBadgeTier,
    type LearnCatalogueEntry,
    type ProjectMemberRole,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { type Rollup } from '../../model';
import { GROUP_LABEL, plural, type RailModel } from '../model';
import styles from './LearnBoard.module.css';
import { ModulePane } from './ModulePane';
import { RoleBadgeCard } from './RoleBadgeCard';

type Props = {
    rail: RailModel;
    rollups: Map<string, Rollup>;
    role: ProjectMemberRole;
    heldEntries: LearnCatalogueEntry[];
    tiers: Map<string, LearnBadgeTier> | null;
    tiersLoading: boolean;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onClearSelection: () => void;
    onOpen: (courseId: string) => void;
};

export const BoardRail: FC<Props> = ({
    rail,
    rollups,
    role,
    heldEntries,
    tiers,
    tiersLoading,
    selectedId,
    onSelect,
    onClearSelection,
    onOpen,
}) => {
    // Completion is never revoked by a role change, so a Completed row can
    // name a module absent from `rail.mine` once the held role changes.
    const selected = selectedId
        ? ([...rail.mine, ...rail.completed].find(
              (m) => m.entry.id === selectedId,
          ) ?? null)
        : null;

    return (
        <aside className={styles.rail}>
            <Stack gap={8}>
                <span className={styles.overline}>Overall</span>
                <span className={styles.bigPct}>{rail.overall.pct}%</span>
                <div className={`${styles.bar} ${styles.barLg}`}>
                    <div
                        className={styles.barFill}
                        style={{ width: `${rail.overall.pct}%` }}
                    />
                </div>
                <Text size="xs" className={styles.muted}>
                    {rail.overall.doneLessons} of{' '}
                    {plural(rail.overall.totalLessons, 'lesson')} ·{' '}
                    {plural(rail.overall.modulesComplete, 'module')} complete
                </Text>
            </Stack>

            <RoleBadgeCard
                role={role}
                held={heldEntries}
                tiers={tiers}
                isLoading={tiersLoading}
            />

            {selected ? (
                <ModulePane
                    module={selected}
                    rollup={rollups.get(selected.entry.id)}
                    onClose={onClearSelection}
                    onOpen={onOpen}
                />
            ) : (
                <>
                    <Stack gap={10}>
                        <span className={styles.overline}>
                            Pick up where you left off
                        </span>
                        {rail.queue.map((m) => {
                            const pct = Math.round(m.progress * 100);
                            return (
                                <button
                                    key={m.entry.id}
                                    type="button"
                                    className={styles.queueCard}
                                    onClick={() => onSelect(m.entry.id)}
                                >
                                    <Text size="sm" fw={600} component="span">
                                        {m.entry.title}
                                    </Text>
                                    <span
                                        className={`${styles.bar} ${styles.barSm}`}
                                    >
                                        <span
                                            className={styles.barFill}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </span>
                                    <Text
                                        size="xs"
                                        component="span"
                                        className={styles.muted}
                                    >
                                        {m.progress > 0
                                            ? `${pct}% · ${m.lessonsDone} of ${plural(m.entry.lessonCount, 'lesson')}`
                                            : `${plural(m.entry.lessonCount, 'lesson')} · not started`}
                                    </Text>
                                </button>
                            );
                        })}
                        {rail.queue.length === 0 && (
                            <Text size="sm" className={styles.muted}>
                                Nothing to resume
                            </Text>
                        )}
                    </Stack>

                    {rail.completed.length > 0 && (
                        <Stack gap={8}>
                            <span className={styles.overline}>Completed</span>
                            {rail.completed.map((m) => (
                                <button
                                    key={m.entry.id}
                                    type="button"
                                    className={styles.completedRow}
                                    onClick={() => onSelect(m.entry.id)}
                                >
                                    <span className={styles.checkDisc}>✓</span>
                                    <Stack gap={2} component="span">
                                        <Text
                                            size="sm"
                                            fw={500}
                                            component="span"
                                        >
                                            {m.entry.title}
                                        </Text>
                                        <Text
                                            size="xs"
                                            component="span"
                                            className={styles.muted}
                                        >
                                            {plural(
                                                m.entry.lessonCount,
                                                'lesson',
                                            )}{' '}
                                            · {GROUP_LABEL[m.group]}
                                        </Text>
                                    </Stack>
                                </button>
                            ))}
                        </Stack>
                    )}
                </>
            )}
        </aside>
    );
};
