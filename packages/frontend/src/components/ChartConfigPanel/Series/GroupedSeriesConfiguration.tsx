import { Colors, HTMLSelect } from '@blueprintjs/core';
import {
    Field,
    getItemId,
    getItemLabel,
    getSeriesId,
    isDimension,
    isField,
    Series,
    TableCalculation,
} from 'common';
import React, { FC, useMemo } from 'react';
import { getDimensionFormatter } from '../../../utils/resultFormatter';
import {
    GroupSeriesBlock,
    GroupSeriesInputs,
    GroupSeriesWrapper,
    SeriesBlock,
    SeriesExtraInputWrapper,
    SeriesTitle,
} from './Series.styles';
import SingleSeriesConfiguration from './SingleSeriesConfiguration';

const VALUE_LABELS_OPTIONS = [
    { value: 'hidden', label: 'Hidden' },
    { value: 'top', label: 'Top' },
    { value: 'bottom', label: 'Bottom' },
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
];

const AXIS_OPTIONS = [
    { value: 0, label: 'Left' },
    { value: 1, label: 'Right' },
];

const getFormatterValue = (
    value: any,
    key: string,
    items: Array<Field | TableCalculation>,
) => {
    const item = items.find((i) => getItemId(i) === key);
    const fieldFormatter =
        item && isField(item) && isDimension(item)
            ? getDimensionFormatter(item)
            : null;
    return fieldFormatter?.({ value: value }) ?? `${value}`;
};

type GroupedSeriesConfigurationProps = {
    series?: Series[];
    items: Array<Field | TableCalculation>;
    getSeriesColor: (key: string) => string | undefined;
    updateAllGroupedSeries: (fieldKey: string, series: Partial<Series>) => void;
    updateSingleSeries: (series: Series) => void;
};

const GroupedSeriesConfiguration: FC<GroupedSeriesConfigurationProps> = ({
    series,
    items,
    getSeriesColor,
    updateSingleSeries,
    updateAllGroupedSeries,
}) => {
    const groupedSeries = useMemo(
        () =>
            (series || []).reduce<Record<string, Series[]>>(
                (hash, obj) => ({
                    ...hash,
                    [obj.encode.yRef.field]: (
                        hash[obj.encode.yRef.field] || []
                    ).concat(obj),
                }),
                {},
            ) || {},
        [series],
    );
    return (
        <>
            {Object.entries(groupedSeries).map(([fieldKey, seriesGroup]) => {
                const field = items.find(
                    (item) => getItemId(item) === fieldKey,
                );
                if (!field) {
                    return (
                        <SeriesBlock>
                            <span
                                style={{
                                    width: '100%',
                                    color: Colors.GRAY1,
                                }}
                            >
                                Tried to reference field with unknown id:{' '}
                                {fieldKey}
                            </span>
                        </SeriesBlock>
                    );
                }
                const isLabelTheSameForAllSeries: boolean =
                    new Set(seriesGroup.map(({ label }) => label?.position))
                        .size === 1;

                const isAxisTheSameForAllSeries: boolean =
                    new Set(seriesGroup.map(({ yAxisIndex }) => yAxisIndex))
                        .size === 1;

                return (
                    <GroupSeriesBlock key={fieldKey}>
                        <SeriesTitle>
                            {getItemLabel(field)} (grouped)
                        </SeriesTitle>
                        <GroupSeriesInputs>
                            <SeriesExtraInputWrapper label="Axis">
                                <HTMLSelect
                                    fill
                                    value={
                                        isAxisTheSameForAllSeries
                                            ? seriesGroup[0].yAxisIndex
                                            : 'mixed'
                                    }
                                    options={
                                        isAxisTheSameForAllSeries
                                            ? AXIS_OPTIONS
                                            : [
                                                  ...AXIS_OPTIONS,
                                                  {
                                                      value: 'mixed',
                                                      label: 'Mixed',
                                                  },
                                              ]
                                    }
                                    onChange={(e) => {
                                        updateAllGroupedSeries(fieldKey, {
                                            yAxisIndex: parseInt(
                                                e.target.value,
                                                10,
                                            ),
                                        });
                                    }}
                                />
                            </SeriesExtraInputWrapper>
                            <SeriesExtraInputWrapper label="Value labels">
                                <HTMLSelect
                                    fill
                                    value={
                                        isLabelTheSameForAllSeries
                                            ? seriesGroup[0].label?.position ||
                                              'hidden'
                                            : 'mixed'
                                    }
                                    options={
                                        isLabelTheSameForAllSeries
                                            ? VALUE_LABELS_OPTIONS
                                            : [
                                                  ...VALUE_LABELS_OPTIONS,
                                                  {
                                                      value: 'mixed',
                                                      label: 'Mixed',
                                                  },
                                              ]
                                    }
                                    onChange={(e) => {
                                        const option = e.target.value;
                                        updateAllGroupedSeries(fieldKey, {
                                            label:
                                                option === 'hidden'
                                                    ? { show: false }
                                                    : {
                                                          show: true,
                                                          position:
                                                              option as any,
                                                      },
                                        });
                                    }}
                                />
                            </SeriesExtraInputWrapper>
                        </GroupSeriesInputs>
                        <GroupSeriesWrapper>
                            {seriesGroup?.map((singleSeries) => {
                                const formattedValue = getFormatterValue(
                                    singleSeries.encode.yRef.pivotValues![0]
                                        .value,
                                    singleSeries.encode.yRef.pivotValues![0]
                                        .field,
                                    items,
                                );
                                return (
                                    <SingleSeriesConfiguration
                                        key={getSeriesId(singleSeries)}
                                        isCollapsable
                                        series={singleSeries}
                                        placeholderName={`[${formattedValue}] ${getItemLabel(
                                            field,
                                        )}`}
                                        fallbackColor={getSeriesColor(
                                            getSeriesId(singleSeries),
                                        )}
                                        onColorChange={(color) => {
                                            updateSingleSeries({
                                                ...singleSeries,
                                                color,
                                            });
                                        }}
                                        onNameChange={(name) =>
                                            updateSingleSeries({
                                                ...singleSeries,
                                                name,
                                            })
                                        }
                                        onLabelChange={(label) => {
                                            updateSingleSeries({
                                                ...singleSeries,
                                                label,
                                            });
                                        }}
                                        onYAxisChange={(yAxisIndex) => {
                                            updateSingleSeries({
                                                ...singleSeries,
                                                yAxisIndex,
                                            });
                                        }}
                                    />
                                );
                            })}
                        </GroupSeriesWrapper>
                    </GroupSeriesBlock>
                );
            })}
        </>
    );
};

export default GroupedSeriesConfiguration;
