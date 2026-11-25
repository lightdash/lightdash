/** What a person needs around a draft before publishing it: what happened under it, who else is in it, each change in order, and what it does to the numbers. */
import {
    getItemId,
    type SemanticLayerDraft,
    type SemanticLayerDraftModel,
    type SemanticLayerDraftUsage,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Center,
    Group,
    Paper,
    Stack,
    Text,
    Tooltip,
    VisuallyHidden,
} from '@mantine/core';
import {
    IconChevronRight,
    IconCircleCheck,
    IconCircleDashed,
    IconAlertTriangle,
    IconArrowDown,
    IconArrowUp,
    IconGitMerge,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import classes from './DraftInsights.module.css';
import { describePublisher } from './draftState';
import { FieldChangeIcon } from './KindTypeIcon';
import { LineCounts } from './LineCounts';
import {
    CHANGE_GLYPHS,
    CHANGE_KIND_LABELS,
    describeModelChange,
    getChangeKind,
    count,
    countChangedLines,
    listPublishedParts,
    summarizeDraftedPaths,
} from './modelCode';
import {
    useDiscardDraftChange,
    useMoveDraftChange,
    useSemanticLayerDraftUsage,
    usePublishMode,
} from './useSemanticLayerModel';

const listNames = (names: string[]): string =>
    names.length <= 2
        ? names.join(' and ')
        : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;

/** One notice on a model's card: its icon sits in the column the card's own icon uses, so the words line up with the title. */
const NoticeRow: FC<{
    icon: typeof IconUsers;
    color: 'yellow' | 'dimmed';
    children: ReactNode;
}> = ({ icon, color, children }) => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
        <Center w={24} h={18} flex="none">
            <MantineIcon icon={icon} size={16} color={color} />
        </Center>
        {children}
    </Group>
);

/** What happened to a model outside this draft: a publish under it, or someone else's work in it. */
export const ModelNotices: FC<{
    model: SemanticLayerDraftModel;
}> = ({ model }) => {
    const publishedAgo = useTimeAgo(model.publishedSince?.at ?? new Date());
    const publisher = describePublisher(model.publishedSince);
    // Kept over what was published: the draft is based on live again.
    const publishedUnder =
        model.reconciliation?.state === 'current' ? null : model.publishedSince;
    if (!publishedUnder && model.alsoChanging.length === 0) return null;
    return (
        <Stack gap={4} className={classes.notices}>
            {publishedUnder ? (
                <NoticeRow icon={IconGitMerge} color="dimmed">
                    <Text fz="xs" c="dimmed">
                        <Text span fw={600}>
                            {publisher.subject}
                        </Text>{' '}
                        published this model{publisher.where} {publishedAgo},
                        after you started. Below is what publishing would change
                        now.
                    </Text>
                </NoticeRow>
            ) : null}
            {model.alsoChanging.map(({ userUuid, name, paths }) => (
                <NoticeRow key={userUuid} icon={IconUsers} color="dimmed">
                    <Text fz="xs" c="dimmed">
                        <Text span fw={600}>
                            {name}
                        </Text>{' '}
                        is also editing {summarizeDraftedPaths(paths)}, in a
                        draft.
                    </Text>
                </NoticeRow>
            ))}
        </Stack>
    );
};

