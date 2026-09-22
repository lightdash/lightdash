import {
    DimensionType,
    getItemLabelWithoutTableName,
    isDateItem,
    isDimension,
    isField,
    TimeFrames,
    type Item,
    type ItemsMap,
} from '@lightdash/common';
import { type BuilderPromptExamples } from '../builder/builderExamplePrompts';
import { getDataAppVizFieldItems } from './getDataAppVizFieldItems';

const label = (item: Item | undefined): string | null =>
    item ? getItemLabelWithoutTableName(item) : null;

/** The grain the date dimension already carries, named the way a prompt would. */
const grainOf = (dateDimension: Item | undefined): string =>
    isField(dateDimension) &&
    isDimension(dateDimension) &&
    dateDimension.timeInterval === TimeFrames.MONTH
        ? 'month'
        : 'period';

/**
 * Rewrite the starter prompts around the attached chart's own fields, so the
 * examples describe a chart the run can actually draw. When a shape's ideal
 * combination is unavailable, keep the wording generic but grounded in a
 * column the query does return.
 */
export const savedChartExamplePrompts = (
    itemsMap: ItemsMap,
): BuilderPromptExamples => {
    const { dimensions, metrics } = getDataAppVizFieldItems(itemsMap);
    const dateDimension = dimensions.find(
        (item) => isField(item) && isDateItem(item),
    );
    const stringDimension = dimensions.find(
        (item) =>
            isField(item) &&
            isDimension(item) &&
            item.type === DimensionType.STRING,
    );
    const dateLabel = label(dateDimension);
    const stringLabel = label(stringDimension);
    const metric1 = label(metrics[0]);
    const metric2 = label(metrics[1]) ?? metric1;
    const grain = grainOf(dateDimension);
    const availableField = label(dimensions[0]) ?? metric1;
    const fallback = (shape: string) =>
        `A ${shape} using ${availableField ?? 'the available fields'}`;

    return {
        stream:
            metric1 && stringLabel
                ? `A stream graph of ${metric1} by ${stringLabel} over time`
                : fallback('stream graph'),
        funnel:
            metric2 && stringLabel
                ? `A funnel of ${metric2} across ${stringLabel}`
                : fallback('funnel'),
        heatmap:
            metric1 && dateLabel
                ? `A calendar heatmap of ${metric1} by ${dateLabel}`
                : fallback('heatmap'),
        waterfall: metric1
            ? `A waterfall of ${metric1} changes ${grain} to ${grain}`
            : fallback('waterfall'),
    };
};
