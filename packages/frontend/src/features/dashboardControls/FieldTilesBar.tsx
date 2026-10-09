import { Button, Divider, Group, Paper, Text } from '@mantine/core';
import { useLayoutEffect, useMemo, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { joinLabels, pluralizeTiles } from './fieldLabels';
import classes from './FieldTilesBar.module.css';
import { getFilterFields } from './peers';
import { useControlsSidebar } from './useControlsSidebar';
import {
    useFieldTileActions,
    type FieldTiles,
    type TileScope,
} from './useFieldTileActions';
import { usePortalTargets } from './usePortalTargets';

const GRID_KEY = 'grid';
const GRID_SELECTOR = '.react-grid-layout';
const TAB_PANEL_SELECTOR = '[data-tab-uuid]';

// The grid of a tab panel, or the one grid of a dashboard without tabs
const getGridSelector = (key: string) =>
    key === GRID_KEY
        ? GRID_SELECTOR
        : `[data-tab-uuid="${key}"] ${GRID_SELECTOR}`;

// An element of ours right after the active tab's tile grid, where the bar
// floats. Keyed on the grid, so it follows a grid that is mounted again
const useBarHost = (
    activeTabUuid: string | undefined,
    isEnabled: boolean,
): HTMLElement | null => {
    const keys = useMemo(
        () =>
            activeTabUuid === undefined
                ? [GRID_KEY]
                : [activeTabUuid, GRID_KEY],
        [activeTabUuid],
    );
    const targets = usePortalTargets(keys, getGridSelector, isEnabled, false);
    const tabGrid =
        activeTabUuid === undefined ? undefined : targets[activeTabUuid];
    const anyGrid = targets[GRID_KEY];
    // Never another tab's grid while the active panel is still mounting
    const loneGrid =
        anyGrid !== undefined && anyGrid.closest(TAB_PANEL_SELECTOR) === null
            ? anyGrid
            : undefined;
    const grid = tabGrid ?? loneGrid ?? null;

    const [host, setHost] = useState<HTMLElement | null>(null);
    useLayoutEffect(() => {
        if (grid === null) return;
        const element = document.createElement('div');
        element.className = classes.host;
        grid.after(element);
        setHost(element);
        return () => {
            element.remove();
            setHost(null);
        };
    }, [grid]);
    return host;
};

const Bar: FC<{ fieldTiles: FieldTiles }> = ({ fieldTiles }) => {
    const {
        field,
        label,
        thisTabScope,
        everyTabScope,
        replacedLabels,
        otherTabsUnfiltered,
        addToUnfiltered,
        switchFromOthers,
        clear,
    } = fieldTiles;
    // The tab in view, or every tile on a dashboard without tabs
    const hasTabs = thisTabScope !== null;
    const tileScope: TileScope = hasTabs ? 'this-tab' : 'every-tab';
    const { applied, possible, unfiltered, replaced } =
        thisTabScope ?? everyTabScope;
    // Ends the count and each `aria-label`
    const scopeSuffix = hasTabs ? ' on this tab' : '';
    const replacedNames = joinLabels(replacedLabels);

    return (
        <Paper
            role="region"
            aria-label={`Tiles filtered by ${label}`}
            shadow="xl"
            withBorder={false}
            radius="md"
            className={classes.bar}
        >
            <Group gap="md" justify="center">
                <Group gap={6} wrap="nowrap">
                    {field !== null && (
                        <FieldIcon item={field} size={16} aria-hidden />
                    )}
                    <Text fz="sm" fw={600} truncate maw={240}>
                        {label}
                    </Text>
                </Group>
                <Divider orientation="vertical" />
                <Group gap="sm">
                    {possible === 0 ? (
                        <Text fz="sm" c="dimmed" aria-live="polite">
                            {hasTabs
                                ? 'No tile on this tab has it'
                                : 'No tile has it'}
                        </Text>
                    ) : (
                        <Text fz="sm" aria-live="polite">
                            {'on '}
                            <Text span fw={600} className={classes.count}>
                                {`${applied} of ${possible}`}
                            </Text>
                            {` ${pluralizeTiles(possible)}${scopeSuffix}`}
                        </Text>
                    )}
                    {unfiltered > 0 && (
                        <Button
                            size="xs"
                            variant="filled"
                            aria-label={`Filter the ${unfiltered} unfiltered ${pluralizeTiles(unfiltered)} by ${label}${scopeSuffix}`}
                            onClick={() => addToUnfiltered(tileScope)}
                        >
                            {applied === 0 && replaced === 0
                                ? `Filter all ${unfiltered}`
                                : `Filter the other ${unfiltered}`}
                        </Button>
                    )}
                    {replaced > 0 && (
                        <Button
                            size="xs"
                            variant="default"
                            aria-label={`Switch ${replaced} ${pluralizeTiles(replaced)} from ${replacedNames} to ${label}${scopeSuffix}`}
                            onClick={() => switchFromOthers(tileScope)}
                        >
                            {`Switch ${replaced} from ${replacedNames}`}
                        </Button>
                    )}
                    {applied > 0 && (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            aria-label={
                                hasTabs
                                    ? `Clear ${label} from this tab`
                                    : `Clear ${label} from tiles`
                            }
                            onClick={() => clear(tileScope)}
                        >
                            Clear
                        </Button>
                    )}
                </Group>
                {otherTabsUnfiltered > 0 && (
                    <>
                        <Divider orientation="vertical" />
                        <Button
                            size="xs"
                            variant="subtle"
                            aria-label={`Filter the ${otherTabsUnfiltered} unfiltered ${pluralizeTiles(otherTabsUnfiltered)} on other tabs by ${label}`}
                            onClick={() => addToUnfiltered('other-tabs')}
                        >
                            {`+ ${otherTabsUnfiltered} on other tabs`}
                        </Button>
                    </>
                )}
            </Group>
        </Paper>
    );
};

// Floats over the tiles while a field is clicked: what it is on, and what
// would change that. Never for the hovered field
export const FieldTilesBar: FC = () => {
    const { editingRule, highlightedFieldId, waitingFieldIds } =
        useControlsSidebar();
    const fieldTileActions = useFieldTileActions();
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);

    const fieldId =
        editingRule !== null &&
        highlightedFieldId !== null &&
        (getFilterFields(editingRule).includes(highlightedFieldId) ||
            waitingFieldIds.includes(highlightedFieldId))
            ? highlightedFieldId
            : null;
    const isShown = fieldTileActions !== null && fieldId !== null;
    const host = useBarHost(activeTabUuid, isShown);

    if (fieldTileActions === null || fieldId === null || host === null)
        return null;
    return createPortal(
        <Bar fieldTiles={fieldTileActions.forField(fieldId)} />,
        host,
    );
};
