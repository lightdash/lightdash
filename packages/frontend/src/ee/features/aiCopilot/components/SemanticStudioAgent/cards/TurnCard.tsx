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
import { upperFirst } from 'es-toolkit/compat';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import {
    CHANGE_KIND_STYLE,
    count,
    type ChangeKind,
    type FieldChange,
} from '../../../../../../features/semanticStudio/modelCode';
import {
    TaskIcon,
    type TaskState,
} from '../../../../../../features/semanticStudio/TaskRow';
import { ISSUE_KINDS, type Issue } from './proposalIssues';
import { RejectionDetails } from './RejectionDetails';
import classes from './TurnCard.module.css';

/** One changed part of a model, linking to where it can be looked at. */
export type TurnRow = {
    id: string;
    kind: FieldChange['kind'] | 'file';
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

/** More changes than this to one model read as a summary until expanded. */
const LONG = 8;
const CHANGES: ChangeKind[] = ['new', 'changed', 'removed'];
const KINDS: TurnRow['kind'][] = [
    'dimension',
    'metric',
    'join',
    'file',
    'model',
];
const VERBS: Record<ChangeKind, string> = {
    new: 'added',
    changed: 'changed',
    removed: 'removed',
};

const isLong = ({ rows }: TurnGroup) => rows.length > LONG;

type Section = { key: string; phrase: string; rows: TurnRow[] };

/** The rows of one change, by kind: a model's own keys keep their sentence, the rest are counted. */
const sectionsOf = (rows: TurnRow[], change: ChangeKind): Section[] =>
    KINDS.flatMap((kind): Section[] => {
        const hits = rows.filter((r) => r.change === change && r.kind === kind);
        if (hits.length === 0) return [];
        return kind === 'model'
            ? hits.map((row) => ({ key: row.id, phrase: row.label, rows: [] }))
            : [{ key: kind, phrase: count(hits.length, kind), rows: hits }];
    });

/** Every change to a model in one line: "Added 2 dimensions and 1 metric · removed 1 metric". */
const summarizeRows = (rows: TurnRow[]): string => {
    const text = CHANGES.flatMap((change) => {
        const phrases = sectionsOf(rows, change).map(({ phrase }) => phrase);
        return phrases.length > 0
            ? [`${VERBS[change]} ${phrases.join(' and ')}`]
            : [];
    }).join(' · ');
    return upperFirst(text);
};

const ChangeList: FC<{ rows: TurnRow[] }> = ({ rows }) => (
    <>
        {CHANGES.flatMap((change) =>
            sectionsOf(rows, change).map(({ key, phrase, rows: hits }) => (
                <Box key={`${change}:${key}`} mt={4}>
                    <Text fz="xs" fw={500}>
                        {upperFirst(`${VERBS[change]} ${phrase}`)}
                    </Text>
                    {hits.map((row) => (
                        <Row key={row.id} row={row} text={row.label} />
                    ))}
                </Box>
            )),
        )}
    </>
);

const ModelStep: FC<{
    group: TurnGroup;
    isExpanded: boolean;
    onToggle: () => void;
}> = ({ group, isExpanded, onToggle }) => {
    const { model, change, title, subtitle, rows, issues } = group;
    const long = isLong(group);
    return (
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
                            color={CHANGE_KIND_STYLE[change].color}
                        />
                        <Text fz="xs" c="dimmed">
                            {CHANGE_KIND_STYLE[change].label}
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
            {!long
                ? rows.map((row) => (
                      <Row
                          key={row.id}
                          row={row}
                          text={`${row.action} ${row.label}`}
                      />
                  ))
                : null}
            {long && !isExpanded ? (
                <>
                    <Text fz="xs" c="dimmed" className={classes.wrap}>
                        {summarizeRows(rows)}
                    </Text>
                    {/* Removals break charts, so they stay named while the rest is folded. */}
                    {rows
                        .filter((row) => row.change === 'removed')
                        .map((row) => (
                            <Row
                                key={row.id}
                                row={row}
                                text={`${row.action} ${row.label}`}
                            />
                        ))}
                </>
            ) : null}
            {long && isExpanded ? <ChangeList rows={rows} /> : null}
            {long ? (
                <UnstyledButton
                    className={classes.toggle}
                    aria-expanded={isExpanded}
                    onClick={onToggle}
                >
                    <Text fz="xs" c="dimmed">
                        {isExpanded
                            ? 'Show less'
                            : `Show all ${rows.length} changes`}
                    </Text>
                </UnstyledButton>
            ) : null}
            {issues.map(({ kind, detail, rejection }) => {
                // An error saved before rejections had a kind runs long; its start says what went wrong and the rest is on hover.
                const isRawError = kind === 'failed' && rejection === null;
                return (
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
                        <Box flex={1} miw={0}>
                            <Text
                                fz="xs"
                                fw={500}
                                className={classes.wrap}
                                lineClamp={isRawError ? 2 : undefined}
                                title={isRawError ? detail : undefined}
                            >
                                {ISSUE_KINDS[kind].label}
                                <Text span inherit fw={400} c="dimmed">
                                    {` · ${detail}`}
                                </Text>
                            </Text>
                            {rejection?.detail ? (
                                <RejectionDetails detail={rejection.detail} />
                            ) : null}
                        </Box>
                    </Group>
                );
            })}
        </Step>
    );
};

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
    const [isExpanded, setIsExpanded] = useState(false);
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
                        <Text fz="xs" fw={500} truncate>
                            {status}
                        </Text>
                    </Box>
                    {headerAction ? (
                        <Box className={classes.headAction}>{headerAction}</Box>
                    ) : null}
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
                              <ModelStep
                                  key={group.model}
                                  group={group}
                                  isExpanded={isExpanded}
                                  onToggle={() => setIsExpanded(!isExpanded)}
                              />
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
