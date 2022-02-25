import {
    Alignment,
    Button,
    ButtonGroup,
    Colors,
    Divider,
    FormGroup,
    Icon,
    Switch,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import {
    DBChartTypes,
    fieldId,
    fieldId as getFieldId,
    getDimensions,
    getMetrics,
} from 'common';
import React, { FC, useState } from 'react';
import { useToggle } from 'react-use';
import styled from 'styled-components';
import { ChartConfig } from '../hooks/useChartConfig';
import FieldAutoComplete from './common/Filters/FieldAutoComplete';
import { useVisualizationContext } from './LightdashVisualization/VisualizationProvider';

type ContentProps = {
    chartConfig: ChartConfig;
};

export const ChartConfigOptions: React.FC<ContentProps> = ({ chartConfig }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            width: '300px',
        }}
    >
        <span style={{ color: Colors.GREEN1 }}>
            <Icon
                icon="function"
                color={Colors.GREEN1}
                style={{ marginRight: 5 }}
            />
            <b>Table Calculations</b>
        </span>
        <Divider />
        {chartConfig.tableCalculationOptions.map(({ name, displayName }) => (
            <div key={name} style={{ width: '100%' }}>
                <Switch
                    checked={
                        chartConfig.seriesLayout.yMetrics?.find(
                            (m) => m === name,
                        ) !== undefined
                    }
                    label={displayName}
                    alignIndicator={Alignment.RIGHT}
                    onChange={() => chartConfig.toggleYMetric(name)}
                    disabled={
                        chartConfig.tableCalculationOptions.length <= 1 &&
                        chartConfig.metricOptions.length <= 0
                    }
                />
            </div>
        ))}
        <span style={{ color: Colors.ORANGE1 }}>
            <Icon
                icon="numerical"
                color={Colors.ORANGE1}
                style={{ marginRight: 5 }}
            />

            <b>Metrics</b>
        </span>
        <Divider />
        {chartConfig.metricOptions.map((metric) => {
            const metricId = getFieldId(metric);
            return (
                <div key={metricId} style={{ width: '100%' }}>
                    <Switch
                        checked={
                            chartConfig.seriesLayout.yMetrics?.find(
                                (m) => m === metricId,
                            ) !== undefined
                        }
                        label={`${metric.tableLabel} ${metric.label}`}
                        alignIndicator={Alignment.RIGHT}
                        onChange={() => chartConfig.toggleYMetric(metricId)}
                        disabled={
                            chartConfig.metricOptions.length <= 1 &&
                            chartConfig.tableCalculationOptions.length <= 0
                        }
                    />
                </div>
            );
        })}
        <span style={{ color: Colors.BLUE1 }}>
            <Icon icon="tag" color={Colors.BLUE1} style={{ marginRight: 5 }} />
            <b>Dimensions</b>
        </span>
        <Divider />
        {chartConfig.dimensionOptions.map((dimension) => {
            const dimensionId = getFieldId(dimension);
            return (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                    }}
                >
                    <span>{`${dimension.tableLabel} ${dimension.label}`}</span>
                    <ButtonGroup minimal>
                        <Button
                            outlined
                            active={
                                dimensionId ===
                                chartConfig.seriesLayout.xDimension
                            }
                            onClick={() =>
                                chartConfig.setXDimension(dimensionId)
                            }
                            disabled={chartConfig.dimensionOptions.length <= 1}
                        >
                            X-axis
                        </Button>
                        <Button
                            outlined
                            active={
                                dimensionId ===
                                chartConfig.seriesLayout.groupDimension
                            }
                            onClick={() =>
                                chartConfig.setGroupDimension(
                                    dimensionId ===
                                        chartConfig.seriesLayout.groupDimension
                                        ? undefined
                                        : dimensionId,
                                )
                            }
                            disabled={chartConfig.dimensionOptions.length <= 1}
                        >
                            Group
                        </Button>
                    </ButtonGroup>
                </div>
            );
        })}
    </div>
);

const InputWrapper = styled(FormGroup)`
    & label.bp3-label {
        font-weight: 500;
        display: inline-flex;
        gap: 3px;
    }
`;

const FieldRow = styled(`div`)`
    display: flex;
`;

const ChartConfigOptions2: FC = () => {
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

    const metrics = explore
        ? getMetrics(explore).filter((field) =>
              resultsData?.metricQuery.metrics.includes(fieldId(field)),
          )
        : [];

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
        <Tabs onChange={setTab} selectedTabId={tab}>
            <Tab
                id="x-axis"
                title="X-axis"
                panel={
                    <InputWrapper label="Field">
                        <FieldAutoComplete
                            activeField={activeDimension}
                            fields={dimensionsInMetricQuery}
                            onChange={(field) =>
                                chartConfig?.setXDimension(fieldId(field))
                            }
                        />
                    </InputWrapper>
                }
            />
            <Tab
                id="y-axis"
                title="Y-axis"
                panel={
                    <InputWrapper label="Field(s)">
                        {chartConfig?.seriesLayout.yMetrics?.map((yFieldId) => {
                            const activeMetric = metrics.find(
                                (field) => fieldId(field) === yFieldId,
                            );
                            if (!activeMetric) {
                                return null;
                            }
                            return (
                                <FieldRow>
                                    <FieldAutoComplete
                                        disabled
                                        activeField={activeMetric}
                                        fields={metrics}
                                        onChange={() => undefined}
                                    />
                                    <Button
                                        icon={'cross'}
                                        onClick={() => {
                                            chartConfig?.toggleYMetric(
                                                yFieldId,
                                            );
                                        }}
                                    />
                                </FieldRow>
                            );
                        })}
                        {isOpen && (
                            <FieldAutoComplete
                                fields={metrics}
                                onChange={(field) => {
                                    chartConfig?.toggleYMetric(fieldId(field));
                                    toggle(false);
                                }}
                            />
                        )}
                        {!isOpen && (
                            <Button
                                icon={'plus'}
                                text="Add"
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
                                activeField={activeGroupDimension}
                                fields={groupDimensionsInMetricQuery}
                                onChange={(field) =>
                                    chartConfig?.setGroupDimension(
                                        fieldId(field),
                                    )
                                }
                            />
                            {activeGroupDimension && (
                                <Button
                                    icon={'cross'}
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
    );
};

export const ChartConfigPanel: React.FC = () => {
    const { chartType, chartConfig } = useVisualizationContext();
    const disabled =
        !chartConfig?.plotData ||
        chartType === DBChartTypes.BIG_NUMBER ||
        chartType === DBChartTypes.TABLE;

    const [isOpen, setIsOpen] = useState(false);
    return (
        <Popover2
            content={chartConfig && <ChartConfigOptions2 />}
            interactionKind="click"
            popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
            isOpen={isOpen}
            onInteraction={setIsOpen}
            position="bottom"
            lazy={false}
            disabled={disabled}
        >
            <Button
                minimal
                rightIcon="caret-down"
                text="Configure"
                disabled={disabled}
            />
        </Popover2>
    );
};
