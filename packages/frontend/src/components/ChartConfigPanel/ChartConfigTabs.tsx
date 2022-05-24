import { InputGroup, Switch, Tab, Tabs } from '@blueprintjs/core';
import {
    convertAdditionalMetric,
    fieldId,
    getAxisName,
    getDefaultSeriesColor,
    getDimensions,
    getItemId,
    getItemLabel,
    getMetrics,
    getSeriesId,
    isField,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import React, { FC, useCallback, useMemo, useState } from 'react';
import { useOrganisation } from '../../hooks/organisation/useOrganisation';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    InputWrapper,
    MinMaxContainer,
    MinMaxInput,
    MinMaxWrapper,
    Wrapper,
} from './ChartConfigPanel.styles';
import FieldLayoutOptions from './FieldLayoutOptions';
import BasicSeriesConfiguration from './Series/BasicSeriesConfiguration';
import GroupedSeriesConfiguration from './Series/GroupedSeriesConfiguration';

interface MinMaxProps {
    minVal: (index: number, value: string | number | undefined) => void;
    maxVal: (index: number, value: string | number | undefined) => void;
    index: number;
    axis: string;
}

const AxisMinMax: FC<MinMaxProps> = ({ minVal, maxVal, index, axis }) => {
    const [isAuto, setIsAuto] = useState<boolean>(true);
    const {
        cartesianConfig: { dirtyEchartsConfig },
    } = useVisualizationContext();
    const { track } = useTracking();

    const minDefaultValue =
        (axis === 'y'
            ? dirtyEchartsConfig?.yAxis?.[index]?.min?.toString()
            : dirtyEchartsConfig?.xAxis?.[index]?.min?.toString()) || undefined;
    const maxDefaultValue =
        (axis === 'y'
            ? dirtyEchartsConfig?.yAxis?.[index]?.max?.toString()
            : dirtyEchartsConfig?.xAxis?.[index]?.max?.toString()) || undefined;

    return (
        <MinMaxContainer>
            <Switch
                name="auto-range"
                checked={isAuto}
                label="Auto y-axis range"
                onChange={() => {
                    setIsAuto((prev) => !prev);
                    track({
                        name: EventName.CUSTOM_AXIS_RANGE_TOGGLE_CLICKED,
                        properties: {
                            custom_axis_range: isAuto,
                        },
                    });
                }}
            />
            {!isAuto && (
                <MinMaxWrapper>
                    <MinMaxInput label="Min">
                        <InputGroup
                            placeholder="Min"
                            defaultValue={minDefaultValue}
                            onBlur={(e) => minVal(index, e.currentTarget.value)}
                        />
                    </MinMaxInput>

                    <MinMaxInput label="Max">
                        <InputGroup
                            placeholder="Max"
                            defaultValue={maxDefaultValue}
                            onBlur={(e) => maxVal(index, e.currentTarget.value)}
                        />
                    </MinMaxInput>
                </MinMaxWrapper>
            )}
        </MinMaxContainer>
    );
};

