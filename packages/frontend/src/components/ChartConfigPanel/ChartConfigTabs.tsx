import { HTMLSelect, InputGroup, Switch, Tab, Tabs } from '@blueprintjs/core';
import {
    fieldId,
    getDefaultSeriesColor,
    getDimensions,
    getItemId,
    getItemLabel,
    getMetrics,
    getSeriesId,
    isField,
    Metric,
    TableCalculation,
} from 'common';
import React, { FC, useCallback, useMemo, useState } from 'react';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    FieldRow,
    FieldRowInputs,
    FieldsGrid,
    GridLabel,
    InputWrapper,
    Wrapper,
} from './ChartConfigPanel.styles';
import FieldLayoutOptions from './FieldLayoutOptions';
import SeriesColorPicker from './SeriesColorPicker';

const ChartConfigTabs: FC = () => {
    const {
        explore,
        resultsData,
        cartesianConfig: {
            dirtyLayout,
            dirtyEchartsConfig,
            setXField,
            addSingleSeries,
            removeSingleSeries,
            updateSingleSeries,
            setLabel,
            setXAxisName,
            setYAxisName,
        },
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const yFieldsKeys = dirtyLayout?.yField || [];
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

    const firstYAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.yField?.[0],
    );

    const showValues = !!dirtyEchartsConfig?.series?.[0]?.label?.show;

    const fallbackSeriesColours = useMemo(() => {
        return (dirtyEchartsConfig?.series || [])
            .filter(({ color }) => !color)
            .reduce<Record<string, string>>(
                (sum, series, index) => ({
                    ...sum,
                    [getSeriesId(series)]: getDefaultSeriesColor(index),
                }),
                {},
            );
    }, [dirtyEchartsConfig]);

    const getSeriesColor = useCallback(
        (seriesId: string) => {
            return fallbackSeriesColours[seriesId];
        },
        [fallbackSeriesColours],
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
                    panel={
                        <FieldsGrid>
                            <GridLabel>Field</GridLabel>
                            <GridLabel>Axis</GridLabel>
                            {items.map((item) => {
                                const itemId = getItemId(item);
                                return (
                                    <FieldLayoutOptions
                                        key={getItemId(item)}
                                        item={item}
                                        isXActive={
                                            xAxisField &&
                                            getItemId(xAxisField) === itemId
                                        }
                                        isYActive={yFieldsKeys.includes(itemId)}
                                        isGroupActive={
                                            !!pivotDimension &&
                                            pivotDimension === itemId
                                        }
                                        onXClick={(isActive) =>
                                            setXField(
                                                isActive ? itemId : undefined,
                                            )
                                        }
                                        onYClick={(isActive) => {
                                            if (isActive) {
                                                addSingleSeries(itemId);
                                            } else {
                                                const index =
                                                    yFieldsKeys.findIndex(
                                                        (yField) =>
                                                            yField === itemId,
                                                    );
                                                if (index !== undefined) {
                                                    removeSingleSeries(index);
                                                }
                                            }
                                        }}
                                        onGroupClick={(isActive) =>
                                            isActive
                                                ? setPivotDimensions([itemId])
                                                : setPivotDimensions(undefined)
                                        }
                                    />
                                );
                            })}
                        </FieldsGrid>
                    }
                />
                <Tab
                    id="axes"
                    title="Axes"
                    panel={
                        <>
                            <InputWrapper label="X-axis label">
                                <InputGroup
                                    placeholder={
                                        xAxisField
                                            ? getItemLabel(xAxisField)
                                            : 'Enter X-axis label'
                                    }
                                    defaultValue={
                                        dirtyEchartsConfig?.xAxis?.[0].name
                                    }
                                    onBlur={(e) =>
                                        setXAxisName(e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                            <InputWrapper label="Y-axis label">
                                <InputGroup
                                    placeholder={
                                        dirtyEchartsConfig?.series?.[0]?.name ||
                                        (firstYAxisField
                                            ? getItemLabel(firstYAxisField)
                                            : 'Enter Y-axis label')
                                    }
                                    defaultValue={
                                        dirtyEchartsConfig?.yAxis?.[0].name
                                    }
                                    onBlur={(e) =>
                                        setYAxisName(e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                        </>
                    }
                />
                <Tab
                    id="series"
                    title="Series"
                    panel={
                        <>
                            {!pivotDimension && (
                                <InputWrapper label="Custom series labels">
                                    {dirtyEchartsConfig?.series?.map(
                                        (series, index) => {
                                            const yField =
                                                series.encode.yRef.field;
                                            const activeField = items.find(
                                                (item) =>
                                                    getItemId(item) === yField,
                                            );
                                            if (!activeField) {
                                                return null;
                                            }
                                            return (
                                                <FieldRow>
                                                    <FieldRowInputs>
                                                        <SeriesColorPicker
                                                            color={
                                                                series.color ||
                                                                getSeriesColor(
                                                                    getSeriesId(
                                                                        series,
                                                                    ),
                                                                )
                                                            }
                                                            onChange={(
                                                                color,
                                                            ) => {
                                                                updateSingleSeries(
                                                                    index,
                                                                    {
                                                                        ...series,
                                                                        color,
                                                                    },
                                                                );
                                                            }}
                                                        />

                                                        <InputGroup
                                                            fill
                                                            placeholder={
                                                                activeField
                                                                    ? getItemLabel(
                                                                          activeField,
                                                                      )
                                                                    : 'Enter custom series label'
                                                            }
                                                            defaultValue={
                                                                series.name
                                                            }
                                                            onBlur={(e) =>
                                                                updateSingleSeries(
                                                                    index,
                                                                    {
                                                                        ...series,
                                                                        name: e
                                                                            .currentTarget
                                                                            .value,
                                                                    },
                                                                )
                                                            }
                                                        />
                                                    </FieldRowInputs>
                                                </FieldRow>
                                            );
                                        },
                                    )}
                                </InputWrapper>
                            )}
                            <InputWrapper label="Value labels">
                                <Switch
                                    checked={showValues}
                                    label={showValues ? 'On' : 'Off'}
                                    onChange={(e) =>
                                        setLabel(
                                            e.currentTarget.checked
                                                ? {
                                                      show: true,
                                                      position: 'top',
                                                  }
                                                : {
                                                      show: false,
                                                      position: undefined,
                                                  },
                                        )
                                    }
                                />
                                {showValues && (
                                    <HTMLSelect
                                        options={[
                                            'top',
                                            'bottom',
                                            'left',
                                            'right',
                                        ]}
                                        fill
                                        onChange={(e) =>
                                            setLabel({
                                                position: e.currentTarget
                                                    .value as any,
                                            })
                                        }
                                    />
                                )}
                            </InputWrapper>
                        </>
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
