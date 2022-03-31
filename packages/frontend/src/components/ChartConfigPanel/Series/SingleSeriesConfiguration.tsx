import { Button, InputGroup } from '@blueprintjs/core';
import { CartesianChartLayout, CartesianSeriesType, Series } from 'common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
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
    placeholderName: string;
    layout?: CartesianChartLayout;
    series: Series;
    fallbackColor?: string;
    isGrouped?: boolean;
    updateSingleSeries: (updatedSeries: Series) => void;
};

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    placeholderName,
    series,
    fallbackColor,
    updateSingleSeries,
    isGrouped,
}) => {
    const [isOpen, toggleIsOpen] = useToggle(false);
    return (
        <SeriesWrapper>
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
                <InputGroup
                    fill
                    placeholder={placeholderName}
                    defaultValue={series.name}
                    onBlur={(e) => {
                        updateSingleSeries({
                            ...series,
                            name: e.currentTarget.value,
                        });
                    }}
                />
                {isCollapsable && (
                    <Button
                        icon={isOpen ? 'caret-up' : 'caret-down'}
                        onClick={toggleIsOpen}
                    />
                )}
            </SeriesMainInputs>
            <SeriesOptionsWrapper isOpen={!isCollapsable || isOpen}>
                <SeriesExtraInputs>
                    <SeriesExtraInputWrapper label="Chart type">
                        <SeriesExtraSelect
                            fill
                            value={series.type}
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
                                    value: CartesianSeriesType.SCATTER,
                                    label: 'Scatter',
                                },
                            ]}
                            onChange={(e) => {
                                updateSingleSeries({
                                    ...series,
                                    type: e.target.value as CartesianSeriesType,
                                });
                            }}
                        />
                    </SeriesExtraInputWrapper>
                    <SeriesExtraInputWrapper label="Axis">
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
                    <SeriesExtraInputWrapper label="Value labels">
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
            </SeriesOptionsWrapper>
        </SeriesWrapper>
    );
};

SingleSeriesConfiguration.defaultProps = {
    isGrouped: false,
};

export default SingleSeriesConfiguration;
