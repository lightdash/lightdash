/** A model's page: its fields, its YAML for the Code view, and the history of a model kept on the server. */
import { type SemanticLayerModelChange } from '@lightdash/common';
import {
    Accordion,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Tabs,
    Text,
    useComputedColorScheme,
} from '@mantine/core';
import { File, WorkerPoolContextProvider } from '@pierre/diffs/react';
import dayjs from 'dayjs';
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import useHealth from '../../hooks/health/useHealth';
import { ChangeDiff } from './ChangeDiff';
import {
    CHANGE_KIND_VERBS,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    changeTitle,
    findFieldBlock,
    VIEW_PARAM,
} from './modelCode';
import { ModelPreAggregates } from './ModelPreAggregates';
import classes from './ModelTabs.module.css';
import {
    useSemanticLayerModel,
    useAppliesAsPullRequest,
    useUndoSemanticLayerChanges,
} from './useSemanticLayerModel';
import { findCheckedOutModel, useStudioCheckout } from './useStudioCheckout';

/** Fades the lines around the marked definition; hovering the code brings them back. */
const ISOLATE_BLOCK_CSS = `
[data-line]:not([data-selected-line]),
[data-column-number]:not([data-selected-line]) {
    opacity: 0.3;
    transition: opacity 150ms ease;
}
:host(:hover) :is([data-line], [data-column-number]) { opacity: 1; }
`;

/** A model's YAML, read only, as the checked-out change leaves it. */
export const ModelCodeView: FC<{
    projectUuid: string;
    modelName: string;
    fieldName: string | null;
}> = ({ projectUuid, modelName, fieldName }) => {
    const colorScheme = useComputedColorScheme('light');
    const { data: model, isLoading } = useSemanticLayerModel(
        projectUuid,
        modelName,
    );
    const { shown } = useStudioCheckout();
    const drafted = findCheckedOutModel(shown, modelName);
    const isDraft = drafted !== null;
    const content = drafted ? drafted.contentAfter : (model?.content ?? null);
    const block =
        fieldName && content ? findFieldBlock(content, fieldName) : null;
    const line = block?.start ?? null;
    const editor = useRef<HTMLDivElement>(null);
    // The viewer marks the line but does not bring it into view, and it renders after this does.
    useEffect(() => {
        if (line === null) return undefined;
        let frame = 0;
        let tries = 0;
        const reveal = () => {
            const target = editor.current
                ?.querySelector('diffs-container')
                ?.shadowRoot?.querySelector(`[data-line="${line}"]`);
            if (target) target.scrollIntoView({ block: 'center' });
            else if (tries < 60) {
                tries += 1;
                frame = requestAnimationFrame(reveal);
            }
        };
        reveal();
        return () => cancelAnimationFrame(frame);
    }, [line, modelName]);
    if (isLoading) return null;
    if (!model && !isDraft) {
        return (
            <Text fz="sm" c="dimmed" ta="center" py="xl">
                This model was deployed from elsewhere, so its YAML is not here.
            </Text>
        );
    }
    return (
        <Box className={classes.codePane}>
            <Group
                className={classes.codeToolbar}
                justify="space-between"
                wrap="nowrap"
            >
                <Text fz="xs" c="dimmed" truncate>
                    {modelName}.yml
                    {isDraft
                        ? ', not published yet'
                        : `, version ${model?.version}`}
                </Text>
                <Group gap="xs" wrap="nowrap" flex="none">
                    {content !== null ? (
                        <CopyActionIcon value={content} copyLabel="Copy YAML" />
                    ) : null}
                </Group>
            </Group>
            <Box className={classes.codeEditor} ref={editor}>
                {content === null ? (
                    <Text fz="sm" c="dimmed" p="md">
                        This change removes this model.
                    </Text>
                ) : (
                    <WorkerPoolContextProvider
                        poolOptions={PIERRE_POOL_OPTIONS}
                        highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                    >
                        <File
                            file={{
                                name: `${modelName}.yml`,
                                contents: content,
                            }}
                            selectedLines={block}
                            options={{
                                theme:
                                    colorScheme === 'dark'
                                        ? 'pierre-dark'
                                        : 'pierre-light',
                                overflow: 'wrap',
                                disableFileHeader: true,
                                unsafeCSS: block ? ISOLATE_BLOCK_CSS : '',
                            }}
                        />
                    </WorkerPoolContextProvider>
                )}
            </Box>
        </Box>
    );
};