const ChangeRow: FC<{
    projectUuid: string;
    index: number;
    /** How many changes the draft has, to know which way this one can move. */
    count: number;
    change: SemanticLayerDraft['changes'][number];
    /** What each model is called, by its name. */
    labels: Map<string, string>;
    onAskAgent: (prompt: string) => void;
}> = ({ projectUuid, index, count, change, labels, onAskAgent }) => {
    const discard = useDiscardDraftChange(projectUuid);
    const move = useMoveDraftChange(projectUuid);
    const ago = useTimeAgo(change.createdAt);
    const failed = change.models.filter(({ error }) => error !== null);
    const named = (models: { model: string }[]) =>
        listNames(models.map(({ model }) => labels.get(model) ?? model));
    const touched = listNames([
        ...change.models.map(({ model }) => labels.get(model) ?? model),
        ...(change.projectContextEntries.length > 0 ? ['Project context'] : []),
    ]);
    return (
        <Group gap="sm" wrap="nowrap" className={classes.change}>
            <Text fz="xs" c="dimmed" className={classes.changeIndex}>
                {index + 1}
            </Text>
            <Box miw={0} flex={1}>
                <Text fz="sm" truncate>
                    {change.question ?? 'Changed during review'}
                </Text>
                <Text fz="xs" c={failed.length > 0 ? 'red' : 'dimmed'} truncate>
                    {failed.length > 0
                        ? `No longer applies to ${named(failed)}`
                        : `${touched} · ${ago}`}
                </Text>
            </Box>
            {failed.length > 0 ? (
                <Tooltip label="Discards this change and has the agent redo it on the model as it is now.">
                    <Button
                        size="compact-xs"
                        variant="default"
                        loading={discard.isLoading}
                        onClick={() =>
                            // The agent adds changes and cannot repair a stored one, so the stale one goes first.
                            void discard
                                .mutateAsync(change.draftChangeUuid)
                                .then(() =>
                                    onAskAgent(
                                        [
                                            'A change in the draft stopped applying, so I discarded it.',
                                            change.question
                                                ? `It was asked for with: "${change.question}"`
                                                : null,
                                            `It failed with: ${failed
                                                .map(
                                                    ({ model, error }) =>
                                                        `${model}: ${error}`,
                                                )
                                                .join(' ')}`,
                                            'Read the model as it is now and propose that change again so it applies.',
                                        ]
                                            .filter(Boolean)
                                            .join(' '),
                                    ),
                                )
                                // The failure is already shown as a toast.
                                .catch(() => undefined)
                        }
                    >
                        Fix it
                    </Button>
                </Tooltip>
            ) : null}
            {count > 1 ? (
                <Group gap={0} wrap="nowrap" flex="none">
                    <Tooltip label="Move earlier">
                        <ActionIcon
                            size="sm"
                            aria-label="Move earlier"
                            disabled={index === 0 || move.isLoading}
                            onClick={() =>
                                move.mutate({
                                    draftChangeUuid: change.draftChangeUuid,
                                    direction: 'earlier',
                                })
                            }
                        >
                            <MantineIcon icon={IconArrowUp} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Move later">
                        <ActionIcon
                            size="sm"
                            aria-label="Move later"
                            disabled={index === count - 1 || move.isLoading}
                            onClick={() =>
                                move.mutate({
                                    draftChangeUuid: change.draftChangeUuid,
                                    direction: 'later',
                                })
                            }
                        >
                            <MantineIcon icon={IconArrowDown} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            ) : null}
            <ConfirmDeleteButton
                size="sm"
                aria-label="Discard this change"
                tooltip="Click again to discard this change"
                disabled={discard.isLoading}
                onConfirm={() => discard.mutate(change.draftChangeUuid)}
            >
                <MantineIcon icon={IconTrash} />
            </ConfirmDeleteButton>
        </Group>
    );
};

/** The draft as the ordered list it is, shown once the order matters: with several changes, or one that stopped applying. */
export const ChangeQueue: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    onAskAgent: (prompt: string) => void;
    className: string;
}> = ({ projectUuid, draft, onAskAgent, className }) => {
    const hasFailure = draft.changes.some(({ models }) =>
        models.some(({ error }) => error !== null),
    );
    if (draft.changes.length < 2 && !hasFailure) return null;
    const labels = new Map(
        draft.models.map((entry) => [
            entry.model,
            describeModelChange(entry.model, entry).title,
        ]),
    );
    return (
        <Box
            component="details"
            className={className}
            open={hasFailure || undefined}
        >
            <Group
                component="summary"
                gap="xs"
                wrap="nowrap"
                className={classes.queueTitle}
            >
                <MantineIcon
                    icon={IconChevronRight}
                    color="dimmed"
                    className={classes.queueChevron}
                />
                <Text fz="sm" fw={500}>
                    {count(draft.changes.length, 'change')}
                </Text>
            </Group>
            {draft.changes.map((change, index) => (
                <ChangeRow
                    key={change.draftChangeUuid}
                    projectUuid={projectUuid}
                    index={index}
                    count={draft.changes.length}
                    change={change}
                    labels={labels}
                    onAskAgent={onAskAgent}
                />
            ))}
        </Box>
    );
};

const MAX_LISTED_CHARTS = 5;

/** Saved charts that read what the draft redefines or removes: nothing breaks, but their numbers move. */
export const DraftUsage: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data } = useSemanticLayerDraftUsage(projectUuid);
    return <FieldUsage projectUuid={projectUuid} usage={data} />;
};

