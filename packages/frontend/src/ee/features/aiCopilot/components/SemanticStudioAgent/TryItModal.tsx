import {
    Anchor,
    Badge,
    Button,
    Center,
    Group,
    Loader,
    Menu,
    Select,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCheck, IconTable } from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import Page from '../../../../../components/common/Page/Page';
import Explorer from '../../../../../components/Explorer';
import ExploreSideBar from '../../../../../components/Explorer/ExploreSideBar';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectMetricQuery,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import {
    useChangeSet,
    type ChangedField,
} from '../../../../../features/semanticStudio/useModelFieldChanges';
import { useSemanticLayerFieldUsage } from '../../../../../features/semanticStudio/useSemanticLayerModel';
import { useExplorerQueryEffects } from '../../../../../hooks/useExplorerQueryEffects';
import { useExplores } from '../../../../../hooks/useExplores';
import { ExplorerSection } from '../../../../../providers/Explorer/types';
import { ModalHostedContext } from '../../../../../providers/Explorer/useIsModalHosted';
import classes from './SemanticStudioAgent.module.css';

/** How many field chips show before the rest go in a menu. */
const SHOWN = 6;

const KINDS: Record<ChangedField['kind'], { label: string; color: string }> = {
    new: { label: 'New', color: 'green' },
    changed: { label: 'Changed', color: 'orange' },
    removed: { label: 'Removed', color: 'red' },
};

const buildState = (model: string, fields: ChangedField[]) => {
    const state = buildInitialExplorerState({ isEditMode: true });
    const tried = fields.filter(({ kind }) => kind !== 'removed');
    return buildInitialExplorerState({
        isEditMode: true,
        initialState: {
            queryExecution: { ...state.queryExecution, pendingFetch: true },
            expandedSections: [
                ExplorerSection.VISUALIZATION,
                ExplorerSection.RESULTS,
            ],
            unsavedChartVersion: {
                ...state.unsavedChartVersion,
                tableName: model,
                metricQuery: {
                    ...state.unsavedChartVersion.metricQuery,
                    exploreName: model,
                    dimensions: tried
                        .filter(({ isMetric }) => !isMetric)
                        .map(({ fieldId }) => fieldId),
                    metrics: tried
                        .filter(({ isMetric }) => isMetric)
                        .map(({ fieldId }) => fieldId),
                },
            },
        },
    });
};

const QueryEffects: FC = () => {
    useExplorerQueryEffects();
    return null;
};

const describeUsage = (charts: number): string | null =>
    charts > 0
        ? `${charts} saved ${charts === 1 ? 'chart reads' : 'charts read'} it`
        : null;

/** One changed field, in the query or not at a click; a removed one cannot be queried, so it only says what reads it. */
const FieldChip: FC<{ field: ChangedField; charts: number }> = ({
    field,
    charts,
}) => {
    const dispatch = useExplorerDispatch();
    const { dimensions, metrics } = useExplorerSelector(selectMetricQuery);
    const isRemoved = field.kind === 'removed';
    const isOn =
        !isRemoved &&
        (field.isMetric ? metrics : dimensions).includes(field.fieldId);
    const usage = describeUsage(charts);
    return (
        <Tooltip
            multiline
            w={240}
            label={
                isRemoved
                    ? `Removed, so it cannot be tried.${usage ? ` ${usage}.` : ''}`
                    : `${isOn ? 'Remove from' : 'Add to'} the query.${usage ? ` ${usage}, so its numbers may move.` : ''}`
            }
        >
            <Button
                size="compact-xs"
                variant={isOn ? 'light' : 'default'}
                color={isOn ? 'gray' : undefined}
                flex="none"
                data-disabled={isRemoved || undefined}
                aria-disabled={isRemoved}
                aria-pressed={isRemoved ? undefined : isOn}
                leftSection={
                    <Badge
                        component="span"
                        size="xs"
                        color={KINDS[field.kind].color}
                    >
                        {KINDS[field.kind].label}
                    </Badge>
                }
                rightSection={
                    isOn ? <MantineIcon icon={IconCheck} size={12} /> : null
                }
                td={isRemoved ? 'line-through' : undefined}
                onClick={() => {
                    if (isRemoved) return;
                    dispatch(
                        field.isMetric
                            ? explorerActions.toggleMetric(field.fieldId)
                            : explorerActions.toggleDimension(field.fieldId),
                    );
                }}
            >
                {field.label}
                {charts > 0 ? (
                    <Text span inherit c="orange" ml={6}>
                        {charts}
                    </Text>
                ) : null}
            </Button>
        </Tooltip>
    );
};

const MoreFields: FC<{
    fields: ChangedField[];
    chartsOf: (field: ChangedField) => number;
}> = ({ fields, chartsOf }) => (
    <Menu position="bottom-start" closeOnItemClick={false}>
        <Menu.Target>
            <Button size="compact-xs" variant="subtle" color="gray">
                +{fields.length} more
            </Button>
        </Menu.Target>
        <Menu.Dropdown>
            <Group gap={6} maw={420} p={4}>
                {fields.map((field) => (
                    <FieldChip
                        key={field.key}
                        field={field}
                        charts={chartsOf(field)}
                    />
                ))}
            </Group>
        </Menu.Dropdown>
    </Menu>
);