const HistoryPane: FC<{
    projectUuid: string;
    modelName: string;
    history: SemanticLayerModelChange[];
}> = ({ projectUuid, modelName, history }) => {
    const undo = useUndoSemanticLayerChanges(projectUuid);
    const { shown } = useStudioCheckout();
    const [, setSearchParams] = useSearchParams();
    const unpublished = findCheckedOutModel(shown, modelName);
    const [open, setOpen] = useState<string | null>(
        history[0]?.changeSetUuid ?? null,
    );
    if (history.length === 0 && !unpublished) {
        return (
            <Paper variant="dotted" p="md">
                <Text fz="sm" c="dimmed">
                    No changes recorded yet. The next change to this model shows
                    up here.
                </Text>
            </Paper>
        );
    }
    return (
        <WorkerPoolContextProvider
            poolOptions={PIERRE_POOL_OPTIONS}
            highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
        >
            {unpublished ? (
                <Paper variant="dotted" p="sm" mb="sm">
                    <Group gap="sm" justify="space-between" wrap="nowrap">
                        <Box miw={0}>
                            <Text fz="sm">Your changes in development</Text>
                            <Text fz="xs" c="dimmed">
                                Not live. Only you see them until you publish;
                                everything below is live.
                            </Text>
                        </Box>
                        <Button
                            size="compact-xs"
                            variant="default"
                            flex="none"
                            onClick={() =>
                                setSearchParams({ [DRAFT_PARAM]: DRAFT_REVIEW })
                            }
                        >
                            Review
                        </Button>
                    </Group>
                </Paper>
            ) : null}
            <Accordion variant="contained" value={open} onChange={setOpen}>
                {history.map((change) => (
                    <Accordion.Item
                        key={change.changeSetUuid}
                        value={change.changeSetUuid}
                    >
                        <Group gap="xs" pr="xs" wrap="nowrap">
                            <Accordion.Control
                                className={classes.changeControl}
                            >
                                <Text
                                    fz="sm"
                                    truncate
                                    title={changeTitle(change)}
                                >
                                    {changeTitle(change)}
                                </Text>
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    truncate
                                    title={dayjs(change.createdAt).format(
                                        'YYYY-MM-DD HH:mm',
                                    )}
                                >
                                    {CHANGE_KIND_VERBS[getChangeKind(change)]}{' '}
                                    {dayjs(change.createdAt).fromNow()}
                                    {change.by ? ` by ${change.by}` : ''}
                                    {change.replaced
                                        ? `, replacing ${change.replaced.by ?? 'someone'}'s ${change.replaced.paths.join(', ')}`
                                        : ''}
                                    {change.otherModels.length > 0
                                        ? `, along with ${change.otherModels.join(', ')}`
                                        : ''}
                                </Text>
                            </Accordion.Control>
                            {change.reverted ? (
                                <Badge className={classes.undo}>Undone</Badge>
                            ) : change.source !== 'undo' ? (
                                <Button
                                    className={classes.undo}
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    disabled={undo.isLoading}
                                    onClick={() =>
                                        undo.mutate([change.changeSetUuid])
                                    }
                                >
                                    Undo
                                </Button>
                            ) : null}
                        </Group>
                        <Accordion.Panel>
                            {open === change.changeSetUuid ? (
                                <ChangeDiff
                                    modelName={modelName}
                                    change={change}
                                    variant="full"
                                />
                            ) : null}
                        </Accordion.Panel>
                    </Accordion.Item>
                ))}
            </Accordion>
        </WorkerPoolContextProvider>
    );
};

export const ModelTabs: FC<{
    projectUuid: string;
    modelName: string;
    /** The explore queries run on; pre-aggregates are kept by this name. */
    exploreName: string;
    fields: ReactNode;
    /** The explore's lineage: its upstream dbt models and its joins; null where it does not apply. */
    lineage?: ReactNode;
}> = ({ projectUuid, modelName, exploreName, fields, lineage = null }) => {
    const { data: model } = useSemanticLayerModel(projectUuid, modelName);
    // A repository keeps its own history.
    const asPullRequest = useAppliesAsPullRequest(projectUuid);
    const hasHistory = !!model && !asPullRequest;
    const hasLineage = lineage !== null;
    const hasPreAggregates = useHealth().data?.preAggregates.enabled === true;
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get(VIEW_PARAM);
    const view =
        hasHistory && requested === 'history'
            ? 'history'
            : hasLineage && requested === 'lineage'
              ? 'lineage'
              : hasPreAggregates && requested === 'pre-aggregates'
                ? 'pre-aggregates'
                : 'fields';
    return (
        <Tabs
            className={classes.root}
            value={view}
            onChange={(next) =>
                setSearchParams(
                    next === 'history' ||
                        next === 'lineage' ||
                        next === 'pre-aggregates'
                        ? { [VIEW_PARAM]: next }
                        : {},
                    { replace: true },
                )
            }
        >
            {hasHistory || hasLineage || hasPreAggregates ? (
                <Tabs.List mb="md">
                    <Tabs.Tab value="fields">Fields</Tabs.Tab>
                    {hasLineage ? (
                        <Tabs.Tab value="lineage">Lineage</Tabs.Tab>
                    ) : null}
                    {hasPreAggregates ? (
                        <Tabs.Tab value="pre-aggregates">
                            Pre-aggregates
                        </Tabs.Tab>
                    ) : null}
                    {hasHistory ? (
                        <Tabs.Tab value="history">History</Tabs.Tab>
                    ) : null}
                </Tabs.List>
            ) : null}
            <Tabs.Panel value="fields" className={classes.panel}>
                {fields}
            </Tabs.Panel>
            {view === 'lineage' ? (
                <Tabs.Panel value="lineage" className={classes.panel}>
                    {lineage}
                </Tabs.Panel>
            ) : null}
            {view === 'pre-aggregates' ? (
                <Tabs.Panel value="pre-aggregates" className={classes.panel}>
                    <ModelPreAggregates
                        projectUuid={projectUuid}
                        exploreName={exploreName}
                    />
                </Tabs.Panel>
            ) : null}
            {model && view === 'history' ? (
                <Tabs.Panel value="history" className={classes.panel}>
                    <HistoryPane
                        projectUuid={projectUuid}
                        modelName={model.name}
                        history={model.history}
                    />
                </Tabs.Panel>
            ) : null}
        </Tabs>
    );
};
