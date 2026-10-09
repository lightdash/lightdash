import {
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { Button, Group, Paper, Select, Stack, Text } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getCandidateOptions } from './fieldCandidates';
import { getLinkCandidates, getLinkKey } from './linkCandidates';
import { setTileField, type FieldsByTile } from './peers';
import classes from './TileOverlay.module.css';
import {
    getTileSelector,
    LOCKED_TILE_CLASS,
    WAVE_BUCKETS,
} from './tileSelector';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { usePortalTargets } from './usePortalTargets';

type Prompt = { rule: DashboardFilterRule; candidates: DashboardFieldTarget[] };

type FieldsMap = Record<string, DashboardFilterableField>;

const NO_LABELS: string[] = [];
const ROW_ATTRIBUTE = 'data-link-row';
const ROW_CONTROL_SELECTOR = 'input:not([type="hidden"]), button';

type RowProps = {
    tile: DashboardTile;
    prompt: Prompt;
    fieldsByTile: FieldsByTile;
    fieldsMap: FieldsMap;
    getLabel: (fieldId: string) => string;
    // Link or Skip was pressed: the row is about to leave
    onAnswer: (tileUuid: string, ruleId: string) => void;
};

const LinkRow: FC<RowProps> = ({
    tile,
    prompt,
    fieldsByTile,
    fieldsMap,
    getLabel,
    onAnswer,
}) => {
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const dismissLink = useControlsSidebarSelector((c) => c.dismissLink);
    const { rule, candidates } = prompt;
    const [picked, setPicked] = useState<string | null>(null);
    // The choice follows the candidates: one that is no longer offered is
    // dropped, and a single candidate is the choice
    const chosen = candidates.some((candidate) => candidate.fieldId === picked)
        ? picked
        : candidates.length === 1
          ? candidates[0].fieldId
          : null;
    const filterLabel = rule.label ?? getLabel(rule.target.fieldId);
    return (
        <Stack gap="xs" data-link-row={rule.id}>
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
                onChange={setPicked}
                data={getCandidateOptions(
                    candidates.map((candidate) => candidate.fieldId),
                    NO_LABELS,
                    fieldsMap,
                )}
            />
            <Group gap="xs">
                <Button
                    size="compact-xs"
                    aria-label={`Link ${filterLabel}`}
                    disabled={chosen === null}
                    onClick={() => {
                        const target = candidates.find(
                            (candidate) => candidate.fieldId === chosen,
                        );
                        if (!target) return;
                        onAnswer(tile.uuid, rule.id);
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
                    aria-label={`Skip ${filterLabel}`}
                    onClick={() => {
                        onAnswer(tile.uuid, rule.id);
                        dismissLink(tile.uuid, rule.id);
                    }}
                >
                    Skip
                </Button>
            </Group>
        </Stack>
    );
};

type PendingFocus = { tileUuid: string; ruleId: string; index: number };

const getRows = (tileElement: Element): HTMLElement[] => [
    ...tileElement.querySelectorAll<HTMLElement>(`[${ROW_ATTRIBUTE}]`),
];

// Once an answered row has left: the prompt that took its place, else the one
// before it, else the tile itself
const focusAfterAnswer = (
    { index }: PendingFocus,
    tileElement: HTMLElement,
) => {
    const rows = getRows(tileElement);
    const next = rows[index] ?? rows[rows.length - 1];
    if (next) {
        next.querySelector<HTMLElement>(ROW_CONTROL_SELECTOR)?.focus();
        return;
    }
    if (!tileElement.hasAttribute('tabindex')) tileElement.tabIndex = -1;
    tileElement.focus();
};

export const LinkPrompts: FC = () => {
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const newTileUuids = useControlsSidebarSelector((c) => c.newTileUuids);
    const dismissedLinks = useControlsSidebarSelector((c) => c.dismissedLinks);
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
                    dashboardTiles,
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

    // Focus is a DOM matter: it moves once the answered row has left the page
    const pendingFocus = useRef<PendingFocus | null>(null);
    const handleAnswer = useCallback((tileUuid: string, ruleId: string) => {
        const tileElement = document.querySelector(getTileSelector(tileUuid));
        if (tileElement === null) return;
        const index = getRows(tileElement).findIndex(
            (row) => row.getAttribute(ROW_ATTRIBUTE) === ruleId,
        );
        pendingFocus.current = { tileUuid, ruleId, index };
    }, []);
    useEffect(() => {
        const pending = pendingFocus.current;
        if (pending === null) return;
        const tileElement = document.querySelector<HTMLElement>(
            getTileSelector(pending.tileUuid),
        );
        if (tileElement === null) {
            pendingFocus.current = null;
            return;
        }
        const isStillThere = getRows(tileElement).some(
            (row) => row.getAttribute(ROW_ATTRIBUTE) === pending.ruleId,
        );
        if (isStillThere) return;
        pendingFocus.current = null;
        focusAfterAnswer(pending, tileElement);
    });

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
                            shadow="lg"
                            p="sm"
                            radius="md"
                            className={`${classes.card} ${classes.promptCard}`}
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
                                        fieldsMap={fieldsMap}
                                        getLabel={getLabel}
                                        onAnswer={handleAnswer}
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
