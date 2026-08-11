import { isAdditionalMetric } from '@lightdash/common';
import { useCallback } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { type NodeItem } from './TableTree/Tree/types';

type Args = {
    item: NodeItem;
    fieldId: string;
    isHover: boolean;
};

/**
 * Inline delete affordance for custom metric rows in the explore sidebar
 * (pinned Selected section and tree). Deleting is the same action as the
 * overflow menu's "Delete custom metric" item.
 */
export const useCustomMetricDelete = ({ item, fieldId, isHover }: Args) => {
    const dispatch = useExplorerDispatch();
    const { track } = useTracking();

    const showDeleteAction = isHover && isAdditionalMetric(item);

    const handleDeleteClick = useCallback(
        (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            track({ name: EventName.REMOVE_CUSTOM_METRIC_CLICKED });
            dispatch(explorerActions.removeAdditionalMetric(fieldId));
        },
        [dispatch, fieldId, track],
    );

    return { showDeleteAction, handleDeleteClick };
};
