import { Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useLearnCourse } from '../../hooks';
import { type Rollup } from '../../model';
import { lessonVisible, manifestScopeKnown } from '../../visibility';
import {
    ctaLabel,
    GROUP_LABEL,
    heldBy,
    isUnlocked,
    parseScopeTag,
    plural,
    ROLE_LABEL,
    scopePermits,
    type BoardModule,
} from '../model';
import styles from './LearnBoard.module.css';

type Props = {
    module: BoardModule;
    /** The scope names the selected role holds (CS-169 lesson filtering). */
    held: string[];
    rollup: Rollup | undefined;
    onClose: () => void;
    onOpen: (courseId: string) => void;
};

export const ModulePane: FC<Props> = ({
    module,
    held,
    rollup,
    onClose,
    onOpen,
}) => {
    const { entry, progress, group, done: moduleComplete } = module;
    const course = useLearnCourse(entry.id);
    const pct = Math.round(progress * 100);
    const holders = heldBy(entry).map((role) => ROLE_LABEL[role]);
    const permits = scopePermits(entry);
    const done = rollup?.lessonsCompleted ?? new Set<string>();
    // CS-169: a held scope-group module lists only the lessons the selected
    // role can see, matching the effective lessonCount the panel mapped in. A
    // module the role does NOT hold (a completed row from another role) still
    // describes the whole module, so its list stays unfiltered.
    const lessons = (course.data?.lessons ?? []).filter(
        (lesson) =>
            !isUnlocked(entry, held) ||
            lessonVisible(lesson.scope, held, manifestScopeKnown),
    );

    return (
        <Stack gap={16}>
            <Group justify="space-between" align="flex-start" gap={12}>
                <Stack gap={6}>
                    <span className={styles.overline}>
                        {GROUP_LABEL[group]}
                    </span>
                    <h3 className={styles.paneTitle}>{entry.title}</h3>
                </Stack>
                <button
                    type="button"
                    className={styles.closeButton}
                    aria-label="Close"
                    onClick={onClose}
                >
                    ×
                </button>
            </Group>

            <Stack gap={6}>
                <div className={`${styles.bar} ${styles.barMd}`}>
                    <div
                        className={styles.barFill}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <Text size="xs" className={styles.muted}>
                    {moduleComplete ? 'Complete' : `${pct}% complete`}
                </Text>
            </Stack>

            {entry.scope !== null && (
                <Stack gap={6}>
                    <span className={styles.scopeChip}>
                        {parseScopeTag(entry.scope).base}
                    </span>
                    {permits && (
                        <Text size="sm" className={styles.muted}>
                            {permits}
                        </Text>
                    )}
                    <Text size="xs" className={styles.muted}>
                        Held by{' '}
                        {holders.length
                            ? holders.join(', ')
                            : 'custom roles only'}
                    </Text>
                </Stack>
            )}

            <Stack gap={8}>
                {course.isError && (
                    <Text size="sm" className={styles.muted}>
                        Lessons unavailable
                    </Text>
                )}
                {course.isLoading && !course.isError && (
                    <Text size="sm" className={styles.muted}>
                        Loading lessons…
                    </Text>
                )}
                {lessons.map((lesson, i) => {
                    const finished = moduleComplete || done.has(lesson.id);
                    return (
                        <div key={lesson.id} className={styles.lessonRow}>
                            <span
                                className={`${styles.lessonDisc} ${finished ? styles.lessonDiscDone : styles.lessonDiscPending}`}
                            >
                                {finished ? '✓' : ''}
                            </span>
                            <span
                                className={
                                    finished
                                        ? styles.lessonLabelDone
                                        : styles.lessonLabel
                                }
                            >
                                {String(i + 1).padStart(2, '0')} {lesson.title}
                            </span>
                        </div>
                    );
                })}
            </Stack>

            <button
                type="button"
                className={styles.cta}
                onClick={() => onOpen(entry.id)}
            >
                {ctaLabel(moduleComplete, progress)}
            </button>
            <Text size="xs" className={styles.muted}>
                {plural(entry.lessonCount, 'lesson')}
            </Text>
        </Stack>
    );
};
