import {
    getItemId,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
    type LightdashProjectParameter,
} from '@lightdash/common';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import FieldSelect from '../../components/common/FieldSelect';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectAreParameterControlsSaved,
    selectDashboardFilters,
    selectDashboardParameterDefinitions,
    selectDashboardTiles,
    selectHaveParameterControlsChanged,
    selectParameterControls,
    selectParameterValues,
    dashboardParametersActions,
    useDashboardStore,
    selectTileParameterReferences,
    useDashboardSelector,
} from '../dashboard/store';
import {
    getLinkCandidates,
    getLinkDefault,
    getLinkKey,
    getParameterLinkPrompts,
    type ParameterLinkPrompt,
} from './linkCandidates';
import { setParameterKeyTiles } from './parameterPeers';
import { setTileField, type FieldsByTile } from './peers';
import classes from './TileOverlay.module.css';
import { getTileTitle } from './tileProps';
import { getTileSelector, LOCKED_TILE_CLASS } from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import {
    getParameterEntryName,
    useParameterBarControls,
} from './useParameterBarControls';
import { useParameterEditorSelector } from './useParameterEditor';
import { usePortalTargets } from './usePortalTargets';

// Dismissed with the filters' links: a key never looks like a rule id
const getParameterLinkId = (key: string) => `parameter:${key}`;

type Prompt = {
    rule: DashboardFilterRule;
    candidates: DashboardFieldTarget[];
    defaultChoice: string | null;
};

type FieldsMap = Record<string, DashboardFilterableField>;

// A rule id present with null was cleared; absent means the default choice
type Picks = Record<string, string | null>;

// A pick that is no longer offered is dropped
const getChoice = (prompt: Prompt, picks: Picks): string | null => {
    if (!(prompt.rule.id in picks)) return prompt.defaultChoice;
    const picked = picks[prompt.rule.id];
    if (picked === null) return null;
    return prompt.candidates.some((candidate) => candidate.fieldId === picked)
        ? picked
        : prompt.defaultChoice;
};

const getCandidateFields = (
    { candidates }: Prompt,
    fieldsMap: FieldsMap,
): DashboardFilterableField[] =>
    candidates.flatMap((candidate) => {
        const field = fieldsMap[candidate.fieldId];
        return field ? [field] : [];
    });

const getChoiceField = (
    prompt: Prompt,
    picks: Picks,
    fieldsMap: FieldsMap,
): DashboardFilterableField | undefined => {
    const choice = getChoice(prompt, picks);
    return choice === null ? undefined : fieldsMap[choice];
};

const plural = (count: number, one: string, many: string) =>
    count === 1 ? one : many;

const focusTile = (tileUuid: string) => {
    const tileElement = document.querySelector<HTMLElement>(
        getTileSelector(tileUuid),
    );
    if (tileElement === null) return;
    if (!tileElement.hasAttribute('tabindex')) tileElement.tabIndex = -1;
    tileElement.focus();
};

type CardProps = {
    tile: DashboardTile;
    rows: Prompt[];
    fieldsByTile: FieldsByTile;
    fieldsMap: FieldsMap;
    getLabel: (fieldId: string) => string;
};

