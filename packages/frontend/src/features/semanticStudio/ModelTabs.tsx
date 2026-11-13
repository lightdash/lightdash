/** A model's page: its fields, its YAML for the Code view, and the history of a model kept on the server. */
import { type SemanticLayerModelChange } from '@lightdash/common';
import {
    Accordion,
    Badge,
    Box,
    Button,
    Group,
    Paper,
    SegmentedControl,
    Tabs,
    Text,
} from '@mantine/core';
import { WorkerPoolContextProvider } from '@pierre/diffs/react';
import dayjs from 'dayjs';
import { useCallback, useState, type FC, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { CopyActionIcon } from '../../components/common/CopyActionIcon';
import {
    Editor,
    type BeforeMount,
    type OnMount,
} from '../../components/MonacoEditor';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import { useEditorTheme } from '../../hooks/useEditorTheme';
import { getLightdashMonacoTheme } from '../sqlRunner/utils/monaco';
import { ChangeDiff } from './ChangeDiff';
import {
    CHANGE_KIND_VERBS,
    DRAFT_PARAM,
    DRAFT_REVIEW,
    getChangeKind,
    changeTitle,
    findFieldLine,
    VIEW_PARAM,
} from './modelCode';
import classes from './ModelTabs.module.css';
import {
    useSemanticLayerDraft,
    useSemanticLayerModel,
    useAppliesAsPullRequest,
    useUndoSemanticLayerChanges,
} from './useSemanticLayerModel';

const EDITOR_OPTIONS = {
    readOnly: true,
    domReadOnly: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    fontSize: 12,
} as const;

const defineThemes: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('lightdash-light', {
        base: 'vs',
        inherit: true,
        ...getLightdashMonacoTheme('light'),
    });
    monaco.editor.defineTheme('lightdash-dark', {
        base: 'vs-dark',
        inherit: true,
        ...getLightdashMonacoTheme('dark'),
    });
};

/** A model's YAML, read only: its draft when it has one, or what is live. */
export const ModelCodeView: FC<{
    projectUuid: string;
    modelName: string;
    fieldName: string | null;
}> = ({ projectUuid, modelName, fieldName }) => {
    const { monaco: theme } = useEditorTheme();
    const { data: model, isLoading } = useSemanticLayerModel(
        projectUuid,
        modelName,
    );
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const draftContent = draft?.models.find(
        (drafted) => drafted.model === modelName,
    )?.contentAfter;
    const [version, setVersion] = useState<'draft' | 'live'>('draft');
    const isDraft = draftContent !== undefined && version === 'draft';
    const content = isDraft ? draftContent : (model?.content ?? null);
    const onMount: OnMount = useCallback(
        (editor) => {
            const line =
                fieldName && content ? findFieldLine(content, fieldName) : null;
            if (line === null) return;
            editor.revealLineInCenter(line);
            editor.setPosition({ lineNumber: line, column: 1 });
        },
        [fieldName, content],
    );
    if (isLoading) return null;
    if (!model && draftContent === undefined) {
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
                    {isDraft ? ', your draft' : `, version ${model?.version}`}
                </Text>
                <Group gap="xs" wrap="nowrap" flex="none">
                    {draftContent !== undefined && model ? (
                        <SegmentedControl
                            size="xs"
                            value={version}
                            onChange={(next) =>
                                setVersion(next === 'live' ? 'live' : 'draft')
                            }
                            data={[
                                { value: 'draft', label: 'Draft' },
                                { value: 'live', label: 'Live' },
                            ]}
                        />
                    ) : null}
                    {content !== null ? (
                        <CopyActionIcon value={content} copyLabel="Copy YAML" />
                    ) : null}
                </Group>
            </Group>
            <Box className={classes.codeEditor}>
                {content === null ? (
                    <Text fz="sm" c="dimmed" p="md">
                        Your draft removes this model.
                    </Text>
                ) : (
                    <Editor
                        height="100%"
                        language="yaml"
                        theme={theme}
                        value={content}
                        beforeMount={defineThemes}
                        onMount={onMount}
                        options={EDITOR_OPTIONS}
                    />
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
    const { data: draft } = useSemanticLayerDraft(projectUuid);
    const [, setSearchParams] = useSearchParams();
    const unpublished = draft?.models.find(({ model }) => model === modelName);
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
    fields: ReactNode;
}> = ({ projectUuid, modelName, fields }) => {
    const { data: model } = useSemanticLayerModel(projectUuid, modelName);
    // A repository keeps its own history.
    const asPullRequest = useAppliesAsPullRequest(projectUuid);
    const [searchParams, setSearchParams] = useSearchParams();
    const view =
        model && !asPullRequest && searchParams.get(VIEW_PARAM) === 'history'
            ? 'history'
            : 'fields';
    return (
        <Tabs
            className={classes.root}
            value={view}
            onChange={(next) =>
                setSearchParams(
                    next === 'history' ? { [VIEW_PARAM]: next } : {},
                    { replace: true },
                )
            }
        >
            {model && !asPullRequest ? (
                <Tabs.List mb="md">
                    <Tabs.Tab value="fields">Fields</Tabs.Tab>
                    <Tabs.Tab value="history">History</Tabs.Tab>
                </Tabs.List>
            ) : null}
            <Tabs.Panel value="fields" className={classes.panel}>
                {fields}
            </Tabs.Panel>
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
