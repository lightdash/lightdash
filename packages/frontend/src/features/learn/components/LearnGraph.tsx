import { Badge, Group, Paper, Progress, Text } from '@mantine-8/core';
import type { FC } from 'react';
import {
    CARD_H,
    CARD_W,
    cardState,
    graphLayout,
    PAD,
    type CardState,
    type PathModel,
    type Rollup,
} from '../model';
import classes from './LearnGraph.module.css';

const EDGE_COLOR: Record<CardState, string> = {
    done: 'var(--mantine-color-green-5)',
    current: 'var(--mantine-color-violet-5)',
    open: 'var(--mantine-color-ldGray-4)',
};

const STATE_LABEL: Record<CardState, string> = {
    done: 'Complete',
    current: 'In progress',
    open: 'Not started',
};

const STATE_COLOR: Record<CardState, string> = {
    done: 'green',
    current: 'violet',
    open: 'gray',
};

type Props = {
    path: PathModel;
    rollups: Map<string, Rollup>;
    pathColor: string;
    pathTitle: string;
    onOpenCourse: (courseId: string) => void;
};

export const LearnGraph: FC<Props> = ({
    path,
    rollups,
    pathColor,
    pathTitle,
    onOpenCourse,
}) => {
    const layout = graphLayout(path);
    const nodeById = new Map(layout.nodes.map((n) => [n.entry.id, n]));

    return (
        <div className={classes.canvas}>
            <div
                style={{
                    position: 'relative',
                    width: layout.width,
                    height: layout.height,
                }}
            >
                {path.foundations.length > 0 && (
                    <Text
                        className={classes.overline}
                        style={{ left: PAD }}
                        c="blue.6"
                    >
                        Foundations
                    </Text>
                )}
                {path.courses.length > 0 && (
                    <Text
                        className={classes.overline}
                        style={{ left: layout.pathLeft }}
                        c={pathColor}
                    >
                        {pathTitle} path
                    </Text>
                )}
                <svg
                    width={layout.width}
                    height={layout.height}
                    style={{ position: 'absolute', inset: 0 }}
                >
                    {layout.edges.map((edge) => {
                        const from = nodeById.get(edge.from);
                        const to = nodeById.get(edge.to);
                        if (!from || !to) return null;
                        const state = cardState(rollups.get(edge.to));
                        const x1 = from.x + CARD_W;
                        const y1 = from.y + CARD_H / 2;
                        const x2 = to.x;
                        const y2 = to.y + CARD_H / 2;
                        const pull = 0.55 * (x2 - x1);
                        return (
                            <path
                                key={`${edge.from}-${edge.to}`}
                                d={`M ${x1} ${y1} C ${x1 + pull} ${y1}, ${
                                    x2 - pull
                                } ${y2}, ${x2} ${y2}`}
                                fill="none"
                                stroke={EDGE_COLOR[state]}
                                strokeWidth={state === 'open' ? 1.5 : 2}
                                strokeLinecap="round"
                            />
                        );
                    })}
                </svg>
                {layout.nodes.map(({ entry, x, y }) => {
                    const state = cardState(rollups.get(entry.id));
                    const rollup = rollups.get(entry.id);
                    const lessonsDone = rollup?.lessonsCompleted.size ?? 0;
                    const pct =
                        state === 'done'
                            ? 100
                            : entry.lessonCount === 0
                              ? 0
                              : Math.round(
                                    (lessonsDone / entry.lessonCount) * 100,
                                );
                    return (
                        <Paper
                            key={entry.id}
                            className={classes.node}
                            style={{ left: x, top: y, minHeight: CARD_H }}
                            withBorder
                            radius="md"
                            p="sm"
                            role="link"
                            tabIndex={0}
                            onClick={() => onOpenCourse(entry.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onOpenCourse(entry.id);
                                }
                            }}
                        >
                            <Group justify="space-between" wrap="nowrap" mb={4}>
                                <Text size="sm" fw={600} lineClamp={2}>
                                    {entry.title}
                                </Text>
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color={STATE_COLOR[state]}
                                >
                                    {STATE_LABEL[state]}
                                </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                                {entry.lessonCount} lessons
                                {entry.durationMinutes !== null
                                    ? ` · ${entry.durationMinutes} min`
                                    : ''}
                            </Text>
                            <Progress
                                value={pct}
                                size="xs"
                                mt={8}
                                color={STATE_COLOR[state]}
                            />
                        </Paper>
                    );
                })}
            </div>
        </div>
    );
};
