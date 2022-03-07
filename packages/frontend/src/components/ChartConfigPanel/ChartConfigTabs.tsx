import { HTMLSelect, InputGroup, Switch, Tab, Tabs } from '@blueprintjs/core';
import {
    fieldId,
    getDimensions,
    getItemId,
    getItemLabel,
    getMetrics,
    isField,
    Metric,
    TableCalculation,
} from 'common';
import React, { FC, useState } from 'react';
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
        cartesianConfig,
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const yFieldsKeys =
        cartesianConfig.dirtyConfig?.series?.reduce<string[]>(
            (sum, { yField }) => (yField ? [...sum, yField] : sum),
            [],
        ) || [];
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
        (item) =>
            getItemId(item) ===
            (cartesianConfig.dirtyConfig?.series || [])[0]?.xField,
    );

    const firstYAxisField = items.find(
        (item) =>
            getItemId(item) ===
            (cartesianConfig.dirtyConfig?.series || [])[0]?.yField,
    );

    const showValues = cartesianConfig.dirtyConfig?.series
        ? cartesianConfig.dirtyConfig?.series[0]?.label?.show
        : false;

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
                                        onXClick={() =>
                                            cartesianConfig.setXField(itemId)
                                        }
                                        onYClick={(isActive) => {
                                            if (isActive) {
                                                cartesianConfig.addSingleSeries(
                                                    {
                                                        yField: itemId,
                                                    },
                                                );
                                            } else {
                                                const seriesIndex =
                                                    cartesianConfig.dirtyConfig?.series?.findIndex(
                                                        ({ yField }) =>
                                                            yField === itemId,
                                                    );
                                                if (seriesIndex !== undefined) {
                                                    cartesianConfig.removeSingleSeries(
                                                        seriesIndex,
                                                    );
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
                                    defaultValue={cartesianConfig.xAxisName}
                                    onBlur={(e) =>
                                        cartesianConfig.setXAxisName(
                                            e.currentTarget.value,
                                        )
                                    }
                                />
                            </InputWrapper>
                            <InputWrapper label="Y-axis label">
                                <InputGroup
                                    placeholder={
                                        cartesianConfig.dirtyConfig?.series?.[0]
                                            ?.name ||
                                        (firstYAxisField
                                            ? getItemLabel(firstYAxisField)
                                            : 'Enter Y-axis label')
                                    }
                                    defaultValue={cartesianConfig.yAxisName}
                                    onBlur={(e) =>
                                        cartesianConfig.setYAxisName(
                                            e.currentTarget.value,
                                        )
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
                            <InputWrapper label="Custom series labels">
                                {cartesianConfig.dirtyConfig?.series?.map(
                                    (series, index) => {
                                        const activeField = items.find(
                                            (item) =>
                                                getItemId(item) ===
                                                series.yField,
                                        );
                                        if (!activeField) {
                                            return null;
                                        }
                                        return (
                                            <FieldRow>
                                                <FieldRowInputs>
                                                    {!pivotDimension && (
                                                        <SeriesColorPicker
                                                            color={series.color}
                                                            onChange={(
                                                                color,
                                                            ) => {
                                                                cartesianConfig.updateSingleSeries(
                                                                    index,
                                                                    {
                                                                        ...series,
                                                                        color,
                                                                    },
                                                                );
                                                            }}
                                                        />
                                                    )}
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
                                                            cartesianConfig.updateSingleSeries(
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
                            <InputWrapper label="Value labels">
                                <Switch
                                    checked={showValues}
                                    label={showValues ? 'On' : 'Off'}
                                    onChange={(e) =>
                                        cartesianConfig.setLabel(
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
                                            cartesianConfig.setLabel({
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
