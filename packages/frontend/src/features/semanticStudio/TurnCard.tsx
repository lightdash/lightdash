import {
    Box,
    Button,
    Group,
    Paper,
    Text,
    UnstyledButton,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
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
    /** What it is, for a reader who cannot see its icon. */
    kind: string;
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
            <Box className={classes.kindIcon}>{row.icon}</Box>
            <Text span fz="xs" truncate className={classes.label}>
                <VisuallyHidden>
                    {word} {row.kind}{' '}
                </VisuallyHidden>
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
    const heading = (
        <Text fz="xs" fw={500} truncate flex={1}>
            {status}
            {name ? (
                <Text span fz="xs" fw={400} c="dimmed">
                    {` · ${name}`}
                </Text>
            ) : null}
        </Text>
    );
    return (
        <Paper mt="xs" className={classes.card} data-gone={isGone}>
            {isLatest ? (
                <Group className={classes.section} gap={6} wrap="nowrap">
                    {icon}
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
                    {groups.map(({ model, title, subtitle, rows, issues }) =>
                        rows.length === 0 &&
                        issues.length === 0 &&
                        !subtitle ? null : (
                            <Box key={model} className={classes.model}>
                                <Group
                                    gap={6}
                                    wrap="nowrap"
                                    className={classes.modelName}
                                >
                                    <MantineIcon
                                        icon={IconTable}
                                        size={14}
                                        color="dimmed"
                                    />
                                    <Text
                                        fz="xs"
                                        fw={500}
                                        truncate
                                        title={model}
                                    >
                                        {title}
                                        {subtitle ? (
                                            <Text
                                                span
                                                inherit
                                                fw={400}
                                                c="dimmed"
                                            >
                                                {` · ${subtitle}`}
                                            </Text>
                                        ) : null}
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
                                        {/* A warehouse error runs long; its start says what went wrong and the rest is on hover. */}
                                        <Text
                                            fz="xs"
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
                                                fz="xs"
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
                        <Text
                            className={classes.section}
                            fz="xs"
                            c="dimmed"
                            lineClamp={3}
                            title={note}
                        >
                            {note}
                        </Text>
                    ) : null}
                    {safety && safety.state !== 'done' ? (
                        <Group
                            className={classes.section}
                            gap={6}
                            wrap="nowrap"
                            align="flex-start"
                        >
                            <Box className={classes.icon}>
                                <TaskIcon state={safety.state} />
                            </Box>
                            <Text
                                fz="xs"
                                flex={1}
                                miw={0}
                                className={classes.wrap}
                            >
                                {safety.text}
                                {safety.why ? (
                                    <Text span fz="xs" c="dimmed">
                                        {` · ${safety.why}`}
                                    </Text>
                                ) : null}
                            </Text>
                        </Group>
                    ) : null}
                    {isLatest &&
                    (actions.some(Boolean) || options.length > 0) ? (
                        <Group
                            className={classes.section}
                            gap={4}
                            justify="space-between"
                            wrap="wrap"
                        >
                            <Group gap={4} wrap="wrap" miw={0}>
                                {onAsk
                                    ? options.map((option) => (
                                          <Button
                                              key={option}
                                              size="compact-xs"
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
                                      ))
                                    : null}
                            </Group>
                            <Group gap={4} wrap="nowrap" ml="auto">
                                {actions}
                            </Group>
                        </Group>
                    ) : null}
                    {children}
                </>
            ) : null}
        </Paper>
    );
};
