import { Button, Collapse, HTMLSelect, InputGroup } from '@blueprintjs/core';
import { CartesianChartLayout, Series } from 'common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import {
    SeriesExtraInputs,
    SeriesExtraInputWrapper,
    SeriesMainInputs,
    SeriesWrapper,
} from './Series.styles';
import SeriesColorPicker from './SeriesColorPicker';

type Props = {
    isCollapsable?: boolean;
    placeholderName: string;
    layout?: CartesianChartLayout;
    series: Series;
    fallbackColor?: string;
    onColorChange: (color: string) => void;
    onNameChange: (name: string | undefined) => void;
    onLabelChange: (label: Series['label']) => void;
    onYAxisChange: (yAxisIndex: number) => void;
};

const SingleSeriesConfiguration: FC<Props> = ({
    layout,
    isCollapsable,
    placeholderName,
    series,
    fallbackColor,
    onColorChange,
    onNameChange,
    onLabelChange,
    onYAxisChange,
}) => {
    const [isOpen, toggleIsOpen] = useToggle(false);
    return (
        <SeriesWrapper>
            <SeriesMainInputs>
                <SeriesColorPicker
                    color={series.color || fallbackColor}
                    onChange={onColorChange}
                />
                <InputGroup
                    fill
                    placeholder={placeholderName}
                    defaultValue={series.name}
                    onBlur={(e) => onNameChange(e.currentTarget.value)}
                />
                {isCollapsable && (
                    <Button
                        icon={isOpen ? 'caret-up' : 'caret-down'}
                        onClick={toggleIsOpen}
                    />
                )}
            </SeriesMainInputs>
            <Collapse isOpen={!isCollapsable || isOpen}>
                <SeriesExtraInputs>
                    <SeriesExtraInputWrapper label="Axis">
                        <HTMLSelect
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
                                onYAxisChange(parseInt(e.target.value, 10));
                            }}
                        />
                    </SeriesExtraInputWrapper>
                    <SeriesExtraInputWrapper label="Value labels">
                        <HTMLSelect
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
                                onLabelChange(
                                    option === 'hidden'
                                        ? { show: false }
                                        : {
                                              show: true,
                                              position: option as any,
                                          },
                                );
                            }}
                        />
                    </SeriesExtraInputWrapper>
                </SeriesExtraInputs>
            </Collapse>
        </SeriesWrapper>
    );
};

export default SingleSeriesConfiguration;
