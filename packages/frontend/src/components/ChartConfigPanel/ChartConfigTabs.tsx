import { Button, InputGroup, Tab, Tabs } from '@blueprintjs/core';
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
    const {
        explore,
        resultsData,
        cartesianConfig,
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const xField = (cartesianConfig.dirtyConfig?.series || [])[0]?.xField;
    const yFields =
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
        (item) => !yFields.includes(isField(item) ? fieldId(item) : item.name),
    );

    const groupDimensionsInMetricQuery = explore
        ? getDimensions(explore).filter(
              (field) =>
                  resultsData?.metricQuery.dimensions.includes(
                      fieldId(field),
                  ) && fieldId(field) !== xField,
          )
        : [];

    const activeGroupDimension = groupDimensionsInMetricQuery.find(
        (field) => fieldId(field) === pivotDimension,
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
                        <>
                            <InputWrapper label="X-axis label">
                                <InputGroup
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
                                    fields={dimensionsInMetricQuery}
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
                                    defaultValue={cartesianConfig.yAxisName}
                                    onBlur={(e) =>
                                        cartesianConfig.setYAxisName(
                                            e.currentTarget.value,
                                        )
                                    }
                                />
                            </InputWrapper>

                            <InputWrapper label="Field(s)">
                                {yFields.map((yFieldId) => {
                                    const activeMetric = items.find(
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
                                                disabled={yFields.length <= 1}
                                                onClick={() => {
                                                    cartesianConfig.setYFields(
                                                        yFields.filter(
                                                            (value) =>
                                                                value !==
                                                                yFieldId,
                                                        ),
                                                    );
                                                }}
                                            />
                                        </FieldRow>
                                    );
                                })}
                                {isOpen && (
                                    <FieldRow>
                                        <FieldAutoComplete
                                            fields={yOptions}
                                            onChange={(item) => {
                                                cartesianConfig.setYFields([
                                                    ...yFields,
                                                    isField(item)
                                                        ? fieldId(item)
                                                        : item.name,
                                                ]);
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
                                            setPivotDimensions([
                                                fieldId(field),
                                            ]);
                                        }
                                    }}
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
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