const LinkCard: FC<CardProps> = ({
    tile,
    rows,
    fieldsByTile,
    fieldsMap,
    getLabel,
}) => {
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const dismissLink = useControlsSidebarSelector((c) => c.dismissLink);
    const [picks, setPicks] = useState<Picks>({});
    const getUiString = useUiStrings();
    const tileTitle = getTileTitle(
        tile,
        getUiString('filters.tileCard.thisTile'),
    );
    const getFilterLabel = (rule: DashboardFilterRule) =>
        rule.label ?? getLabel(rule.target.fieldId);

    const linkCount = rows.filter(
        (row) => getChoice(row, picks) !== null,
    ).length;
    const skipCount = rows.length - linkCount;

    const skipAll = () => {
        focusTile(tile.uuid);
        rows.forEach(({ rule }) => dismissLink(tile.uuid, rule.id));
    };
    const applyAll = () => {
        focusTile(tile.uuid);
        rows.forEach((row) => {
            const chosen = getChoice(row, picks);
            const target = row.candidates.find(
                (candidate) => candidate.fieldId === chosen,
            );
            if (target)
                updateFilter(
                    setTileField(row.rule, tile, target, fieldsByTile),
                );
            else dismissLink(tile.uuid, row.rule.id);
        });
    };

    const applyLabel =
        rows.length === 1 || linkCount === 0
            ? 'Apply'
            : skipCount === 0
              ? `Apply all ${linkCount}`
              : `Apply ${linkCount}, skip ${skipCount}`;
    const applyName =
        linkCount === 0
            ? `Apply filters to ${tileTitle}`
            : `Apply ${linkCount} ${plural(linkCount, 'filter', 'filters')} to ${tileTitle}${
                  skipCount > 0 && rows.length > 1 ? `, skip ${skipCount}` : ''
              }`;

    return (
        <Stack gap="sm" className={classes.promptBody}>
            <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text fz="xs" c="dimmed">
                    {rows.length === 1
                        ? 'This tile can use a filter'
                        : `This tile can use ${rows.length} filters`}
                </Text>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    aria-label={
                        rows.length === 1
                            ? `Skip ${getFilterLabel(rows[0].rule)} on ${tileTitle}`
                            : `Skip all filters on ${tileTitle}`
                    }
                    onClick={skipAll}
                >
                    {rows.length === 1 ? 'Skip' : 'Skip all'}
                </Button>
            </Group>
            <Stack gap="sm" className={classes.promptRows}>
                {rows.map((row) => {
                    const filterLabel = getFilterLabel(row.rule);
                    return (
                        <Stack gap="xs" key={row.rule.id}>
                            <Text fz="sm" fw={600}>
                                {filterLabel}
                            </Text>
                            <FieldSelect
                                size="xs"
                                miw={0}
                                hasGrouping
                                aria-label={`Field for ${filterLabel} on this tile`}
                                placeholder="Not filtered"
                                clearable
                                // Picking the chosen field again clears it
                                allowDeselect
                                comboboxProps={{ withinPortal: true }}
                                item={getChoiceField(row, picks, fieldsMap)}
                                items={getCandidateFields(row, fieldsMap)}
                                onChange={(field) =>
                                    setPicks((current) => ({
                                        ...current,
                                        [row.rule.id]: field
                                            ? getItemId(field)
                                            : null,
                                    }))
                                }
                            />
                        </Stack>
                    );
                })}
            </Stack>
            <Group justify="flex-end">
                <Button
                    size="compact-xs"
                    aria-label={applyName}
                    disabled={linkCount === 0}
                    onClick={applyAll}
                >
                    {applyLabel}
                </Button>
            </Group>
        </Stack>
    );
};

type ParameterCardProps = {
    tile: DashboardTile;
    rows: ParameterLinkPrompt[];
    definitions: Record<string, LightdashProjectParameter>;
    tileParameterReferences: Record<string, string[]>;
    controlNameOf: (id: string) => string;
};

