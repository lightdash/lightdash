import {
    Box,
    Group,
    Loader,
    Paper,
    Skeleton,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { CHANGE_KIND_LABELS, type ChangeKind } from './modelCode';
import { ISSUE_KINDS, type Issue } from './proposalIssues';
import { TaskIcon, type TaskState } from './TaskRow';
import classes from './TurnSummaryCard.module.css';

/** One changed part of a model, linking to where it can be looked at. */
export type TurnRow = {
    id: string;
    change: ChangeKind;
    /** What was done, as the start of a sentence the label ends: "Added the metric", "Joined to". */
    action: string;
    icon: ReactNode;
    label: string;
    detail: string | null;
    title: string;
    to: string;
    /** When set, clicking the row runs this instead of following its link. */
    onOpen: (() => void) | null;
};

export type TurnGroup = {
    model: string;
    /** What happened to the model as a whole. */
    change: ChangeKind;
    title: string;
    subtitle: string | null;
    rows: TurnRow[];
    issues: Issue[];
};

export type Safety = { state: TaskState; text: string; why: string | null };

const CHANGE_COLORS: Record<ChangeKind, string> = {
    new: 'green',
    changed: 'blue',
    removed: 'red',
};

/** One stop on the card's line: an icon, what it is, and what there is to say about it. */
const Step: FC<{
    icon: ReactNode;
    title: string;
    hint?: string;
    aside?: ReactNode;
    children?: ReactNode;
}> = ({ icon, title, hint, aside, children }) => (
    <Box className={classes.step}>
        <Box className={classes.node}>{icon}</Box>
        <Box miw={0} flex={1}>
            <Group gap="xs" wrap="nowrap" justify="space-between">
                <Text fz="xs" fw={500} truncate title={hint}>
                    {title}
                </Text>
                {aside}
            </Group>
            {children}
        </Box>
    </Box>
);

const RowText: FC<{ row: TurnRow; text: string }> = ({ row, text }) => (
    <>
        <Text span fz="xs" c="dimmed" truncate className={classes.label}>
            {text}
        </Text>
        {row.detail ? (
            <Text span fz="xs" c="dimmed" flex="none">
                {row.detail}
            </Text>
        ) : null}
    </>
);

/** One change as a short sentence: "Joined to Merchants". */
const Row: FC<{ row: TurnRow; text: string }> = ({ row, text }) =>
    row.onOpen === null ? (
        <UnstyledButton
            component={Link}
            to={row.to}
            className={classes.row}
            title={row.title}
        >
            <RowText row={row} text={text} />
        </UnstyledButton>
    ) : (
        <UnstyledButton
            className={classes.row}
            title={row.title}
            onClick={row.onOpen}
        >
            <RowText row={row} text={text} />
        </UnstyledButton>
    );

const ModelStep: FC<{ group: TurnGroup }> = ({
    group: { model, change, title, subtitle, rows, issues },
}) => (
    <Step
        // A model with one change takes that change's icon; otherwise it is the table itself.
        icon={
            rows.length === 1 && subtitle === null ? (
                rows[0].icon
            ) : (
                <MantineIcon icon={IconTable} size={14} color="green" />
            )
        }
        title={title}
        hint={model}
        aside={
            // A model with only issues did not change.
            rows.length === 0 && subtitle === null ? null : (
                <Group gap={4} wrap="nowrap" flex="none">
                    <MantineIcon
                        icon={IconCheck}
                        size={12}
                        color={CHANGE_COLORS[change]}
                    />
                    <Text fz="xs" c="dimmed">
                        {CHANGE_KIND_LABELS[change]}
                    </Text>
                </Group>
            )
        }
    >
        {subtitle ? (
            <Text fz="xs" c="dimmed">
                {subtitle}
            </Text>
        ) : null}
        {rows.map((row) => (
            <Row key={row.id} row={row} text={`${row.action} ${row.label}`} />
        ))}
        {issues.map(({ kind, detail }) => (
            <Group
                key={`${kind}|${detail}`}
                gap={6}
                wrap="nowrap"
                align="flex-start"
            >
                <Box className={classes.node}>
                    <MantineIcon
                        icon={ISSUE_KINDS[kind].icon}
                        size={14}
                        color={ISSUE_KINDS[kind].color}
                    />
                </Box>
                {/* A warehouse error runs long; its start says what went wrong and the rest is on hover. */}
                <Text
                    fz="xs"
                    fw={500}
                    flex={1}
                    miw={0}
                    className={classes.wrap}
                    lineClamp={kind === 'failed' ? 2 : undefined}
                    title={kind === 'failed' ? detail : undefined}
                >
                    {ISSUE_KINDS[kind].label}
                    <Text span inherit fw={400} c="dimmed">
                        {` · ${detail}`}
                    </Text>
                </Text>
            </Group>
        ))}
    </Step>
);

/** Stands in for a turn's card while the change it will show is still being checked. */
export const TurnCardSkeleton: FC = () => (
    <Paper mt="xs" className={classes.card} aria-busy>
        <Group className={classes.head} gap={6} wrap="nowrap">
            <Loader size={12} color="gray" />
            <Text fz="xs" fw={500}>
                Checking the change
            </Text>
        </Group>
        <Stack className={classes.steps} gap={6}>
            <Skeleton h={8} w="45%" />
            <Skeleton h={8} w="70%" />
            <Skeleton h={8} w="55%" />
        </Stack>
    </Paper>
);

/** A turn's card: where the change went, then each model it touched as a step on a line, and what to do next. */
export const TurnCard: FC<{
    /** Shown only when the turn's state needs one, such as a draft that does not compile. */
    icon: ReactNode;
    status: string;
    name: string | null;
    headerAction: ReactNode;
    groups: TurnGroup[];
    safety: Safety | null;
    /** Only the latest turn's card is open and offers anything; earlier ones fold to their header. */
    isLatest: boolean;
    actions: ReactNode[];
    isGone: boolean;
    /** A turn whose change has left the draft folds like an earlier one, and still offers its links once opened. */
    isSettled?: boolean;
    /** Each changed file on one line, for a repository where a model is one or two files. */
    isFileList?: boolean;
    children?: ReactNode;
}> = ({
    icon,
    status,
    name,
    headerAction,
    groups,
    safety,
    isLatest,
    actions,
    isGone,
    isSettled = false,
    isFileList = false,
    children,
}) => {
    const [isOpened, setIsOpened] = useState(false);
    const isFolded = !isLatest || isSettled;
    const isOpen = !isFolded || isOpened;
    const shown = groups.filter(
        ({ rows, issues, subtitle }) =>
            rows.length > 0 || issues.length > 0 || subtitle !== null,
    );
    const needsCheck = safety !== null && safety.state !== 'done';
    return (
        <Paper mt="xs" className={classes.card} data-gone={isGone}>
            {!isFolded ? (
                <Group className={classes.head} gap="xs" wrap="nowrap">
                    {icon ?? <Box className={classes.dot} />}
                    <Box flex={1} miw={0}>
                        <Text fz="sm" fw={500} truncate>
                            {status}
                        </Text>
                        {name ? (
                            <Text fz="xs" c="dimmed" truncate title={name}>
                                {name}
                            </Text>
                        ) : null}
                    </Box>
                    {headerAction}
                </Group>
            ) : (
                <UnstyledButton
                    className={classes.fold}
                    aria-expanded={isOpen}
                    onClick={() => setIsOpened(!isOpened)}
                >
                    {icon}
                    <Text fz="xs" fw={500} truncate flex={1}>
                        {status}
                        {name ? (
                            <Text span inherit fw={400} c="dimmed">
                                {` · ${name}`}
                            </Text>
                        ) : null}
                    </Text>
                    <MantineIcon
                        icon={isOpen ? IconChevronDown : IconChevronRight}
                        size={12}
                        color="dimmed"
                    />
                </UnstyledButton>
            )}
            {isOpen && (shown.length > 0 || needsCheck) ? (
                <Box className={classes.steps}>
                    {isFileList
                        ? shown
                              .flatMap(({ rows }) => rows)
                              .map((row) => (
                                  <Box key={row.id} className={classes.step}>
                                      <Box className={classes.node}>
                                          {row.icon}
                                      </Box>
                                      <Box miw={0} flex={1}>
                                          <Row row={row} text={row.label} />
                                      </Box>
                                  </Box>
                              ))
                        : shown.map((group) => (
                              <ModelStep key={group.model} group={group} />
                          ))}
                    {safety && needsCheck ? (
                        <Step
                            icon={<TaskIcon state={safety.state} />}
                            title={safety.text}
                        >
                            {safety.why ? (
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    className={classes.wrap}
                                >
                                    {safety.why}
                                </Text>
                            ) : null}
                        </Step>
                    ) : null}
                </Box>
            ) : null}
            {isLatest && isOpen && actions.some(Boolean) ? (
                <Group className={classes.foot} gap="xs" justify="flex-end">
                    {actions}
                </Group>
            ) : null}
            {isOpen ? children : null}
        </Paper>
    );
};
