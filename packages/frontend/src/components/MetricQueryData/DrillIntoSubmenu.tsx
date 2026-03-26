import {
    isDrillDownPath,
    isDrillThroughPath,
    type DrillConfig,
    type DrillPath,
    type DrillPathType,
    type ResultValue,
} from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { IconArrowBarToDown, IconExternalLink } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useContextMenuPermissions } from '../../hooks/useContextMenuPermissions';
import { useDrillFeatureFlag } from '../../hooks/useDrillFeatureFlag';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { useMetricQueryDataContext } from './useMetricQueryDataContext';

export type DrillStack = Array<{
    drillPath: DrillPath;
    drillDimensionValues: Record<string, unknown>;
}>;

type DrillIntoSubmenuProps = {
    drillConfig: DrillConfig | undefined;
    fieldValues: Record<string, ResultValue> | undefined;
    /** Current drill stack — used to exclude already-filtered dimensions */
    drillStack?: DrillStack;
    /** Restrict which drill path types are shown. Defaults to both. */
    allowedTypes?: DrillPathType[];
    /** The metric field ID of the cell the user clicked.
     *  Used to filter drill-through paths that have a sourceMetricId set. */
    clickedMetricId?: string;
    /** Called for drill-down paths (modifies Redux state) */
    onDrillDown: (params: {
        drillPath: DrillPath;
        fieldValues: Record<string, ResultValue>;
        dimensionIds: string[];
    }) => void;
    /** Called for drill-through paths (opens modal / navigates to linked chart) */
    onDrillThrough?: (params: {
        drillPathId: string;
        linkedChartUuid: string;
        fieldValues: Record<string, ResultValue>;
        dimensionIds: string[];
    }) => void;
};

const DrillIntoSubmenu: FC<DrillIntoSubmenuProps> = ({
    drillConfig,
    fieldValues,
    drillStack,
    allowedTypes,
    clickedMetricId,
    onDrillDown,
    onDrillThrough,
}) => {
    const drillEnabled = useDrillFeatureFlag();
    const { canViewUnderlyingData } = useContextMenuPermissions();
    const metricQueryData = useMetricQueryDataContext(true);
    const metricQuery = metricQueryData?.metricQuery;
    const explore = metricQueryData?.explore;
    const { track } = useTracking();

    // Filter out drill paths that reference fields the user can't access
    const accessiblePaths = useMemo(() => {
        if (!drillConfig || !explore) return [];

        const availableFieldIds = new Set(
            Object.values(explore.tables).flatMap((table) => [
                ...Object.keys(table.dimensions).map(
                    (name) => `${table.name}_${name}`,
                ),
                ...Object.keys(table.metrics).map(
                    (name) => `${table.name}_${name}`,
                ),
            ]),
        );

        // Dimensions currently displayed + dimensions filtered in earlier drill levels
        const currentDimensions = new Set(metricQuery?.dimensions ?? []);
        const filteredInStack = new Set(
            (drillStack ?? []).flatMap((level) =>
                Object.keys(level.drillDimensionValues),
            ),
        );
        const usedDimensions = new Set([
            ...currentDimensions,
            ...filteredInStack,
        ]);

        return drillConfig.paths.filter((path) => {
            // Filter by allowed types when specified
            if (allowedTypes && !allowedTypes.includes(path.type)) return false;

            // Drill-through paths: show only if a target chart is configured
            // and the sourceMetricId matches (when set)
            if (isDrillThroughPath(path)) {
                if (!path.linkedChartUuid) return false;
                if (
                    path.sourceMetricId &&
                    clickedMetricId &&
                    path.sourceMetricId !== clickedMetricId
                )
                    return false;
                if (path.sourceMetricId && !clickedMetricId) return false;
                return true;
            }

            // Drill-down paths: check field accessibility
            if (!isDrillDownPath(path)) return true;

            // Exclude inline paths where every dimension is already displayed or filtered
            const allDimsUsed = path.dimensions.every((d) =>
                usedDimensions.has(d),
            );
            if (allDimsUsed) return false;

            // Exclude inline paths with inaccessible fields
            const allFields = [...path.dimensions, ...(path.metrics ?? [])];
            return allFields.every((fieldId) => availableFieldIds.has(fieldId));
        });
    }, [
        drillConfig,
        explore,
        metricQuery?.dimensions,
        drillStack,
        allowedTypes,
        clickedMetricId,
    ]);

    const handleDrill = useCallback(
        (drillPath: DrillPath) => {
            if (!fieldValues || !metricQuery) return;

            track({
                name: EventName.DRILL_INTO_CLICKED,
                properties: {
                    drillType: isDrillThroughPath(drillPath)
                        ? 'linkedChart'
                        : 'inline',
                },
            });

            if (isDrillThroughPath(drillPath) && onDrillThrough) {
                onDrillThrough({
                    drillPathId: drillPath.id,
                    linkedChartUuid: drillPath.linkedChartUuid,
                    fieldValues,
                    dimensionIds: metricQuery.dimensions,
                });
            } else {
                onDrillDown({
                    drillPath,
                    fieldValues,
                    dimensionIds: metricQuery.dimensions,
                });
            }
        },
        [fieldValues, metricQuery, onDrillDown, onDrillThrough, track],
    );

    if (
        !drillEnabled ||
        !canViewUnderlyingData ||
        accessiblePaths.length === 0 ||
        !fieldValues ||
        !metricQuery
    ) {
        return null;
    }

    return (
        <>
            <Menu.Divider />
            <Menu.Label>Drill down</Menu.Label>
            {accessiblePaths.map((path) => (
                <Menu.Item
                    key={path.id}
                    leftSection={
                        <MantineIcon
                            icon={
                                isDrillThroughPath(path)
                                    ? IconExternalLink
                                    : IconArrowBarToDown
                            }
                        />
                    }
                    onClick={() => handleDrill(path)}
                >
                    {path.label}
                </Menu.Item>
            ))}
        </>
    );
};

export default DrillIntoSubmenu;