const ParameterLinkCard: FC<ParameterCardProps> = ({
    tile,
    rows,
    definitions,
    tileParameterReferences,
    controlNameOf,
}) => {
    const dismissLink = useControlsSidebarSelector((c) => c.dismissLink);
    const add = useParameterEditorSelector((c) => c.add);
    const store = useDashboardStore();
    const parameterValues = useDashboardSelector(selectParameterValues);
    const getUiString = useUiStrings();
    const tileTitle = getTileTitle(
        tile,
        getUiString('filters.tileCard.thisTile'),
    );

    return (
        <Stack
            gap="sm"
            className={`${classes.promptBody} ${classes.promptRows}`}
        >
            {rows.map(({ key, label, controlIds }) => {
                const addToBar = () => {
                    const tileUuids =
                        controlIds.length > 0
                            ? [tile.uuid]
                            : Object.keys(tileParameterReferences).filter(
                                  (tileUuid) =>
                                      tileParameterReferences[
                                          tileUuid
                                      ].includes(key),
                              );
                    add({
                        control: {
                            id: uuidv4(),
                            label: null,
                            value: parameterValues[key] ?? null,
                            valueType: {
                                type: definitions[key]?.type ?? 'string',
                                multiple: definitions[key]?.multiple ?? false,
                            },
                            parameters: {
                                [key]:
                                    controlIds.length > 0
                                        ? { only: [tile.uuid] }
                                        : 'all',
                            },
                        },
                        parameterKeys: [key],
                        tileUuids,
                    });
                };
                return (
                    <Stack gap="xs" key={key}>
                        <Group justify="space-between" wrap="nowrap" gap="xs">
                            <Text fz="sm">
                                Uses{' '}
                                <Text span fz="sm" fw={600}>
                                    {label}
                                </Text>
                            </Text>
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                aria-label={`Skip ${label} on ${tileTitle}`}
                                onClick={() => {
                                    focusTile(tile.uuid);
                                    dismissLink(
                                        tile.uuid,
                                        getParameterLinkId(key),
                                    );
                                }}
                            >
                                Skip
                            </Button>
                        </Group>
                        <Group justify="flex-end" gap="xs">
                            {controlIds.map((controlId, index) => (
                                <Button
                                    key={controlId}
                                    size="compact-xs"
                                    variant={index === 0 ? 'filled' : 'default'}
                                    aria-label={`Set by ${controlNameOf(controlId)}: ${label} on ${tileTitle}`}
                                    onClick={() => {
                                        focusTile(tile.uuid);
                                        const state =
                                            store.getState().parameters;
                                        if (state.parameterControls === null)
                                            return;
                                        const next = setParameterKeyTiles({
                                            controls: state.parameterControls,
                                            controlId,
                                            key,
                                            tileUuids: [tile.uuid],
                                            tileParameterReferences:
                                                state.tileParameterReferences,
                                            included: true,
                                            userParameterNames: Object.keys(
                                                state.parameterDefinitions,
                                            ),
                                        });
                                        if (next !== state.parameterControls)
                                            store.dispatch(
                                                dashboardParametersActions.setParameterControls(
                                                    next,
                                                ),
                                            );
                                    }}
                                >
                                    {`Set by ${controlNameOf(controlId)}`}
                                </Button>
                            ))}
                            <Button
                                size="compact-xs"
                                variant={
                                    controlIds.length === 0
                                        ? 'filled'
                                        : 'default'
                                }
                                aria-label={`Add to the bar: ${label} on ${tileTitle}`}
                                onClick={addToBar}
                            >
                                Add to the bar
                            </Button>
                        </Group>
                    </Stack>
                );
            })}
        </Stack>
    );
};

