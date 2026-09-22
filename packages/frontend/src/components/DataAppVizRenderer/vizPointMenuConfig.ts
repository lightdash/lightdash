import {
    createDashboardFilterRuleFromField,
    isDimension,
    isFilterableDimension,
    type DataAppVizFieldMapping,
    type DateZoom,
    type FilterDashboardToRule,
    type ItemsMap,
} from '@lightdash/common';
import {
    type DrillDownConfig,
    type UnderlyingDataConfig,
} from '../MetricQueryData/types';
import { resolveVizDrillDownConfig } from './vizDrillDownConfig';
import {
    isVizIntent,
    resolveVizFieldId,
    toVizFieldValues,
    type VizIntent,
} from './vizIntent';
import { resolveVizUnderlyingDataConfig } from './vizUnderlyingDataConfig';

/** A point-menu click intent: a viz intent plus iframe-client coordinates. */
type VizPointMenuIntent = VizIntent & { x: number; y: number };

export type VizPointMenuState = {
    position: { left: number; top: number };
    intent: VizPointMenuIntent;
    /** Formatted cell value for the clicked metric; undefined = no copy item. */
    copyValue: string | undefined;
    /** Resolved drill config; undefined = no drill item. */
    drillConfig: DrillDownConfig | undefined;
    /** Resolved underlying-data config; undefined = no underlying-data item. */
    underlyingDataConfig: UnderlyingDataConfig | undefined;
    /** Cross-filter rules from the row's dimension cells; empty = no section. */
    filters: FilterDashboardToRule[];
};

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isVizPointMenuIntent = (input: unknown): input is VizPointMenuIntent => {
    if (!isVizIntent(input)) return false;
    const { x, y } = input as Partial<VizPointMenuIntent>;
    return isFiniteNumber(x) && isFiniteNumber(y);
};

const clamp = (value: number, max: number) =>
    Math.min(Math.max(value, 0), Math.max(max, 0));

// Resolves a viz's point-menu click intent (untrusted iframe input) into
// everything the host menu renders: page position, copyable value, drill
// config and dashboard cross-filter rules.
export const resolveVizPointMenuState = (
    intent: unknown,
    args: {
        fieldMapping: DataAppVizFieldMapping;
        itemsMap: ItemsMap;
        iframeRect: DOMRect | null;
        drillDownEnabled: boolean;
        underlyingDataEnabled: boolean;
        dateZoom: DateZoom | undefined;
    },
): VizPointMenuState => {
    if (!isVizPointMenuIntent(intent)) {
        throw new Error('Invalid point-menu request.');
    }
    const rect = args.iframeRect;
    const position = {
        left:
            (rect?.left ?? 0) +
            window.scrollX +
            clamp(intent.x, rect?.width ?? intent.x),
        top:
            (rect?.top ?? 0) +
            window.scrollY +
            clamp(intent.y, rect?.height ?? intent.y),
    };

    const fieldValues = toVizFieldValues(intent.row);

    let copyValue: string | undefined;
    try {
        copyValue =
            fieldValues[resolveVizFieldId(intent, args.fieldMapping)]
                ?.formatted;
    } catch {
        copyValue = undefined;
    }

    let drillConfig: DrillDownConfig | undefined;
    if (args.drillDownEnabled) {
        try {
            drillConfig = resolveVizDrillDownConfig(intent, {
                fieldMapping: args.fieldMapping,
                itemsMap: args.itemsMap,
            });
        } catch {
            drillConfig = undefined;
        }
    }

    let underlyingDataConfig: UnderlyingDataConfig | undefined;
    if (args.underlyingDataEnabled) {
        try {
            underlyingDataConfig = resolveVizUnderlyingDataConfig(intent, {
                fieldMapping: args.fieldMapping,
                itemsMap: args.itemsMap,
                dateZoom: args.dateZoom,
            });
        } catch {
            underlyingDataConfig = undefined;
        }
    }

    const filters = Object.entries(fieldValues).reduce<FilterDashboardToRule[]>(
        (acc, [fieldId, value]) => {
            const field = args.itemsMap[fieldId];
            if (isDimension(field) && isFilterableDimension(field)) {
                acc.push(
                    createDashboardFilterRuleFromField({
                        field,
                        availableTileFilters: {},
                        isTemporary: true,
                        value: value.raw,
                    }),
                );
            }
            return acc;
        },
        [],
    );

    return {
        position,
        intent,
        copyValue,
        drillConfig,
        underlyingDataConfig,
        filters,
    };
};
