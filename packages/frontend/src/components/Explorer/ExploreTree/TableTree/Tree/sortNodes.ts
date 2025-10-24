import {
    isDimension,
    OrderFieldsByStrategy,
    sortTimeFrames,
    type AdditionalMetric,
    type CustomDimension,
    type Dimension,
    type Metric,
} from '@lightdash/common';
import type { Node as TreeNode } from './types';

/**
 * Sort nodes by order strategy (INDEX or LABEL)
 * Shared between virtualized and non-virtualized tree rendering
 */
export const sortNodes =
    (
        orderStrategy: OrderFieldsByStrategy,
        itemsMap: Record<
            string,
            Dimension | Metric | AdditionalMetric | CustomDimension
        >,
    ) =>
    (a: TreeNode, b: TreeNode) => {
        if (orderStrategy === OrderFieldsByStrategy.INDEX) {
            return a.index - b.index;
        }

        const itemA = itemsMap[a.key];
        const itemB = itemsMap[b.key];

        if (
            isDimension(itemA) &&
            isDimension(itemB) &&
            itemA.timeInterval &&
            itemB.timeInterval
        ) {
            return sortTimeFrames(itemA.timeInterval, itemB.timeInterval);
        } else {
            return a.label.localeCompare(b.label);
        }
    };