export const LinkPrompts: FC = () => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const newTileUuids = useControlsSidebarSelector((c) => c.newTileUuids);
    const dismissedLinks = useControlsSidebarSelector((c) => c.dismissedLinks);
    const { mode } = useParams<{ mode?: string }>();
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const parameterEditingId = useParameterEditorSelector((c) => c.editingId);
    const controls = useDashboardSelector(selectParameterControls);
    // Filled from the tiles, the list already has every parameter they use
    const isControlListExplicit = useDashboardSelector(
        (state) =>
            selectAreParameterControlsSaved(state) ||
            selectHaveParameterControlsChanged(state),
    );
    const references = useDashboardSelector(selectTileParameterReferences);
    const definitions = useDashboardSelector(
        selectDashboardParameterDefinitions,
    );
    const { entries } = useParameterBarControls();
    const isParameterMapping = useParameterEditorSelector((c) => c.isMapping);
    // Never on a tile card: a filter's or a parameter control's
    const isEnabled =
        mode === 'edit' &&
        !isSidebarOpen &&
        parameterEditingId === null &&
        !isParameterMapping;
    // Parameter rows never stack on a parameter control's tile overlays
    const isParameterEnabled =
        mode === 'edit' &&
        parameterEditingId === null &&
        controls !== null &&
        isControlListExplicit;

    const prompts = useMemo(() => {
        const tiles = (dashboardTiles ?? []).filter((tile) =>
            newTileUuids.includes(tile.uuid),
        );
        return tiles.flatMap((tile) => {
            const rows = dashboardFilters.dimensions.flatMap((rule) => {
                if (dismissedLinks.includes(getLinkKey(tile.uuid, rule.id)))
                    return [];
                const candidates = getLinkCandidates(
                    rule,
                    tile,
                    dashboardTiles,
                    fieldsByTile,
                    fieldsMap,
                );
                if (candidates.length === 0) return [];
                const defaultChoice = getLinkDefault(
                    rule,
                    candidates,
                    dashboardTiles,
                    fieldsMap,
                );
                return [{ rule, candidates, defaultChoice }];
            });
            const parameterRows =
                controls === null || !isParameterEnabled
                    ? []
                    : getParameterLinkPrompts({
                          tileUuid: tile.uuid,
                          controls,
                          tileParameterReferences: references,
                          definitions,
                      }).filter(
                          ({ key }) =>
                              !dismissedLinks.includes(
                                  getLinkKey(
                                      tile.uuid,
                                      getParameterLinkId(key),
                                  ),
                              ),
                      );
            return [{ tile, rows, parameterRows }];
        });
    }, [
        controls,
        isParameterEnabled,
        references,
        definitions,
        dashboardTiles,
        newTileUuids,
        dashboardFilters.dimensions,
        dismissedLinks,
        fieldsByTile,
        fieldsMap,
    ]);
    const shown = useMemo(
        () =>
            prompts.filter(
                ({ rows, parameterRows }) =>
                    rows.length > 0 || parameterRows.length > 0,
            ),
        [prompts],
    );
    const tileUuids = useMemo(
        () => shown.map(({ tile }) => tile.uuid),
        [shown],
    );
    const targets = usePortalTargets(
        tileUuids,
        getTileSelector,
        isEnabled,
        true,
    );
    const getLabel = useCallback(
        (fieldId: string) => fieldsMap[fieldId]?.label ?? fieldId,
        [fieldsMap],
    );
    // As the bar names its pills, else its first parameter's label
    const controlNameOf = useCallback(
        (id: string) => {
            const entry = entries.find(({ control }) => control.id === id);
            if (entry) return getParameterEntryName(entry);
            const control = controls?.find((item) => item.id === id);
            const key = control && Object.keys(control.parameters)[0];
            return (
                control?.label ?? (key ? definitions[key]?.label || key : id)
            );
        },
        [entries, controls, definitions],
    );

    if (!isEnabled) return null;

    return (
        <>
            {shown.map(({ tile, rows, parameterRows }) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                return createPortal(
                    <div
                        className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                        data-controls-overlay
                    >
                        <Paper
                            shadow="md"
                            p="sm"
                            radius="md"
                            className={`${classes.card} ${classes.promptCard}`}
                        >
                            <Stack gap="md" className={classes.promptStack}>
                                {rows.length > 0 && (
                                    <LinkCard
                                        tile={tile}
                                        rows={rows}
                                        fieldsByTile={fieldsByTile}
                                        fieldsMap={fieldsMap}
                                        getLabel={getLabel}
                                    />
                                )}
                                {parameterRows.length > 0 && (
                                    <ParameterLinkCard
                                        tile={tile}
                                        rows={parameterRows}
                                        definitions={definitions}
                                        tileParameterReferences={references}
                                        controlNameOf={controlNameOf}
                                    />
                                )}
                            </Stack>
                        </Paper>
                    </div>,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
