import { InputGroup, Label, Switch, Tab, Tabs } from '@blueprintjs/core';
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
    isNumericItem,
    Metric,
    Series,
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
    GridSettings,
    InputWrapper,
    MinMaxContainer,
    MinMaxInput,
    MinMaxWrapper,
    SectionTitle,
    Wrapper,
} from './ChartConfigPanel.styles';
import FieldLayoutOptions from './FieldLayoutOptions';
import GridPanel from './Grid';
import LegendPanel from './Legend';
import BasicSeriesConfiguration from './Series/BasicSeriesConfiguration';
import GroupedSeriesConfiguration from './Series/GroupedSeriesConfiguration';
import { SeriesDivider } from './Series/Series.styles';

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
            setShowGridX,
            setShowGridY,
        },
    } = useVisualizationContext();
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

    const [showFirstAxisRange, showSecondAxisRange] = (
        dirtyEchartsConfig?.series || []
    ).reduce<[boolean, boolean]>(
        (acc, series) => {
            const seriesField = items.find(
                (item) => getItemId(item) === series.encode.yRef.field,
            );
            if (isNumericItem(seriesField)) {
                acc[series.yAxisIndex || 0] = true;
            }
            return acc;
        },
        [false, false],
    );

    const { series } = dirtyEchartsConfig || {};

    const [simpleSeries, groupedSeriesMap] = useMemo(
        () =>
            (series || []).reduce<[Series[], Record<string, Series[]>]>(
                ([simple, pivoted], obj) => {
                    if (obj.encode.yRef.pivotValues) {
                        return [
                            simple,
                            {
                                ...pivoted,
                                [obj.encode.yRef.field]: (
                                    pivoted[obj.encode.yRef.field] || []
                                ).concat(obj),
                            },
                        ];
                    }
                    return [[...simple, obj], pivoted];
                },
                [[], {}],
            ) || {},
        [series],
    );
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
                        <>
                            <BasicSeriesConfiguration
                                items={items}
                                layout={dirtyLayout}
                                series={simpleSeries}
                                getSeriesColor={getSeriesColor}
                                updateSingleSeries={updateSingleSeries}
                            />
                            {simpleSeries.length > 0 &&
                                Object.keys(groupedSeriesMap).length > 0 && (
                                    <SeriesDivider />
                                )}
                            <GroupedSeriesConfiguration
                                items={items}
                                layout={dirtyLayout}
                                groupedSeries={groupedSeriesMap}
                                getSeriesColor={getSeriesColor}
                                updateSingleSeries={updateSingleSeries}
                                updateAllGroupedSeries={updateAllGroupedSeries}
                            />
                        </>
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
                            {showFirstAxisRange && (
                                <AxisMinMax
                                    label={`Auto ${
                                        dirtyLayout?.flipAxes ? 'x' : 'y'
                                    }-axis range (${
                                        dirtyLayout?.flipAxes
                                            ? 'bottom'
                                            : 'left'
                                    })`}
                                    min={dirtyEchartsConfig?.yAxis?.[0]?.min}
                                    max={dirtyEchartsConfig?.yAxis?.[0]?.max}
                                    setMin={(newValue) =>
                                        setYMinValue(0, newValue)
                                    }
                                    setMax={(newValue) =>
                                        setYMaxValue(0, newValue)
                                    }
                                />
                            )}

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
                            {showSecondAxisRange && (
                                <AxisMinMax
                                    label={`Auto ${
                                        dirtyLayout?.flipAxes ? 'x' : 'y'
                                    }-axis range (${
                                        dirtyLayout?.flipAxes ? 'top' : 'right'
                                    })`}
                                    min={dirtyEchartsConfig?.yAxis?.[1]?.min}
                                    max={dirtyEchartsConfig?.yAxis?.[1]?.max}
                                    setMin={(newValue) =>
                                        setYMinValue(1, newValue)
                                    }
                                    setMax={(newValue) =>
                                        setYMaxValue(1, newValue)
                                    }
                                />
                            )}
                            <SectionTitle>Show grid</SectionTitle>

                            <GridSettings>
                                <Label>X-axis</Label>
                                <Switch
                                    large
                                    innerLabelChecked="Yes"
                                    innerLabel="No"
                                    checked={!!dirtyLayout?.showGridX}
                                    onChange={(e) => {
                                        setShowGridX(!dirtyLayout?.showGridX);
                                        // setShowTableName(!showTableNames);
                                    }}
                                />
                                <Label>Y-axis</Label>

                                <Switch
                                    large
                                    innerLabelChecked="Yes"
                                    innerLabel="No"
                                    checked={
                                        dirtyLayout?.showGridY !== undefined
                                            ? dirtyLayout?.showGridY
                                            : true
                                    }
                                    onChange={(e) => {
                                        setShowGridY(
                                            dirtyLayout?.showGridY !== undefined
                                                ? !dirtyLayout?.showGridY
                                                : false,
                                        );

                                        // setShowTableName(!showTableNames);
                                    }}
                                />
                            </GridSettings>
                        </>
                    }
                />
                <Tab id="legend" title="Legend" panel={<LegendPanel />} />
                <Tab id="grid" title="Margins" panel={<GridPanel />} />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
