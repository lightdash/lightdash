import { assertUnreachable } from '@lightdash/common';
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
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Provider } from 'react-redux';
import MantineIcon from '../../components/common/MantineIcon';
import MantineModal from '../../components/common/MantineModal';
import Page from '../../components/common/Page/Page';
import Explorer from '../../components/Explorer';
import ExploreSideBar from '../../components/Explorer/ExploreSideBar';
import { useExplorerQueryEffects } from '../../hooks/useExplorerQueryEffects';
import { useExplores } from '../../hooks/useExplores';
import { ExplorerSection } from '../../providers/Explorer/types';
import { ModalHostedContext } from '../../providers/Explorer/useIsModalHosted';
import {
    buildInitialExplorerState,
    createExplorerStore,
    explorerActions,
    selectMetricQuery,
    useExplorerDispatch,
    useExplorerSelector,
} from '../explorer/store';
import { CHANGE_KIND_STYLE } from './modelCode';
import classes from './TryItModal.module.css';
import { pullRequestNumberOf } from './urls';
import { useUnbuiltFields } from './useFieldChangesInDevelopment';
import {
    useChangeSet,
    type ChangedField,
    withOneGrainPerDate,
} from './useModelFieldChanges';
import { useSemanticLayerFieldUsage } from './useSemanticLayerModel';

/** How many field chips show before the rest go in a menu. */
const SHOWN = 6;

