import { Button, Divider, Group, Paper, Text } from '@mantine/core';
import { useLayoutEffect, useMemo, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { Trans, useTranslation } from 'react-i18next';
import FieldIcon from '../../components/common/Filters/FieldIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { joinLabels } from './fieldLabels';
import classes from './FieldTilesBar.module.css';
import { getFilterFields } from './peers';
import { useControlsSidebarSelector } from './useControlsSidebar';
import {
    useFieldTileActions,
    type FieldTiles,
    type TileScope,
} from './useFieldTileActions';
import { usePortalTargets } from './usePortalTargets';
import { useSqlColumnsByTile } from './useSqlColumnsByTile';

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
    const { t } = useTranslation('dashboardFilters');
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
    const scopeContext = hasTabs ? 'tab' : undefined;
    const replacedNames = joinLabels(replacedLabels);
    const regionRef = useRef<HTMLDivElement>(null);
    const wasPressedRef = useRef(false);
    // A pressed button leaves once its action is done: focus stays on the bar
    useLayoutEffect(() => {
        const region = regionRef.current;
        if (!wasPressedRef.current || region === null) return;
        // Only the render that follows the press: a later one must not move focus
        wasPressedRef.current = false;
        const focused = document.activeElement;
        if (region.contains(focused)) return;
        if (focused === null || focused === document.body) region.focus();
    });
    const press = (action: () => void) => () => {
        wasPressedRef.current = true;
        action();
    };
    // Beside a "Replace" button the count alone would be unclear
    const mainKey =
        replaced > 0
            ? 'filterUnfiltered'
            : applied > 0
              ? 'filterOther'
              : 'filterAll';
    const mainLabel = t(`controls.bar.${mainKey}`, { count: unfiltered });
    // Starts with the words on the button
    const mainName = t(`controls.bar.${mainKey}Name`, {
        count: unfiltered,
        label,
        context: scopeContext,
    });
    const replaceLabel = t('controls.bar.replace', {
        names: replacedNames,
        count: replaced,
    });

    return (
        <Paper
            ref={regionRef}
            role="region"
            tabIndex={-1}
            aria-label={t('controls.bar.regionLabel', { label })}
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
                                ? t('controls.bar.noTileOnTab')
                                : t('controls.bar.noTile')}
                        </Text>
                    ) : (
                        <Text fz="sm" aria-live="polite">
                            <Trans
                                t={t}
                                i18nKey="controls.bar.onTiles"
                                count={possible}
                                context={scopeContext}
                                values={{ applied, count: possible }}
                                components={{
                                    count: (
                                        <Text
                                            span
                                            fw={600}
                                            className={classes.count}
                                        />
                                    ),
                                }}
                            />
                        </Text>
                    )}
                    {unfiltered > 0 && (
                        <Button
                            size="xs"
                            variant="filled"
                            aria-label={mainName}
                            onClick={press(() => addToUnfiltered(tileScope))}
                        >
                            {mainLabel}
                        </Button>
                    )}
                    {replaced > 0 && (
                        <Button
                            size="xs"
                            variant="default"
                            aria-label={t('controls.bar.replaceName', {
                                names: replacedNames,
                                count: replaced,
                                label,
                                context: scopeContext,
                            })}
                            onClick={press(() => switchFromOthers(tileScope))}
                        >
                            {replaceLabel}
                        </Button>
                    )}
                    {applied > 0 && (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            aria-label={
                                hasTabs
                                    ? t('controls.bar.clearFromTab', { label })
                                    : t('controls.bar.clearFromTiles', {
                                          label,
                                      })
                            }
                            onClick={press(() => clear(tileScope))}
                        >
                            {t('controls.bar.clear')}
                        </Button>
                    )}
                </Group>
                {otherTabsUnfiltered > 0 && (
                    <>
                        <Divider orientation="vertical" />
                        <Button
                            size="xs"
                            variant="subtle"
                            aria-label={t('controls.bar.filterOtherTabsName', {
                                count: otherTabsUnfiltered,
                                label,
                            })}
                            onClick={press(() => addToUnfiltered('other-tabs'))}
                        >
                            {t('controls.bar.filterOtherTabs', {
                                count: otherTabsUnfiltered,
                            })}
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
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    const highlightedFieldId = useControlsSidebarSelector(
        (c) => c.highlightedFieldId,
    );
    const waitingFieldIds = useControlsSidebarSelector(
        (c) => c.waitingFieldIds,
    );
    const sqlColumnsByTile = useSqlColumnsByTile(editingRule);
    const fieldTileActions = useFieldTileActions(sqlColumnsByTile);
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
