import {
    getItemId,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import FieldSelect from '../../components/common/FieldSelect';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectDashboardFilters,
    selectDashboardTiles,
    useDashboardSelector,
} from '../dashboard/store';
import {
    getLinkCandidates,
    getLinkDefault,
    getLinkKey,
} from './linkCandidates';
import { setTileField, type FieldsByTile } from './peers';
import classes from './TileOverlay.module.css';
import { getTileTitle } from './tileProps';
import {
    getTileSelector,
    LOCKED_TILE_CLASS,
    WAVE_BUCKETS,
} from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { usePortalTargets } from './usePortalTargets';

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
    const tileTitle = getTileTitle(tile);
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

export const LinkPrompts: FC = () => {
    const isRailOpen = useControlsSidebarSelector((c) => c.isRailOpen);
    const newTileUuids = useControlsSidebarSelector((c) => c.newTileUuids);
    const dismissedLinks = useControlsSidebarSelector((c) => c.dismissedLinks);
    const { mode } = useParams<{ mode?: string }>();
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const isEnabled = mode === 'edit' && !isRailOpen;

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
            return rows.length === 0 ? [] : [{ tile, rows }];
        });
    }, [
        dashboardTiles,
        newTileUuids,
        dashboardFilters.dimensions,
        dismissedLinks,
        fieldsByTile,
        fieldsMap,
    ]);
    const tileUuids = useMemo(
        () => prompts.map(({ tile }) => tile.uuid),
        [prompts],
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

    if (!isEnabled) return null;

    return (
        <>
            {prompts.map(({ tile, rows }, index) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                return createPortal(
                    <div
                        className={`${classes.overlay} ${LOCKED_TILE_CLASS}`}
                        data-controls-overlay
                        data-wave={index % WAVE_BUCKETS}
                    >
                        <Paper
                            shadow="md"
                            p="sm"
                            radius="md"
                            className={`${classes.card} ${classes.promptCard}`}
                        >
                            <LinkCard
                                tile={tile}
                                rows={rows}
                                fieldsByTile={fieldsByTile}
                                fieldsMap={fieldsMap}
                                getLabel={getLabel}
                            />
                        </Paper>
                    </div>,
                    element,
                    tile.uuid,
                );
            })}
        </>
    );
};