/** Saved charts that read what a change redefines or removes. */
export const FieldUsage: FC<{
    projectUuid: string;
    usage: SemanticLayerDraftUsage | undefined;
}> = ({ projectUuid, usage: data }) => {
    if (!data || data.fields.length === 0) return null;
    return (
        <Paper className={classes.section}>
            <Text fz="sm" fw={500} className={classes.sectionTitle}>
                Saved content that reads what you changed
            </Text>
            {data.fields.map((field) => (
                <Box key={field.fieldId} className={classes.change}>
                    <Text fz="sm">
                        {field.label}{' '}
                        <Text span inherit c="dimmed">
                            in {field.model},{' '}
                            {field.kind === 'removed'
                                ? 'removed'
                                : 'defined differently'}
                        </Text>
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {field.charts
                            .slice(0, MAX_LISTED_CHARTS)
                            .map((chart, index) => (
                                <Text span inherit key={chart.uuid}>
                                    {index > 0 ? ', ' : ''}
                                    <Anchor
                                        component={Link}
                                        to={`/projects/${projectUuid}/saved/${chart.uuid}`}
                                        target="_blank"
                                        inherit
                                    >
                                        {chart.name}
                                    </Anchor>
                                </Text>
                            ))}
                        {field.charts.length > MAX_LISTED_CHARTS
                            ? ` and ${field.charts.length - MAX_LISTED_CHARTS} more charts`
                            : ''}
                        {field.dashboards > 0
                            ? ` · ${field.dashboards} ${field.dashboards === 1 ? 'dashboard' : 'dashboards'}`
                            : ''}
                        {field.scheduledDeliveries > 0
                            ? ` · ${field.scheduledDeliveries} scheduled ${field.scheduledDeliveries === 1 ? 'delivery' : 'deliveries'}`
                            : ''}
                    </Text>
                </Box>
            ))}
        </Paper>
    );
};

type CheckState = 'ok' | 'attention' | 'unknown' | 'note';

const CHECK_ICONS = {
    ok: IconCircleCheck,
    attention: IconAlertTriangle,
    unknown: IconCircleDashed,
    note: IconUsers,
};
const CHECK_COLORS = {
    ok: 'green',
    attention: 'orange',
    unknown: 'dimmed',
    note: 'dimmed',
};

const labelOf = (entry: SemanticLayerDraftModel): string =>
    describeModelChange(entry.model, entry).title;

/** What is worth knowing at the moment of publishing, each as one line. */
export const PublishChecklist: FC<{
    draft: SemanticLayerDraft;
    model: string | null;
    /** Saved content the draft breaks; null while that is not known. */
    breaks: number | null;
}> = ({ draft, model, breaks }) => {
    const models = draft.models.filter(
        (entry) => model === null || entry.model === model,
    );
    const failing = draft.changes.filter((change) =>
        change.models.some(
            (entry) =>
                entry.error !== null &&
                (model === null || entry.model === model),
        ),
    ).length;
    const movedUnder = models.filter(
        (entry) =>
            entry.publishedSince && entry.reconciliation?.state !== 'current',
    );
    const others = [
        ...new Set(
            models.flatMap(({ alsoChanging }) =>
                alsoChanging.map(({ name }) => name),
            ),
        ),
    ];
    // Saved content the draft breaks has its own callout under this, so it is not repeated here.
    const checks: { state: CheckState; text: string }[] = [
        ...(failing > 0
            ? [
                  {
                      state: 'attention' as const,
                      text: `${failing} ${failing === 1 ? 'change no longer applies' : 'changes no longer apply'}`,
                  },
              ]
            : []),
        ...(movedUnder.length > 0
            ? [
                  {
                      state: 'note' as const,
                      text: `${listNames(movedUnder.map(labelOf))} changed in Published after you started. The review shows what publishing changes now`,
                  },
              ]
            : []),
        ...(others.length > 0
            ? [
                  {
                      state: 'note' as const,
                      text: `${listNames(others)} ${others.length === 1 ? 'has' : 'have'} unpublished changes to the same models. Publishing leaves theirs as they are`,
                  },
              ]
            : []),
        ...(failing === 0
            ? [
                  {
                      state: 'ok' as const,
                      text:
                          breaks === 0
                              ? 'Compiles. No saved chart or dashboard breaks.'
                              : 'Compiles.',
                  },
              ]
            : []),
    ];
    return (
        <Stack gap={6}>
            {checks.map(({ state, text }) => (
                <Group key={text} gap={8} wrap="nowrap" align="flex-start">
                    <Box flex="none" display="flex" mt={2}>
                        <MantineIcon
                            icon={CHECK_ICONS[state]}
                            size={16}
                            color={CHECK_COLORS[state]}
                        />
                    </Box>
                    <Text fz="sm" c={state === 'ok' ? 'dimmed' : undefined}>
                        {text}
                    </Text>
                </Group>
            ))}
        </Stack>
    );
};

