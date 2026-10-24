import { CartesianSeriesType } from '@lightdash/common';
import { hasIncompletePeriod } from '@lightdash/visualization/editor';
import { Checkbox, Group } from '@mantine/core';
import { useId, useMemo, type FC } from 'react';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationState } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';

const HatchedBarPreview: FC<{ color: string }> = ({ color }) => {
    const patternId = useId();
    return (
        <svg width="14" height="14" aria-hidden>
            <defs>
                <pattern
                    id={patternId}
                    width="6"
                    height="6"
                    patternUnits="userSpaceOnUse"
                >
                    <rect width="6" height="6" fill={color} fillOpacity={0.6} />
                    <path
                        d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2"
                        stroke={color}
                        strokeWidth={2}
                    />
                </pattern>
            </defs>
            <rect width="14" height="14" rx="2" fill={`url(#${patternId})`} />
        </svg>
    );
};

const DashedLinePreview: FC<{ color: string }> = ({ color }) => (
    <svg width="28" height="14" aria-hidden>
        <path
            d="M1,11 L12,7"
            stroke={color}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
        />
        <path
            d="M12,7 L27,3"
            stroke={color}
            strokeWidth={2}
            fill="none"
            strokeDasharray="3 2"
        />
    </svg>
);

export const IncompletePeriodSection: FC = () => {
    const { visualizationConfig, itemsMap, resultsData, getSeriesColor } =
        useVisualizationState();
    const chartConfig = isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : undefined;
    const xFieldId = chartConfig?.dirtyLayout?.xField;

    // Only shown when the results hold a period that hasn't finished yet
    const hasIncomplete = useMemo(
        () =>
            !!xFieldId &&
            hasIncompletePeriod({
                field: itemsMap?.[xFieldId],
                xValues: (resultsData?.rows ?? []).map(
                    (row) => row[xFieldId]?.value.raw,
                ),
                timezone: resultsData?.resolvedTimezone,
                now: new Date(),
            }),
        [xFieldId, itemsMap, resultsData],
    );

    if (!chartConfig || !hasIncomplete) return null;

    const series = chartConfig.dirtyEchartsConfig?.series ?? [];
    const [firstSeries] = series;
    const color = firstSeries ? getSeriesColor(firstSeries) : undefined;
    const hasBars = series.some((s) => s.type === CartesianSeriesType.BAR);
    const hasLines = series.some(
        (s) =>
            s.type === CartesianSeriesType.LINE ||
            s.type === CartesianSeriesType.AREA,
    );

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Incomplete periods</Config.Heading>
                <Checkbox
                    size="xs"
                    label={
                        <Group gap="xs" wrap="nowrap">
                            Indicate incomplete periods
                            {color && hasBars && (
                                <HatchedBarPreview color={color} />
                            )}
                            {color && hasLines && (
                                <DashedLinePreview color={color} />
                            )}
                        </Group>
                    }
                    checked={!!chartConfig.dirtyLayout?.showIncompletePeriod}
                    onChange={(e) =>
                        chartConfig.setShowIncompletePeriod(
                            e.currentTarget.checked,
                        )
                    }
                />
            </Config.Section>
        </Config>
    );
};
