import { FeatureFlags } from '@lightdash/common';
import { Badge, Tooltip } from '@mantine-8/core';
import { IconAlertCircle } from '@tabler/icons-react';
import isEqual from 'lodash/isEqual';
import { useMemo, type FC } from 'react';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';
import MantineIcon from '../../common/MantineIcon';

export type PivotMismatchWarningProps = {
    pivotDimensions: string[] | undefined;
    resultsData: Pick<
        InfiniteQueryResults,
        | 'isFetchingRows'
        | 'isInitialLoading'
        | 'isFetchingFirstPage'
        | 'pivotDetails'
    >;
    isLoading: boolean;
};

const VisualizationWarning: FC<PivotMismatchWarningProps> = ({
    pivotDimensions,
    resultsData,
    isLoading,
}) => {
    const { data: useSqlPivotResults } = useFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
    );

    // Determine pivot used to compute current results
    const resultsPivotDimensions = useMemo<string[]>(() => {
        const groupBy = resultsData?.pivotDetails?.groupByColumns;
        return groupBy
            ? groupBy.map((c: { reference: string }) => c.reference)
            : [];
    }, [resultsData?.pivotDetails]);

    const dirtyPivotDimensions = useMemo(
        () => pivotDimensions ?? [],
        [pivotDimensions],
    );

    const isQueryFetching = Boolean(
        resultsData?.isInitialLoading ||
            resultsData?.isFetchingFirstPage ||
            resultsData?.isFetchingRows,
    );

    const shouldShow = useMemo(() => {
        // Only show when not loading/fetching
        if (isLoading || isQueryFetching) return false;
        // Only show when using SQL pivot results
        if (!useSqlPivotResults) return false;
        // If both sides empty/undefined, no warning
        if (
            resultsPivotDimensions.length === 0 &&
            dirtyPivotDimensions.length === 0
        )
            return false;
        // Show when arrays differ
        return !isEqual(dirtyPivotDimensions, resultsPivotDimensions);
    }, [
        useSqlPivotResults,
        dirtyPivotDimensions,
        isLoading,
        isQueryFetching,
        resultsPivotDimensions,
    ]);

    if (!shouldShow) return null;

    return (
        <Tooltip
            label={`Please re-run the query to fetch the latest data with correct group by settings.`}
            multiline
            position={'bottom'}
        >
            <Badge
                leftSection={<MantineIcon icon={IconAlertCircle} size={'sm'} />}
                color="yellow"
                variant="outline"
                tt="none"
            >
                Results may be incorrect
            </Badge>
        </Tooltip>
    );
};

export default VisualizationWarning;