const ChartConfigTabs: FC = () => {
    const {
        explore,
        resultsData,
        cartesianConfig: {
            dirtyLayout,
            dirtyEchartsConfig,
            updateSingleSeries,
            updateAllGroupedSeries,
            setXAxisName,
            setYAxisName,
            setYMinValue,
            setYMaxValue,
            setXMinValue,
            setXMaxValue,
        },
        pivotDimensions,
    } = useVisualizationContext();
    const pivotDimension = pivotDimensions?.[0];
    const [tab, setTab] = useState<string | number>('layout');

    const dimensionsInMetricQuery = explore
        ? getDimensions(explore).filter((field) =>
              resultsData?.metricQuery.dimensions.includes(fieldId(field)),
          )
        : [];
    console.log({ resultsData, dirtyLayout });
    const metricsAndTableCalculations: Array<Metric | TableCalculation> =
        explore
            ? [
                  ...getMetrics(explore),
                  ...(resultsData?.metricQuery.additionalMetrics || []).reduce<
                      Metric[]
                  >((acc, additionalMetric) => {
                      const table = explore.tables[additionalMetric.table];
                      if (table) {
                          const metric = convertAdditionalMetric({
                              additionalMetric,
                              table,
                          });
                          return [...acc, metric];
                      }
                      return acc;
                  }, []),
                  ...(resultsData?.metricQuery.tableCalculations || []),
              ].filter((item) => {
                  if (isField(item)) {
                      return resultsData?.metricQuery.metrics.includes(
                          fieldId(item),
                      );
                  }
                  return true;
              })
            : [];

    const items = [...dimensionsInMetricQuery, ...metricsAndTableCalculations];

    const xAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    const { data: orgData } = useOrganisation();
    const fallbackSeriesColours = useMemo(() => {
        return (dirtyEchartsConfig?.series || [])
            .filter(({ color }) => !color)
            .reduce<Record<string, string>>(
                (sum, series, index) => ({
                    ...sum,
                    [getSeriesId(series)]:
                        (orgData?.chartColors && orgData?.chartColors[index]) ||
                        getDefaultSeriesColor(index),
                }),
                {},
            );
    }, [dirtyEchartsConfig, orgData]);

    const getSeriesColor = useCallback(
        (seriesId: string) => {
            return fallbackSeriesColours[seriesId];
        },
        [fallbackSeriesColours],
    );

    const selectedAxisInSeries = Array.from(
        new Set(
            dirtyEchartsConfig?.series?.map(({ yAxisIndex }) => yAxisIndex),
        ),
    );
    const isAxisTheSameForAllSeries: boolean =
        selectedAxisInSeries.length === 1;
    const selectedAxisIndex = selectedAxisInSeries[0] || 0;

    return (
        <Wrapper>
            <Tabs
                onChange={setTab}
                selectedTabId={tab}
                renderActiveTabPanelOnly
            >
                <Tab
                    id="layout"
                    title="Layout"
                    panel={<FieldLayoutOptions items={items} />}
                />
                <Tab
                    id="series"
                    title="Series"
                    panel={
                        pivotDimension ? (
                            <GroupedSeriesConfiguration
                                items={items}
                                layout={dirtyLayout}
                                series={dirtyEchartsConfig?.series}
                                getSeriesColor={getSeriesColor}
                                updateSingleSeries={updateSingleSeries}
                                updateAllGroupedSeries={updateAllGroupedSeries}
                            />
                        ) : (
                            <BasicSeriesConfiguration
                                items={items}
                                layout={dirtyLayout}
                                series={dirtyEchartsConfig?.series}
                                getSeriesColor={getSeriesColor}
                                updateSingleSeries={updateSingleSeries}
                            />
                        )
                    }
                />
                <Tab
                    id="axes"
                    title="Axes"
                    panel={
                        <>
                            <InputWrapper
                                label={`${
                                    dirtyLayout?.flipAxes ? 'Y' : 'X'
                                }-axis label`}
                            >
                                <InputGroup
                                    placeholder="Enter axis label"
                                    defaultValue={
                                        dirtyEchartsConfig?.xAxis?.[0]?.name ||
                                        (xAxisField && getItemLabel(xAxisField))
                                    }
                                    onBlur={(e) =>
                                        setXAxisName(e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                            <AxisMinMax
                                minVal={setXMinValue}
                                maxVal={setXMaxValue}
                                index={0}
                                axis="x"
                            />
                            <InputWrapper
                                label={`${
                                    dirtyLayout?.flipAxes ? 'X' : 'Y'
                                }-axis label (${
                                    dirtyLayout?.flipAxes ? 'bottom' : 'left'
                                })`}
                            >
                                <InputGroup
                                    placeholder="Enter axis label"
                                    defaultValue={
                                        dirtyEchartsConfig?.yAxis?.[0]?.name ||
                                        getAxisName({
                                            isAxisTheSameForAllSeries,
                                            selectedAxisIndex,
                                            axisReference: 'yRef',
                                            axisIndex: 0,
                                            series: dirtyEchartsConfig?.series,
                                            items,
                                        })
                                    }
                                    onBlur={(e) =>
                                        setYAxisName(0, e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                            <AxisMinMax
                                minVal={setYMinValue}
                                maxVal={setYMaxValue}
                                index={0}
                                axis="y"
                            />
                            <InputWrapper
                                label={`${
                                    dirtyLayout?.flipAxes ? 'X' : 'Y'
                                }-axis label (${
                                    dirtyLayout?.flipAxes ? 'top' : 'right'
                                })`}
                            >
                                <InputGroup
                                    placeholder="Enter axis label"
                                    defaultValue={
                                        dirtyEchartsConfig?.yAxis?.[1]?.name ||
                                        getAxisName({
                                            isAxisTheSameForAllSeries,
                                            selectedAxisIndex,
                                            axisReference: 'yRef',
                                            axisIndex: 1,
                                            series: dirtyEchartsConfig?.series,
                                            items,
                                        })
                                    }
                                    onBlur={(e) =>
                                        setYAxisName(1, e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                            <AxisMinMax
                                minVal={setYMinValue}
                                maxVal={setYMaxValue}
                                index={1}
                                axis="y"
                            />
                        </>
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