/** What a model's change touches, as chips: what can be tried first, then what is gone. */
const FieldChips: FC<{
    fields: ChangedField[];
    chartsOf: (field: ChangedField) => number;
}> = ({ fields, chartsOf }) => {
    const ordered = [
        ...fields.filter(({ kind }) => kind !== 'removed'),
        ...fields.filter(({ kind }) => kind === 'removed'),
    ];
    return (
        <>
            {ordered.slice(0, SHOWN).map((field) => (
                <FieldChip
                    key={field.key}
                    field={field}
                    charts={chartsOf(field)}
                />
            ))}
            {ordered.length > SHOWN ? (
                <MoreFields fields={ordered.slice(SHOWN)} chartsOf={chartsOf} />
            ) : null}
        </>
    );
};

/** A pull request's changes in Explore, over the page they were asked from; the app reads the changes only while it is open. */
export const TryItModal: FC<{
    projectUuid: string;
    models: string[];
    previewProjectUuid: string | null;
    prUrl: string;
    onClose: () => void;
}> = ({ projectUuid, models, previewProjectUuid, prUrl, onClose }) => {
    const changeSet = useChangeSet(projectUuid, models, previewProjectUuid);
    const [model, setModel] = useState(models[0]);
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildInitialExplorerState({ isEditMode: true }),
        }),
    );
    // The query starts from what changed once that is known, and again on each model switched to.
    const seeded = useRef(false);
    useEffect(() => {
        if (!changeSet || seeded.current) return;
        seeded.current = true;
        store.dispatch(
            explorerActions.reset(
                buildState(model, changeSet.get(model) ?? []),
            ),
        );
    }, [changeSet, model, store]);
    const switchModel = (next: string) => {
        setModel(next);
        store.dispatch(
            explorerActions.reset(buildState(next, changeSet?.get(next) ?? [])),
        );
    };
    const touched = changeSet
        ? [...changeSet].flatMap(([name, fields]) =>
              fields.flatMap(({ fieldId, label, kind }) =>
                  kind === 'new' ? [] : [{ model: name, fieldId, label, kind }],
              ),
          )
        : [];
    const { data: usage } = useSemanticLayerFieldUsage(projectUuid, touched);
    const chartsOf = (field: ChangedField) =>
        usage?.fields.find(({ fieldId }) => fieldId === field.fieldId)?.charts
            .length ?? 0;
    const { data: explores } = useExplores(projectUuid, true);
    const labelOf = (name: string) =>
        explores?.find((explore) => explore.name === name)?.label ?? name;
    const number = /\/(\d+)\/?$/.exec(prUrl)?.[1];
    const title = (
        <span className={classes.tryTitle}>
            <Tooltip label="Only you see these changes until they are merged.">
                <span>
                    Trying{' '}
                    <Anchor
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="always"
                        inherit
                        c="inherit"
                    >
                        {number ? `#${number}` : 'the pull request'}
                    </Anchor>
                </span>
            </Tooltip>
            {models.length > 1 ? (
                <Select
                    size="xs"
                    w={220}
                    aria-label="Model"
                    value={model}
                    onChange={(next) => next && switchModel(next)}
                    allowDeselect={false}
                    leftSection={<MantineIcon icon={IconTable} size={14} />}
                    data={models.map((name) => ({
                        value: name,
                        label: labelOf(name),
                    }))}
                    renderOption={({ option }) => (
                        <Group justify="space-between" wrap="nowrap" w="100%">
                            <Text fz="xs" truncate>
                                {option.label}
                            </Text>
                            <Text fz="xs" c="dimmed" flex="none">
                                {changeSet?.get(option.value)?.length ?? 0}
                            </Text>
                        </Group>
                    )}
                />
            ) : (
                <span className={classes.tryModel}>
                    <MantineIcon icon={IconTable} size={14} />
                    {labelOf(model)}
                </span>
            )}
            {changeSet ? (
                <FieldChips
                    fields={changeSet.get(model) ?? []}
                    chartsOf={chartsOf}
                />
            ) : null}
        </span>
    );
    return (
        <Provider store={store}>
            <QueryEffects />
            <MantineModal
                opened
                fullScreen
                title={title}
                onClose={onClose}
                cancelLabel={false}
                modalRootProps={{ yOffset: 56, xOffset: 40 }}
                modalHeaderProps={{ py: 'xs' }}
                modalBodyProps={{ px: 0, py: 0 }}
            >
                <ModalHostedContext.Provider value={{ isModalHosted: true }}>
                    {/* The modal says what is being tried, so the dock steps aside. */}
                    <span data-studio-try-it hidden />
                    {changeSet ? (
                        <Page
                            withContainerHeight
                            withFullHeight
                            withPaddedContent
                            sidebar={
                                <ExploreSideBar onBackToTables={onClose} />
                            }
                        >
                            <Explorer hideHeader />
                        </Page>
                    ) : (
                        <Center p="xl">
                            <Loader size="sm" />
                        </Center>
                    )}
                </ModalHostedContext.Provider>
            </MantineModal>
        </Provider>
    );
};
