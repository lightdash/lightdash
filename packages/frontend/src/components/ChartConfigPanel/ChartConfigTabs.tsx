import { InputGroup, Tab, Tabs } from '@blueprintjs/core';
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
import { useToggle } from 'react-use';
import { useOrganisation } from '../../hooks/organisation/useOrganisation';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    AutoRangeSwitch,
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
    label: string;
    min: string | undefined;
    max: string | undefined;
    setMin: (value: string | undefined) => void;
    setMax: (value: string | undefined) => void;
}

const AxisMinMax: FC<MinMaxProps> = ({ label, min, max, setMin, setMax }) => {
    const [isAuto, toggleAuto] = useToggle(!(min || max));
    const { track } = useTracking();

    const clearRange = useCallback(() => {
        if (!isAuto) {
            setMin(undefined);
            setMax(undefined);
        }
        return;
    }, [isAuto, setMin, setMax]);

    return (
        <MinMaxContainer>
            <AutoRangeSwitch
                name="auto-range"
                checked={isAuto}
                label={label}
                onChange={() => {
                    toggleAuto((prev: boolean) => !prev);
                    clearRange();
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
                            defaultValue={min || undefined}
                            onBlur={(e) => setMin(e.currentTarget.value)}
                        />
                    </MinMaxInput>

                    <MinMaxInput label="Max">
                        <InputGroup
                            placeholder="Max"
                            defaultValue={max || undefined}
                            onBlur={(e) => setMax(e.currentTarget.value)}
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
                                label={`Auto ${
                                    dirtyLayout?.flipAxes ? 'y' : 'x'
                                }-axis range`}
                                min={
                                    dirtyLayout?.flipAxes
                                        ? dirtyEchartsConfig?.yAxis?.[0]?.min
                                        : dirtyEchartsConfig?.xAxis?.[0]?.min
                                }
                                max={
                                    dirtyLayout?.flipAxes
                                        ? dirtyEchartsConfig?.yAxis?.[0]?.max
                                        : dirtyEchartsConfig?.xAxis?.[0]?.max
                                }
                                setMin={(newValue: string | undefined) =>
                                    dirtyLayout?.flipAxes
                                        ? setYMinValue(0, newValue)
                                        : setXMinValue(0, newValue)
                                }
                                setMax={(newValue: string | undefined) =>
                                    dirtyLayout?.flipAxes
                                        ? setYMaxValue(0, newValue)
                                        : setXMaxValue(0, newValue)
                                }
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
                                label={`Auto ${
                                    dirtyLayout?.flipAxes ? 'x' : 'y'
                                }-axis range`}
                                min={
                                    dirtyLayout?.flipAxes
                                        ? dirtyEchartsConfig?.xAxis?.[0]?.min
                                        : dirtyEchartsConfig?.yAxis?.[0]?.min
                                }
                                max={
                                    dirtyLayout?.flipAxes
                                        ? dirtyEchartsConfig?.xAxis?.[0]?.max
                                        : dirtyEchartsConfig?.yAxis?.[0]?.max
                                }
                                setMin={(newValue: string | undefined) =>
                                    dirtyLayout?.flipAxes
                                        ? setXMinValue(0, newValue)
                                        : setYMinValue(0, newValue)
                                }
                                setMax={(newValue: string | undefined) =>
                                    dirtyLayout?.flipAxes
                                        ? setXMaxValue(0, newValue)
                                        : setYMaxValue(0, newValue)
                                }
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
                                label={`Auto ${
                                    dirtyLayout?.flipAxes ? 'x' : 'y'
                                }-axis range`}
                                min={
                                    dirtyLayout?.flipAxes
                                        ? dirtyEchartsConfig?.xAxis?.[1]?.min
                                        : dirtyEchartsConfig?.yAxis?.[1]?.min
                                }
                                max={
                                    dirtyLayout?.flipAxes
                                        ? dirtyEchartsConfig?.xAxis?.[1]?.max
                                        : dirtyEchartsConfig?.yAxis?.[1]?.max
                                }
                                setMin={(newValue: string | undefined) =>
                                    dirtyLayout?.flipAxes
                                        ? setXMinValue(1, newValue)
                                        : setYMinValue(1, newValue)
                                }
                                setMax={(newValue: string | undefined) =>
                                    dirtyLayout?.flipAxes
                                        ? setXMaxValue(1, newValue)
                                        : setYMaxValue(1, newValue)
                                }
                            />
                        </>
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
