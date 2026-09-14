import {
    ContentReviewContentType,
    type ChartSimilarityContext,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { type FC } from 'react';
import { useContentReviewAvailability } from '../hooks/useContentReviewAvailability';
import { useSimilarContent } from '../hooks/useSimilarContent';
import SimilarContentPanel from './SimilarContentPanel';

const SaveChartSuggestions: FC<{
    projectUuid: string | null;
    name: string;
    chart: ChartSimilarityContext;
}> = ({ projectUuid, name, chart }) => {
    const { isAvailable } = useContentReviewAvailability();
    const [debouncedName] = useDebouncedValue(name.trim(), 300);
    const {
        data: items = [],
        isInitialLoading,
        isError,
        isEnabled,
    } = useSimilarContent(
        projectUuid ?? '',
        {
            contentType: ContentReviewContentType.CHART,
            name: debouncedName,
            excludeContentUuid: null,
            chart,
        },
        isAvailable && projectUuid !== null && debouncedName.length >= 3,
    );
    if (
        !isEnabled ||
        isError ||
        !isAvailable ||
        projectUuid === null ||
        name.trim().length < 3
    )
        return null;
    if (name.trim() !== debouncedName || isInitialLoading)
        return (
            <Text size="xs" c="dimmed" role="status">
                Checking for related charts…
            </Text>
        );
    return (
        <SimilarContentPanel
            projectUuid={projectUuid}
            contentType={ContentReviewContentType.CHART}
            contentUuid={null}
            items={items}
            variant="save"
        />
    );
};

export default SaveChartSuggestions;
