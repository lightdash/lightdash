import { Button, Tab, Tabs } from '@blueprintjs/core';
import {
    fieldId,
    getDimensions,
    getMetrics,
    isField,
    Metric,
    TableCalculation,
} from 'common';
import React, { FC, useState } from 'react';
import { useToggle } from 'react-use';
import FieldAutoComplete from '../common/Filters/FieldAutoComplete';
import SimpleButton from '../common/SimpleButton';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { FieldRow, InputWrapper, Wrapper } from './ChartConfigPanel.styles';

const ChartConfigTabs: FC = () => {
    const { explore, resultsData, chartConfig } = useVisualizationContext();
    const [tab, setTab] = useState<string | number>('x-axis');
    const [isOpen, toggle] = useToggle(false);

    const dimensionsInMetricQuery = explore
        ? getDimensions(explore).filter((field) =>
              resultsData?.metricQuery.dimensions.includes(fieldId(field)),
          )
        : [];

    const activeDimension = dimensionsInMetricQuery.find(
        (field) => fieldId(field) === chartConfig?.seriesLayout.xDimension,
    );

    const metricsAndTableCalculations: Array<Metric | TableCalculation> =
        explore
            ? [
                  ...getMetrics(explore),
                  ...(chartConfig?.tableCalculationOptions || []),
              ].filter((item) => {
                  if (isField(item)) {
                      return resultsData?.metricQuery.metrics.includes(
                          fieldId(item),
                      );
                  }
                  return true;
              })
            : [];

    const yOptions = metricsAndTableCalculations.filter(
        (item) =>
            !chartConfig?.seriesLayout.yMetrics?.includes(
                isField(item) ? fieldId(item) : item.name,
            ),
    );

    const groupDimensionsInMetricQuery = explore
        ? getDimensions(explore).filter(
              (field) =>
                  resultsData?.metricQuery.dimensions.includes(
                      fieldId(field),
                  ) && fieldId(field) !== chartConfig?.seriesLayout.xDimension,
          )
        : [];

    const activeGroupDimension = groupDimensionsInMetricQuery.find(
        (field) => fieldId(field) === chartConfig?.seriesLayout.groupDimension,
    );

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
                        <InputWrapper label="Field">
                            <FieldAutoComplete
                                activeField={activeDimension}
                                fields={dimensionsInMetricQuery}
                                onChange={(field) => {
                                    if (isField(field)) {
                                        chartConfig?.setXDimension(
                                            fieldId(field),
                                        );
                                    }
                                }}
                            />
                        </InputWrapper>
                    }
                />
                <Tab
                    id="y-axis"
                    title="Y-axis"
                    panel={
                        <InputWrapper label="Field(s)">
                            {chartConfig?.seriesLayout.yMetrics?.map(
                                (yFieldId) => {
                                    const activeMetric =
                                        metricsAndTableCalculations.find(
                                            (item) =>
                                                (isField(item)
                                                    ? fieldId(item)
                                                    : item.name) === yFieldId,
                                        );
                                    if (!activeMetric) {
                                        return null;
                                    }
                                    return (
                                        <FieldRow>
                                            <FieldAutoComplete
                                                disabled
                                                activeField={activeMetric}
                                                fields={yOptions}
                                                onChange={() => undefined}
                                            />
                                            <Button
                                                minimal
                                                icon={'small-cross'}
                                                disabled={
                                                    chartConfig?.seriesLayout
                                                        .yMetrics &&
                                                    chartConfig?.seriesLayout
                                                        .yMetrics?.length <= 1
                                                }
                                                onClick={() => {
                                                    chartConfig?.toggleYMetric(
                                                        yFieldId,
                                                    );
                                                }}
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
                                            chartConfig?.toggleYMetric(
                                                isField(item)
                                                    ? fieldId(item)
                                                    : item.name,
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
                    }
                />
                <Tab
                    id="chart"
                    title="Chart"
                    panel={
                        <InputWrapper label="Group">
                            <FieldRow>
                                <FieldAutoComplete
                                    disabled={
                                        groupDimensionsInMetricQuery.length <= 0
                                    }
                                    activeField={activeGroupDimension}
                                    fields={groupDimensionsInMetricQuery}
                                    onChange={(field) => {
                                        if (isField(field)) {
                                            chartConfig?.setGroupDimension(
                                                fieldId(field),
                                            );
                                        }
                                    }}
                                />
                                {activeGroupDimension && (
                                    <Button
                                        minimal
                                        icon={'small-cross'}
                                        onClick={() => {
                                            chartConfig?.setGroupDimension(
                                                undefined,
                                            );
                                        }}
                                    />
                                )}
                            </FieldRow>
                        </InputWrapper>
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
