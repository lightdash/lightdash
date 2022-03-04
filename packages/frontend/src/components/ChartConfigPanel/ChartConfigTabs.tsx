import {
    Button,
    Colors,
    HTMLSelect,
    Icon,
    InputGroup,
    Switch,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import {
    fieldId,
    getDimensions,
    getMetrics,
    isField,
    Metric,
    TableCalculation,
} from 'common';
import React, { FC, useState } from 'react';
import { BlockPicker, ColorResult } from 'react-color';
import { useToggle } from 'react-use';
import { ECHARTS_DEFAULT_COLORS } from '../../hooks/useCartesianChartConfig';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import SimpleButton from '../common/SimpleButton';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    ColorButton,
    FieldRow,
    FieldRowInlineInputs,
    FieldRowInputs,
    InputWrapper,
    Wrapper,
} from './ChartConfigPanel.styles';

const ChartConfigTabs: FC = () => {
    const {
        explore,
        resultsData,
        cartesianConfig,
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const xField = (cartesianConfig.dirtyConfig?.series || [])[0]?.xField;
    const yFieldsKeys =
        cartesianConfig.dirtyConfig?.series?.reduce<string[]>(
            (sum, { yField }) => (yField ? [...sum, yField] : sum),
            [],
        ) || [];
    const pivotDimension = pivotDimensions?.[0];

    const [tab, setTab] = useState<string | number>('x-axis');
    const [isOpen, toggle] = useToggle(false);

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

    const activeDimension = items.find(
        (item) => (isField(item) ? fieldId(item) : item.name) === xField,
    );

    const yOptions = items.filter(
        (item) =>
            !yFieldsKeys.includes(isField(item) ? fieldId(item) : item.name),
    );

    const activeGroupDimension = items.find(
        (item) =>
            (isField(item) ? fieldId(item) : item.name) === pivotDimension,
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
                    id="x-axis"
                    title="X-axis"
                    panel={
                        <>
                            <InputWrapper label="X-axis label">
                                <InputGroup
                                    placeholder="Enter X-axis label"
                                    defaultValue={cartesianConfig.xAxisName}
                                    onBlur={(e) =>
                                        cartesianConfig.setXAxisName(
                                            e.currentTarget.value,
                                        )
                                    }
                                />
                            </InputWrapper>
                            <InputWrapper label="Field">
                                <FieldAutoComplete
                                    activeField={activeDimension}
                                    fields={items}
                                    onChange={(item) =>
                                        cartesianConfig.setXField(
                                            isField(item)
                                                ? fieldId(item)
                                                : item.name,
                                        )
                                    }
                                />
                            </InputWrapper>
                        </>
                    }
                />
                <Tab
                    id="y-axis"
                    title="Y-axis"
                    panel={
                        <>
                            <InputWrapper label="Y-axis label">
                                <InputGroup
                                    placeholder="Enter Y-axis label"
                                    defaultValue={cartesianConfig.yAxisName}
                                    onBlur={(e) =>
                                        cartesianConfig.setYAxisName(
                                            e.currentTarget.value,
                                        )
                                    }
                                />
                            </InputWrapper>

                            <InputWrapper label="Field(s)">
                                {cartesianConfig.dirtyConfig?.series?.map(
                                    (series, index) => {
                                        const activeMetric = items.find(
                                            (item) =>
                                                (isField(item)
                                                    ? fieldId(item)
                                                    : item.name) ===
                                                series.yField,
                                        );
                                        if (!activeMetric) {
                                            return null;
                                        }
                                        return (
                                            <FieldRow>
                                                <FieldRowInputs>
                                                    <FieldAutoComplete
                                                        disabled
                                                        activeField={
                                                            activeMetric
                                                        }
                                                        fields={yOptions}
                                                        onChange={() =>
                                                            undefined
                                                        }
                                                    />
                                                    <FieldRowInlineInputs>
                                                        <Popover2
                                                            content={
                                                                <BlockPicker
                                                                    color={
                                                                        series.color
                                                                    }
                                                                    colors={
                                                                        ECHARTS_DEFAULT_COLORS
                                                                    }
                                                                    onChange={(
                                                                        color: ColorResult,
                                                                    ) => {
                                                                        cartesianConfig.updateSingleSeries(
                                                                            index,
                                                                            {
                                                                                ...series,
                                                                                color: color.hex,
                                                                            },
                                                                        );
                                                                    }}
                                                                />
                                                            }
                                                            position="bottom"
                                                            lazy={true}
                                                        >
                                                            <ColorButton
                                                                style={{
                                                                    backgroundColor:
                                                                        series.color,
                                                                }}
                                                            >
                                                                {!series.color && (
                                                                    <Icon
                                                                        icon="tint"
                                                                        color={
                                                                            Colors.GRAY3
                                                                        }
                                                                    />
                                                                )}
                                                            </ColorButton>
                                                        </Popover2>
                                                        <InputGroup
                                                            fill
                                                            placeholder="Enter custom series label"
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
                                                    </FieldRowInlineInputs>
                                                </FieldRowInputs>
                                                <Button
                                                    minimal
                                                    icon={'small-cross'}
                                                    disabled={
                                                        yFieldsKeys.length <= 1
                                                    }
                                                    onClick={() =>
                                                        cartesianConfig.removeSingleSeries(
                                                            index,
                                                        )
                                                    }
                                                />
                                            </FieldRow>
                                        );
                                    },
                                )}
                                {isOpen && (
                                    <FieldRow>
                                        <FieldAutoComplete
                                            fields={yOptions}
                                            onChange={(item) => {
                                                cartesianConfig.addSingleSeries(
                                                    {
                                                        yField: isField(item)
                                                            ? fieldId(item)
                                                            : item.name,
                                                    },
                                                );
                                                toggle(false);
                                            }}
                                        />
                                        <Button
                                            minimal
                                            icon={'small-cross'}
                                            onClick={() => {
                                                toggle(false);
                                            }}
                                        />
                                    </FieldRow>
                                )}
                                {!isOpen && (
                                    <SimpleButton
                                        minimal
                                        icon={'plus'}
                                        text="Add"
                                        disabled={yOptions.length <= 0}
                                        onClick={() => toggle(true)}
                                    />
                                )}
                            </InputWrapper>
                        </>
                    }
                />
                <Tab
                    id="chart"
                    title="Chart"
                    panel={
                        <>
                            <InputWrapper label="Labels">
                                <Switch
                                    checked={showValues}
                                    label="Show value labels"
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
                            </InputWrapper>
                            {showValues && (
                                <InputWrapper label="Label position">
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
                                </InputWrapper>
                            )}
                            <InputWrapper label="Group">
                                <FieldRow>
                                    <FieldAutoComplete
                                        disabled={items.length <= 0}
                                        activeField={activeGroupDimension}
                                        fields={items}
                                        onChange={(item) =>
                                            setPivotDimensions([
                                                isField(item)
                                                    ? fieldId(item)
                                                    : item.name,
                                            ])
                                        }
                                    />
                                    {activeGroupDimension && (
                                        <Button
                                            minimal
                                            icon={'small-cross'}
                                            onClick={() => {
                                                setPivotDimensions(undefined);
                                            }}
                                        />
                                    )}
                                </FieldRow>
                            </InputWrapper>
                        </>
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