const describeUse = ({
    charts,
    dashboards,
}: SemanticLayerDraftUsage['fields'][number]): string | null =>
    [
        charts.length > 0 ? count(charts.length, 'chart') : null,
        dashboards > 0 ? count(dashboards, 'dashboard') : null,
    ]
        .filter(Boolean)
        .join(', ') || null;

/** What a publish carries: each model, the parts of it that change, and the saved content that reads them. */
export const PublishSummary: FC<{
    projectUuid: string;
    draft: SemanticLayerDraft;
    model: string | null;
}> = ({ projectUuid, draft, model }) => {
    const { data: usage } = useSemanticLayerDraftUsage(projectUuid);
    // Line counts mean something only to people who read the files.
    const showsLines = usePublishMode(projectUuid) !== 'live';
    const models = draft.models.filter(
        (entry) => model === null || entry.model === model,
    );
    return (
        <Stack gap="xs">
            {model === null && draft.projectContext ? (
                <Box className={classes.publishModel}>
                    <Group
                        className={classes.publishHead}
                        gap="xs"
                        wrap="nowrap"
                    >
                        <Text fz="sm" fw={500} truncate flex={1} miw={0}>
                            Project context
                        </Text>
                        <LineCounts
                            counts={countChangedLines(draft.projectContext)}
                        />
                    </Group>
                </Box>
            ) : null}
            {models.map((entry) => {
                const { title, subtitle } = describeModelChange(
                    entry.model,
                    entry,
                );
                const parts = listPublishedParts(draft, entry);
                return (
                    <Box key={entry.model} className={classes.publishModel}>
                        <Group
                            className={classes.publishHead}
                            gap="xs"
                            wrap="nowrap"
                        >
                            <Text fz="sm" fw={500} truncate flex={1} miw={0}>
                                {title}
                                {subtitle || parts.length === 0 ? (
                                    <Text span inherit fw={400} c="dimmed">
                                        {` · ${subtitle ?? CHANGE_KIND_LABELS[getChangeKind(entry)]}`}
                                    </Text>
                                ) : null}
                            </Text>
                            {showsLines ? (
                                <LineCounts counts={countChangedLines(entry)} />
                            ) : null}
                        </Group>
                        {parts.map((part) => {
                            const used = usage?.fields.find(
                                ({ model: of, fieldId }) =>
                                    of === entry.model &&
                                    fieldId ===
                                        getItemId({
                                            table: entry.model,
                                            name: part.name,
                                        }),
                            );
                            const use = used ? describeUse(used) : null;
                            return (
                                <Box
                                    key={`${part.kind}:${part.name}`}
                                    className={classes.publishRow}
                                    title={part.detail ?? undefined}
                                >
                                    <Text
                                        span
                                        fz="sm"
                                        className={classes.publishGlyph}
                                        data-change={part.change}
                                        aria-hidden
                                    >
                                        {CHANGE_GLYPHS[part.change]}
                                    </Text>
                                    <FieldChangeIcon field={part} />
                                    <Text fz="sm" truncate>
                                        <VisuallyHidden>
                                            {CHANGE_KIND_LABELS[part.change]}{' '}
                                            {part.kind}{' '}
                                        </VisuallyHidden>
                                        {part.label}
                                    </Text>
                                    {use ? (
                                        <Tooltip
                                            label={`Read by ${listNames(used?.charts.map(({ name }) => name) ?? [])}`}
                                            disabled={!used?.charts.length}
                                        >
                                            <Text
                                                fz="xs"
                                                c="dimmed"
                                                flex="none"
                                            >
                                                {use}
                                            </Text>
                                        </Tooltip>
                                    ) : null}
                                </Box>
                            );
                        })}
                    </Box>
                );
            })}
        </Stack>
    );
};
