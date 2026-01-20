import { FeatureFlags, type CatalogField } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { MetricExploreModalV1 } from './MetricExploreModalV1';
import { MetricExploreModalV2 } from './MetricExploreModalV2';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    metrics: CatalogField[];
};

/**
 * MetricExploreModal router - switches between V1 (recharts) and V2 (echarts) based on feature flag
 *
 * V1: Original implementation using recharts (default)
 * V2: New implementation using VisualizationProvider + echarts
 */
export const MetricExploreModal: FC<Props> = (props) => {
    const metricExploreModalV2Flag = useServerFeatureFlag(
        FeatureFlags.MetricsCatalogEchartsVisualization,
    );
    const isEchartsEnabled = metricExploreModalV2Flag.data?.enabled === true;

    return isEchartsEnabled ? (
        <MetricExploreModalV2 {...props} />
    ) : (
        <MetricExploreModalV1 {...props} />
    );
};