const buildState = (
    model: string,
    fields: ChangedField[],
    unbuilt: Set<string>,
) => {
    const state = buildInitialExplorerState({ isEditMode: true });
    const tried = withOneGrainPerDate(
        fields.filter(
            ({ kind, fieldId }) => kind !== 'removed' && !unbuilt.has(fieldId),
        ),
    );
    const metrics = tried.filter(({ isMetric }) => isMetric);
    // Metrics open by one date; a change with no metric shows its dimensions.
    const dimensions =
        metrics.length > 0
            ? tried.filter(({ date }) => date !== null).slice(0, 1)
            : tried.filter(({ isMetric }) => !isMetric);
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
                    dimensions: dimensions.map(({ fieldId }) => fieldId),
                    metrics: metrics.map(({ fieldId }) => fieldId),
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

type ChipState = 'removed' | 'unbuilt' | 'on' | 'off';

const describeChip = (state: ChipState, usage: string | null): string => {
    switch (state) {
        case 'removed':
            return `Removed, so it cannot be tried.${usage ? ` ${usage}.` : ''}`;
        case 'unbuilt':
            return 'Not in the warehouse yet. You can try it once this merges and dbt builds the model.';
        case 'on':
        case 'off':
            return `${state === 'on' ? 'Remove from' : 'Add to'} the query.${usage ? ` ${usage}, so its numbers may move.` : ''}`;
        default:
            return assertUnreachable(state, 'Unknown chip state');
    }
};

/** One changed field, in the query or not at a click; a removed or unbuilt one cannot be queried, so it only says why. */
const FieldChip: FC<{
    field: ChangedField;
    charts: number;
    isUnbuilt: boolean;
}> = ({ field, charts, isUnbuilt }) => {
    const dispatch = useExplorerDispatch();
    const { dimensions, metrics } = useExplorerSelector(selectMetricQuery);
    const isRemoved = field.kind === 'removed';
    const isOff = isRemoved || isUnbuilt;
    const isOn =
        !isOff &&
        (field.isMetric ? metrics : dimensions).includes(field.fieldId);
    const usage = describeUsage(charts);
    let state: ChipState = isOn ? 'on' : 'off';
    if (isRemoved) state = 'removed';
    else if (isUnbuilt) state = 'unbuilt';
    return (
        <Tooltip multiline w={240} label={describeChip(state, usage)}>
            <Button
                size="compact-xs"
                variant={isOn ? 'light' : 'default'}
                color={isOn ? 'gray' : undefined}
                flex="none"
                data-disabled={isOff || undefined}
                aria-disabled={isOff}
                aria-pressed={isOff ? undefined : isOn}
                leftSection={
                    <Badge
                        component="span"
                        size="xs"
                        color={CHANGE_KIND_STYLE[field.kind].color}
                    >
                        {CHANGE_KIND_STYLE[field.kind].label}
                    </Badge>
                }
                rightSection={
                    isOn ? <MantineIcon icon={IconCheck} size={12} /> : null
                }
                td={isRemoved ? 'line-through' : undefined}
                onClick={() => {
                    if (isOff) return;
                    dispatch(
                        field.isMetric
                            ? explorerActions.toggleMetric(field.fieldId)
                            : explorerActions.toggleDimension(field.fieldId),
                    );
                }}
            >
                {field.label}
                {isUnbuilt && !isRemoved ? (
                    <Text span inherit c="dimmed" ml={6}>
                        not built yet
                    </Text>
                ) : null}
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
    unbuilt: Set<string>;
}> = ({ fields, chartsOf, unbuilt }) => (
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
                        isUnbuilt={unbuilt.has(field.fieldId)}
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
    unbuilt: Set<string>;
}> = ({ fields, chartsOf, unbuilt }) => {
    const shown = withOneGrainPerDate(fields);
    const ordered = [
        ...shown.filter(({ kind, isMetric }) => kind !== 'removed' && isMetric),
        ...shown.filter(
            ({ kind, isMetric }) => kind !== 'removed' && !isMetric,
        ),
        ...shown.filter(({ kind }) => kind === 'removed'),
    ];
    return (
        <>
            {ordered.slice(0, SHOWN).map((field) => (
                <FieldChip
                    key={field.key}
                    field={field}
                    charts={chartsOf(field)}
                    isUnbuilt={unbuilt.has(field.fieldId)}
                />
            ))}
            {ordered.length > SHOWN ? (
                <MoreFields
                    fields={ordered.slice(SHOWN)}
                    chartsOf={chartsOf}
                    unbuilt={unbuilt}
                />
            ) : null}
        </>
    );
};

/** A pull request's changes in Explore, over the page they were asked from; the app reads the changes only while it is open. */
export const TryItModal: FC<{
    projectUuid: string;
    models: string[];
    previewProjectUuid: string | null;
    prUrl: string | null;
    onClose: () => void;
}> = ({ projectUuid, models, previewProjectUuid, prUrl, onClose }) => {
    const changeSet = useChangeSet(projectUuid, models, previewProjectUuid);
    const unbuiltFields = useUnbuiltFields(projectUuid);
    const unbuilt = useMemo(
        () => new Set((unbuiltFields.data ?? []).map(({ fieldId }) => fieldId)),
        [unbuiltFields.data],
    );
    const [model, setModel] = useState(models[0]);
    const [store] = useState(() =>
        createExplorerStore({
            explorer: buildInitialExplorerState({ isEditMode: true }),
        }),
    );
    // The query starts from what changed once that is known, and again on each model switched to.
    const seeded = useRef(false);
    useEffect(() => {
        // Started once it is known which fields the warehouse cannot answer yet.
        if (!changeSet || unbuiltFields.isLoading || seeded.current) return;
        seeded.current = true;
        store.dispatch(
            explorerActions.reset(
                buildState(model, changeSet.get(model) ?? [], unbuilt),
            ),
        );
    }, [changeSet, model, store, unbuilt, unbuiltFields.isLoading]);
    const switchModel = (next: string) => {
        setModel(next);
        store.dispatch(
            explorerActions.reset(
                buildState(next, changeSet?.get(next) ?? [], unbuilt),
            ),
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
    const number = pullRequestNumberOf(prUrl);
    const title = (
        <span className={classes.tryTitle}>
            <Tooltip
                label={
                    prUrl
                        ? 'Only you see these changes until they are merged.'
                        : 'Only you see these changes until they are published.'
                }
            >
                <span>
                    Trying{' '}
                    {prUrl ? (
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
                    ) : (
                        'your draft'
                    )}
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
                    unbuilt={unbuilt}
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
