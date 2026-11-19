import {
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Skeleton,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import {
    IconBulb,
    IconChevronDown,
    IconChevronRight,
    IconInfoCircle,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { type ChangeKind } from './modelCode';
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
};

export type TurnGroup = {
    model: string;
    title: string;
    subtitle: string | null;
    rows: TurnRow[];
    issues: Issue[];
};

export type Safety = { state: TaskState; text: string; why: string | null };

/** One change as a short sentence: "New join to Merchants". */
const Row: FC<{ row: TurnRow }> = ({ row }) => (
    <UnstyledButton
        component={Link}
        to={row.to}
        className={classes.row}
        title={row.title}
    >
        <Box className={classes.rowIcon}>{row.icon}</Box>
        <Text span fz="sm" truncate className={classes.label}>
            <Text span inherit c="dimmed">
                {`${row.action} `}
            </Text>
            {row.label}
        </Text>
        {row.detail ? (
            <Text span fz="sm" c="dimmed" truncate className={classes.sub}>
                {row.detail}
            </Text>
        ) : null}
    </UnstyledButton>
);

/** Stands in for a turn's card while the change it will show is still being checked. */
export const TurnCardSkeleton: FC = () => (
    <Paper mt="xs" className={classes.card} aria-busy>
        <Group className={classes.section} gap={6} wrap="nowrap">
            <Loader size={12} color="gray" />
            <Text fz="sm" fw={500}>
                Checking the change
            </Text>
        </Group>
        <Stack className={classes.section} gap={8}>
            <Skeleton h={8} w="45%" />
            <Skeleton h={8} w="70%" />
            <Skeleton h={8} w="55%" />
        </Stack>
    </Paper>
);

/** The shell of a turn's card: status, what changed by model, whether it is safe, and what to do next. */
export const TurnCard: FC<{
    icon: ReactNode;
    status: string;
    name: string | null;
    headerAction: ReactNode;
    groups: TurnGroup[];
    safety: Safety | null;
    note: string | null;
    /** What the agent offers to do next instead; each is sent as the person's message. */
    options: string[];
    onAsk: ((message: string) => void) | null;
    /** Only the latest turn's card is open and offers anything; earlier ones fold to their header. */
    isLatest: boolean;
    actions: ReactNode[];
    isGone: boolean;
    children?: ReactNode;
}> = ({
    icon,
    status,
    name,
    headerAction,
    groups,
    safety,
    note,
    options,
    onAsk,
    isLatest,
    actions,
    isGone,
    children,
}) => {
    const [isOpened, setIsOpened] = useState(false);
    const isOpen = isLatest || isOpened;
    // The latest card has room to say where the change went on its own line; a folded one stays one line.
    const heading = isLatest ? (
        <Box flex={1} miw={0}>
            <Text fz="sm" fw={500} truncate>
                {status}
            </Text>
            {name ? (
                <Text fz="sm" c="dimmed" truncate title={name}>
                    {name}
                </Text>
            ) : null}
        </Box>
    ) : (
        <Text fz="sm" fw={500} truncate flex={1}>
            {status}
            {name ? (
                <Text span inherit fw={400} c="dimmed">
                    {` · ${name}`}
                </Text>
            ) : null}
        </Text>
    );
    return (
        <Paper mt="xs" className={classes.card} data-gone={isGone}>
            {isLatest ? (
                <Group
                    className={classes.section}
                    gap={8}
                    wrap="nowrap"
                    align="flex-start"
                >
                    {icon ? (
                        <Box className={classes.headIcon}>{icon}</Box>
                    ) : null}
                    {heading}
                    {headerAction}
                </Group>
            ) : (
                <UnstyledButton
                    className={classes.fold}
                    aria-expanded={isOpen}
                    onClick={() => setIsOpened(!isOpened)}
                >
                    {icon}
                    {heading}
                    <MantineIcon
                        icon={isOpen ? IconChevronDown : IconChevronRight}
                        size={12}
                        color="dimmed"
                    />
                </UnstyledButton>
            )}
            {isOpen ? (
                <>
                    <Box className={classes.body}>
                        {groups.map(
                            ({ model, title, subtitle, rows, issues }) =>
                                rows.length === 0 &&
                                issues.length === 0 &&
                                !subtitle ? null : (
                                    <Box key={model} className={classes.model}>
                                        <Group
                                            gap={8}
                                            wrap="nowrap"
                                            className={classes.line}
                                        >
                                            <MantineIcon
                                                icon={IconTable}
                                                color="dimmed"
                                            />
                                            <Text
                                                fz="sm"
                                                fw={500}
                                                truncate
                                                title={model}
                                            >
                                                {title}
                                            </Text>
                                        </Group>
                                        {subtitle ? (
                                            <Text
                                                fz="sm"
                                                c="dimmed"
                                                className={classes.modelNote}
                                            >
                                                {subtitle}
                                            </Text>
                                        ) : null}
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
                                                    icon={
                                                        ISSUE_KINDS[kind].icon
                                                    }
                                                    size={14}
                                                    color={
                                                        ISSUE_KINDS[kind].color
                                                    }
                                                />
                                                {/* A warehouse error runs long; its start says what went wrong and the rest is on hover. */}
                                                <Text
                                                    fz="sm"
                                                    fw={500}
                                                    flex={1}
                                                    miw={0}
                                                    className={classes.wrap}
                                                    lineClamp={
                                                        kind === 'failed'
                                                            ? 2
                                                            : undefined
                                                    }
                                                    title={
                                                        kind === 'failed'
                                                            ? detail
                                                            : undefined
                                                    }
                                                >
                                                    {ISSUE_KINDS[kind].label}
                                                    <Text
                                                        span
                                                        fz="sm"
                                                        fw={400}
                                                        c="dimmed"
                                                    >
                                                        {` · ${detail}`}
                                                    </Text>
                                                </Text>
                                            </Group>
                                        ))}
                                    </Box>
                                ),
                        )}
                        {note ? (
                            <Group
                                className={classes.line}
                                gap={8}
                                wrap="nowrap"
                                align="flex-start"
                            >
                                <Box className={classes.icon}>
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        color="dimmed"
                                    />
                                </Box>
                                <Text
                                    fz="sm"
                                    flex={1}
                                    miw={0}
                                    lineClamp={4}
                                    title={note}
                                >
                                    <Text span inherit c="dimmed">
                                        One thing to confirm before you
                                        publish:{' '}
                                    </Text>
                                    {note}
                                </Text>
                            </Group>
                        ) : null}
                        {safety && safety.state !== 'done' ? (
                            <Group
                                className={classes.line}
                                gap={6}
                                wrap="nowrap"
                                align="flex-start"
                            >
                                <Box className={classes.icon}>
                                    <TaskIcon state={safety.state} />
                                </Box>
                                <Text
                                    fz="sm"
                                    flex={1}
                                    miw={0}
                                    className={classes.wrap}
                                >
                                    {safety.text}
                                    {safety.why ? (
                                        <Text span fz="sm" c="dimmed">
                                            {` · ${safety.why}`}
                                        </Text>
                                    ) : null}
                                </Text>
                            </Group>
                        ) : null}
                    </Box>
                    {isLatest &&
                    (actions.some(Boolean) || (onAsk && options.length > 0)) ? (
                        <Box className={classes.next}>
                            {onAsk && options.length > 0 ? (
                                <Group
                                    className={classes.line}
                                    gap={8}
                                    wrap="nowrap"
                                >
                                    <MantineIcon
                                        icon={IconBulb}
                                        color="dimmed"
                                    />
                                    <Text fz="sm" c="dimmed">
                                        You could ask next
                                    </Text>
                                </Group>
                            ) : null}
                            {onAsk && options.length > 0 ? (
                                <Group className={classes.offers} gap={4}>
                                    {options.map((option) => (
                                        <Button
                                            key={option}
                                            size="compact-sm"
                                            variant="light"
                                            color="gray"
                                            maw="100%"
                                            title={option}
                                            onClick={() => onAsk(option)}
                                        >
                                            <Text span inherit truncate>
                                                {option}
                                            </Text>
                                        </Button>
                                    ))}
                                </Group>
                            ) : null}
                            {actions.some(Boolean) ? (
                                <Group
                                    className={classes.actions}
                                    gap="xs"
                                    justify="flex-end"
                                    wrap="wrap"
                                >
                                    {actions}
                                </Group>
                            ) : null}
                        </Box>
                    ) : null}
                    {children}
                </>
            ) : null}
        </Paper>
    );
};
