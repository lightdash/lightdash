import { type DashboardFilterRule } from '@lightdash/common';
import { type FC } from 'react';
import InvalidFilter from '../InvalidFilter';
import LockedFilter from '../LockedFilter';
import { useIsLockedDashboardFilterRule } from '../useIsLockedDashboardFilterRule';

export const UnresolvedFilter: FC<{
    isEditMode: boolean;
    filterRule: DashboardFilterRule;
    onRemove: () => void;
}> = (props) => {
    const isLocked = useIsLockedDashboardFilterRule();
    return isLocked(props.filterRule) ? (
        <LockedFilter {...props} />
    ) : (
        <InvalidFilter {...props} />
    );
};
