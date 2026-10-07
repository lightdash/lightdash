import {
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Group, Paper, Select, Stack, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getFieldDisplayLabel } from './fieldGrains';
import { getLinkCandidates, getLinkKey } from './linkCandidates';
import { getTileSelector } from './parameterSources';
import { setTileField, type FieldsByTile } from './peers';
import classes from './TileOverlay.module.css';
import { stopPropagation } from './tileSelector';
import { useFilterSidebar } from './useFilterSidebar';
import { usePortalTargets } from './usePortalTargets';

type Prompt = { rule: DashboardFilterRule; candidates: DashboardFieldTarget[] };

type RowProps = {
    tile: DashboardTile;
    prompt: Prompt;
    fieldsByTile: FieldsByTile;
    label: (fieldId: string) => string;
};

const LinkRow: FC<RowProps> = ({ tile, prompt, fieldsByTile, label }) => {
    const { updateFilter, dismissLink } = useFilterSidebar();
    const { rule, candidates } = prompt;
    const [chosen, setChosen] = useState<string | null>(
        candidates.length === 1 ? candidates[0].fieldId : null,
    );
    const filterLabel = rule.label ?? label(rule.target.fieldId);
    return (
        <Stack gap="xs">
            <Text fz="sm" fw={600}>
                {filterLabel}
            </Text>
            <Select
                size="xs"
                aria-label={`Field for ${filterLabel} on this tile`}
                placeholder="Pick a field"
                allowDeselect={false}
                comboboxProps={{ withinPortal: true }}
                value={chosen}
                onChange={setChosen}
                data={candidates.map((candidate) => ({
                    value: candidate.fieldId,
                    label: label(candidate.fieldId),
                }))}
            />
            <Group gap="xs">
                <Button
                    size="compact-xs"
                    disabled={chosen === null}
                    onClick={() => {
                        const target = candidates.find(
                            (candidate) => candidate.fieldId === chosen,
                        );
                        if (!target) return;
                        updateFilter(
                            setTileField(rule, tile, target, fieldsByTile),
                        );
                    }}
                >
                    Link
                </Button>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => dismissLink(tile.uuid, rule.id)}
                >
                    Skip
                </Button>
            </Group>
        </Stack>
    );
};

export const LinkPrompts: FC = () => {
    const { isSidebarOpen, newTileUuids, dismissedLinks } = useFilterSidebar();
    const { mode } = useParams<{ mode?: string }>();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const fieldsByTile = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const fieldsMap = useDashboardContext((c) => c.allFilterableFieldsMap);
    const isEnabled = mode === 'edit' && !isSidebarOpen;

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
                    fieldsByTile,
                    fieldsMap,
                );
                return candidates.length === 0 ? [] : [{ rule, candidates }];
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
    const targets = usePortalTargets(tileUuids, getTileSelector, isEnabled);
    const label = (fieldId: string) => {
        const field = fieldsMap[fieldId];
        return field
            ? getFieldDisplayLabel(field, Object.values(fieldsMap))
            : fieldId;
    };

    if (!isEnabled) return null;

    return (
        <>
            {prompts.map(({ tile, rows }) => {
                const element = targets[tile.uuid];
                if (!element) return null;
                return createPortal(
                    <div
                        className={classes.overlay}
                        onMouseDown={stopPropagation}
                        onTouchStart={stopPropagation}
                        onClick={stopPropagation}
                    >
                        <Paper
                            shadow="md"
                            p="sm"
                            radius="md"
                            className={classes.card}
                        >
                            <Stack gap="sm">
                                <Text fz="xs" c="dimmed">
                                    {rows.length === 1
                                        ? 'A filter could reach this tile'
                                        : 'Filters that could reach this tile'}
                                </Text>
                                {rows.map((prompt) => (
                                    <LinkRow
                                        key={prompt.rule.id}
                                        tile={tile}
                                        prompt={prompt}
                                        fieldsByTile={fieldsByTile}
                                        label={label}
                                    />
                                ))}
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
