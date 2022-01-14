import {
    Alignment,
    Button,
    ButtonGroup,
    Colors,
    Divider,
    Icon,
    Switch,
} from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import { fieldId as getFieldId } from 'common';
import React, { useState } from 'react';
import { ChartConfig } from '../hooks/useChartConfig';

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

type ChartConfigPanelProps = {
    chartConfig: ChartConfig;
    disabled: boolean;
};
export const ChartConfigPanel: React.FC<ChartConfigPanelProps> = ({
    chartConfig,
    disabled,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <Popover2
            content={<ChartConfigOptions chartConfig={chartConfig} />}
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
                icon="settings"
                rightIcon="caret-down"
                text="Configure"
                disabled={disabled}
            />
        </Popover2>
    );
};
