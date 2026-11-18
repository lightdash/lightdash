import {
    Box,
    Group,
    Paper,
    Text,
    UnstyledButton,
    VisuallyHidden,
} from '@mantine/core';
import { IconTable } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { type ChangeKind } from './modelCode';
import { ISSUE_KINDS, type Issue } from './proposalIssues';
import { TaskIcon, type TaskState } from './TaskRow';
import classes from './TurnSummaryCard.module.css';

const GLYPHS: Record<ChangeKind, { glyph: string; word: string }> = {
    new: { glyph: '+', word: 'Added' },
    changed: { glyph: '~', word: 'Changed' },
    removed: { glyph: '−', word: 'Removed' },
};

/** One changed part of a model, linking to where it can be looked at. */
export type TurnRow = {
    id: string;
    change: ChangeKind;
    kind: string;
    label: string;
    detail: string | null;
    title: string;
    to: string;
};

export type TurnGroup = {
    model: string;
    title: string;
    subtitle: string | null;
    rows: TurnRow[];
    issues: Issue[];
};

export type Safety = { state: TaskState; text: string; why: string | null };

const Row: FC<{ row: TurnRow }> = ({ row }) => {
    const { glyph, word } = GLYPHS[row.change];
    return (
        <UnstyledButton
            component={Link}
            to={row.to}
            className={classes.row}
            data-change={row.change}
            title={row.title}
        >
            <Text span fz="xs" className={classes.glyph} aria-hidden>
                {glyph}
            </Text>
            <Text span fz="xs" c="dimmed">
                <VisuallyHidden>{word} </VisuallyHidden>
                {row.kind}
            </Text>
            <Text span fz="xs" truncate className={classes.label}>
                {row.label}
            </Text>
            {row.detail ? (
                <Text span fz="xs" c="dimmed" truncate className={classes.sub}>
                    {row.detail}
                </Text>
            ) : null}
        </UnstyledButton>
    );
};

/** The shell of a turn's card: status, what changed by model, whether it is safe, and what to do next. */
export const TurnCard: FC<{
    icon: ReactNode;
    status: string;
    name: string | null;
    headerAction: ReactNode;
    groups: TurnGroup[];
    safety: Safety | null;
    actions: ReactNode[];
    isSettled: boolean;
    isGone: boolean;
    children?: ReactNode;
}> = ({
    icon,
    status,
    name,
    headerAction,
    groups,
    safety,
    actions,
    isSettled,
    isGone,
    children,
}) => (
    <Paper
        mt="xs"
        className={classes.card}
        data-settled={isSettled}
        data-gone={isGone}
    >
        <Group className={classes.section} gap={6} wrap="nowrap">
            {icon}
            <Text fz="xs" fw={500} truncate flex={1}>
                {status}
                {name ? (
                    <Text span fz="xs" fw={400} c="dimmed">
                        {` · ${name}`}
                    </Text>
                ) : null}
            </Text>
            {headerAction}
        </Group>
        {groups.map(({ model, title, subtitle, rows, issues }) =>
            rows.length === 0 && issues.length === 0 && !subtitle ? null : (
                <Box key={model} className={classes.model}>
                    <Group gap={4} wrap="nowrap" className={classes.modelName}>
                        <MantineIcon
                            icon={IconTable}
                            size={12}
                            color="ldGray.5"
                        />
                        <Text fz="xs" c="dimmed" truncate title={model}>
                            {title}
                            {subtitle ? ` · ${subtitle}` : ''}
                        </Text>
                    </Group>
                    {rows.map((row) => (
                        <Row key={row.id} row={row} />
                    ))}
                    {issues.map(({ kind, detail }) => (
                        <Group
                            key={`${kind}|${detail}`}
                            className={classes.issue}
                            gap={6}
                            wrap="nowrap"
                            align="flex-start"
                        >
                            <MantineIcon
                                icon={ISSUE_KINDS[kind].icon}
                                size={14}
                                color={ISSUE_KINDS[kind].color}
                            />
                            <Text
                                fz="xs"
                                fw={500}
                                flex={1}
                                miw={0}
                                className={classes.wrap}
                            >
                                {ISSUE_KINDS[kind].label}
                                <Text span fz="xs" fw={400} c="dimmed">
                                    {` · ${detail}`}
                                </Text>
                            </Text>
                        </Group>
                    ))}
                </Box>
            ),
        )}
        {safety ? (
            <Group
                className={classes.section}
                gap={6}
                wrap="nowrap"
                align="flex-start"
            >
                <Box className={classes.icon}>
                    <TaskIcon state={safety.state} />
                </Box>
                <Text fz="xs" flex={1} miw={0} className={classes.wrap}>
                    {safety.text}
                    {safety.why ? (
                        <Text span fz="xs" c="dimmed">
                            {` · ${safety.why}`}
                        </Text>
                    ) : null}
                </Text>
            </Group>
        ) : null}
        {actions.some(Boolean) ? (
            <Group
                className={classes.section}
                gap={4}
                justify="flex-end"
                wrap="nowrap"
            >
                {actions}
            </Group>
        ) : null}
        {children}
    </Paper>
);
