import { type FC } from 'react';
import {
    explorerActions,
    selectPendingCostConfirmation,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../features/explorer/store';
import { useExplorerQuery } from '../../hooks/useExplorerQuery';
import {
    getMetricQueryEstimateBody,
    useMetricQueryCostEstimate,
} from '../../hooks/useQueryCostEstimate';
import { QueryCostConfirmModal } from './QueryCostConfirmModal';
import { QueryCostEstimateBadge } from './QueryCostEstimateBadge';

export const ExplorerQueryCostEstimateBadge: FC = () => {
    const { currentQueryArgs, costEstimateSettings, projectUuid } =
        useExplorerQuery();
    const body = currentQueryArgs
        ? getMetricQueryEstimateBody(currentQueryArgs)
        : null;
    const { data, isFetching } = useMetricQueryCostEstimate(
        projectUuid,
        body,
        costEstimateSettings !== null,
    );
    if (costEstimateSettings === null || body === null) return null;
    return <QueryCostEstimateBadge estimate={data} isFetching={isFetching} />;
};

export const ExplorerQueryCostConfirmModal: FC = () => {
    const dispatch = useExplorerDispatch();
    const pending = useExplorerSelector(selectPendingCostConfirmation);
    if (!pending) return null;
    return (
        <QueryCostConfirmModal
            opened
            totalBytesProcessed={pending.totalBytesProcessed}
            confirmEstimatedBytesAbove={pending.confirmEstimatedBytesAbove}
            onConfirm={() => dispatch(explorerActions.confirmQueryCost())}
            onClose={() =>
                dispatch(explorerActions.cancelQueryCostConfirmation())
            }
        />
    );
};
