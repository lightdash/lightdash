import { Button, InputGroup, Switch } from '@blueprintjs/core';
import {
    CartesianChartLayout,
    CartesianSeriesType,
    Series,
} from '@lightdash/common';
import React, { FC } from 'react';
import {
    SeriesExtraInputs,
    SeriesExtraInputWrapper,
    SeriesExtraSelect,
    SeriesMainInputs,
    SeriesOptionsWrapper,
    SeriesWrapper,
} from './Series.styles';
import SeriesColorPicker from './SeriesColorPicker';

type Props = {
    isCollapsable?: boolean;
    seriesLabel: string;
    layout?: CartesianChartLayout;
    series: Series;
    isSingle?: boolean;
    fallbackColor?: string;
    isGrouped?: boolean;
    updateSingleSeries: (updatedSeries: Series) => void;
    isOpen?: boolean;
    toggleIsOpen?: () => void;
};

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    seriesLabel,
    series,
    fallbackColor,
    updateSingleSeries,
    isGrouped,
    isSingle,
    isOpen,
    toggleIsOpen,
}) => {
    const type =
        series.type === CartesianSeriesType.LINE && !!series.areaStyle
            ? CartesianSeriesType.AREA
            : series.type;
    return (
        <SeriesWrapper $isSingle={isSingle}>
            <SeriesMainInputs $isGrouped={isGrouped}>
                <SeriesColorPicker
                    color={series.color || fallbackColor}
                    onChange={(color) => {
                        updateSingleSeries({
                            ...series,
                            color,
                        });
                    }}
                />
                {!isSingle && (
                    <InputGroup
                        fill
                        disabled={series.hidden}
                        defaultValue={series.name || seriesLabel}
                        onBlur={(e) => {
                            updateSingleSeries({
                                ...series,
                                name: e.currentTarget.value,
                            });
                        }}
                    />
                )}
                {isGrouped && (
                    <Button
                        icon={series.hidden ? 'eye-open' : 'eye-off'}
                        onClick={() => {
                            updateSingleSeries({
                                ...series,
                                hidden: !series.hidden,
                            });
                        }}
                    />
                )}
                {isCollapsable && (
                    <Button
                        disabled={series.hidden}
                        icon={isOpen ? 'caret-up' : 'caret-down'}
                        onClick={toggleIsOpen}
                    />
                )}
            </SeriesMainInputs>
            <SeriesOptionsWrapper
                isOpen={!isCollapsable || isOpen}
                $isGrouped={isGrouped}
                $isSingle={isSingle}
            >
                <SeriesExtraInputs>
                    <SeriesExtraInputWrapper label={!isGrouped && 'Chart type'}>
                        <SeriesExtraSelect
                            fill
                            value={type}
                            options={[
                                {
                                    value: CartesianSeriesType.BAR,
                                    label: 'Bar',
                                },
                                {
                                    value: CartesianSeriesType.LINE,
                                    label: 'Line',
                                },
                                {
                                    value: CartesianSeriesType.AREA,
                                    label: 'Area',
                                },
                                {
                                    value: CartesianSeriesType.SCATTER,
                                    label: 'Scatter',
                                },
                            ]}
                            onChange={(e) => {
                                const value = e.target.value;
                                const newType =
                                    value === CartesianSeriesType.AREA
                                        ? CartesianSeriesType.LINE
                                        : value;
                                updateSingleSeries({
                                    ...series,
                                    type: newType as CartesianSeriesType,
                                    areaStyle:
                                        value === CartesianSeriesType.AREA
                                            ? {}
                                            : undefined,
                                });
                            }}
                        />
                    </SeriesExtraInputWrapper>
                    <SeriesExtraInputWrapper label={!isGrouped && 'Axis'}>
                        <SeriesExtraSelect
                            fill
                            value={series.yAxisIndex}
                            options={[
                                {
                                    value: 0,
                                    label: layout?.flipAxes ? 'Bottom' : 'Left',
                                },
                                {
                                    value: 1,
                                    label: layout?.flipAxes ? 'Top' : 'Right',
                                },
                            ]}
                            onChange={(e) => {
                                updateSingleSeries({
                                    ...series,
                                    yAxisIndex: parseInt(e.target.value, 10),
                                });
                            }}
                        />
                    </SeriesExtraInputWrapper>
                    <SeriesExtraInputWrapper
                        label={!isGrouped && 'Value labels'}
                    >
                        <SeriesExtraSelect
                            fill
                            value={series.label?.position || 'hidden'}
                            options={[
                                { value: 'hidden', label: 'Hidden' },
                                { value: 'top', label: 'Top' },
                                { value: 'bottom', label: 'Bottom' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                            ]}
                            onChange={(e) => {
                                const option = e.target.value;
                                updateSingleSeries({
                                    ...series,
                                    label:
                                        option === 'hidden'
                                            ? { show: false }
                                            : {
                                                  show: true,
                                                  position: option as any,
                                              },
                                });
                            }}
                        />
                    </SeriesExtraInputWrapper>
                </SeriesExtraInputs>
                {(type === CartesianSeriesType.LINE ||
                    type === CartesianSeriesType.AREA) && (
                    <SeriesExtraInputs>
                        <Switch
                            alignIndicator={'right'}
                            checked={series.showSymbol ?? true}
                            label={'Show symbol'}
                            onChange={() => {
                                updateSingleSeries({
                                    ...series,
                                    showSymbol: !(series.showSymbol ?? true),
                                });
                            }}
                        />
                        <Switch
                            alignIndicator={'right'}
                            checked={series.smooth}
                            label={'Smooth'}
                            onChange={() => {
                                updateSingleSeries({
                                    ...series,
                                    smooth: !series.smooth,
                                });
                            }}
                        />
                    </SeriesExtraInputs>
                )}
            </SeriesOptionsWrapper>
        </SeriesWrapper>
    );
};

SingleSeriesConfiguration.defaultProps = {
    isGrouped: false,
};

export default SingleSeriesConfiguration;
