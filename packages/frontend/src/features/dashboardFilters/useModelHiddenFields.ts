import { type DashboardFilterRule } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    getSavedFilterFieldStatus,
    type ResolvedSavedFilterField,
    type SavedFilterFieldsByTileUuid,
} from './FilterConfiguration/utils';

export type ModelHiddenFieldResolver = (
    filterRule: DashboardFilterRule,
) => ResolvedSavedFilterField | undefined;

export const useModelHiddenFields = (): {
    savedFilterFieldsByTileUuid: SavedFilterFieldsByTileUuid | undefined;
    getModelHiddenField: ModelHiddenFieldResolver;
} => {
    const savedFilterFieldsByTileUuid = useDashboardContext(
        (c) => c.savedFilterFieldsByTileUuid,
    );

    const getModelHiddenField = useCallback<ModelHiddenFieldResolver>(
        (filterRule) =>
            getSavedFilterFieldStatus(filterRule, savedFilterFieldsByTileUuid),
        [savedFilterFieldsByTileUuid],
    );

    return useMemo(
        () => ({ savedFilterFieldsByTileUuid, getModelHiddenField }),
        [savedFilterFieldsByTileUuid, getModelHiddenField],
    );
};
