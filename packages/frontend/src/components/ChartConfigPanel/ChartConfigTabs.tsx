import {
    Button,
    Collapse,
    Colors,
    HTMLSelect,
    InputGroup,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import {
    Field,
    fieldId,
    getDefaultSeriesColor,
    getDimensions,
    getItemId,
    getItemLabel,
    getMetrics,
    getSeriesId,
    isDimension,
    isField,
    Metric,
    Series,
    TableCalculation,
} from 'common';
import React, { FC, useCallback, useMemo, useState } from 'react';
import { useToggle } from 'react-use';
import { getDimensionFormatter } from '../../utils/resultFormatter';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    FieldsGrid,
    GridLabel,
    GroupSeriesBlock,
    InputWrapper,
    SeriesBlock,
    SeriesExtraInputs,
    SeriesExtraInputWrapper,
    SeriesMainInputs,
    SeriesTitle,
    SeriesWrapper,
    Wrapper,
} from './ChartConfigPanel.styles';
import FieldLayoutOptions from './FieldLayoutOptions';
import SeriesColorPicker from './SeriesColorPicker';

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

const ValueLabelsInput: FC<{
    label?: React.ReactNode;
    value?: Series['label'];
    onLabelChange: (label: Series['label']) => void;
}> = ({ label, value, onLabelChange }) => (
    <SeriesExtraInputWrapper label={label || 'Value labels'}>
        <HTMLSelect
            fill
            value={value?.position || 'hidden'}
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
);

type SeriesConfigurationProps = {
    isCollapsable?: boolean;
    placeholderName: string;
    series: Series;
    fallbackColor?: string;
    onColorChange: (color: string) => void;
    onNameChange: (name: string | undefined) => void;
    onLabelChange: (label: Series['label']) => void;
};

const SeriesConfiguration: FC<SeriesConfigurationProps> = ({
    isCollapsable,
    placeholderName,
    series,
    fallbackColor,
    onColorChange,
    onNameChange,
    onLabelChange,
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
                    <ValueLabelsInput
                        value={series.label}
                        onLabelChange={onLabelChange}
                    />
                </SeriesExtraInputs>
            </Collapse>
        </SeriesWrapper>
    );
};

type GroupedSeriesConfigurationProps = {
    groupedSeries: Record<string, Series[]>;
    items: Array<Field | TableCalculation>;
    getSeriesColor: (key: string) => string | undefined;
    updateAllGroupedSeries: (fieldKey: string, series: Partial<Series>) => void;
    updateSingleSeries: (series: Series) => void;
};

const GroupedSeriesConfiguration: FC<GroupedSeriesConfigurationProps> = ({
    groupedSeries,
    items,
    getSeriesColor,
    updateSingleSeries,
    updateAllGroupedSeries,
}) => {
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
                const isLabelTheSameForAllSeries =
                    new Set(seriesGroup.map(({ label }) => label?.position))
                        .size === 1;
                return (
                    <GroupSeriesBlock>
                        <SeriesTitle>{getItemLabel(field)}</SeriesTitle>
                        <SeriesExtraInputs>
                            <ValueLabelsInput
                                label={
                                    !isLabelTheSameForAllSeries ? (
                                        <span>
                                            Value labels{' '}
                                            <span
                                                style={{ color: Colors.RED1 }}
                                            >
                                                (!)
                                            </span>
                                        </span>
                                    ) : undefined
                                }
                                value={seriesGroup[0].label}
                                onLabelChange={(label) =>
                                    updateAllGroupedSeries(fieldKey, { label })
                                }
                            />
                        </SeriesExtraInputs>
                        {seriesGroup?.map((series) => {
                            const formattedValue = getFormatterValue(
                                series.encode.yRef.pivotValues![0].value,
                                series.encode.yRef.pivotValues![0].field,
                                items,
                            );
                            return (
                                <SeriesConfiguration
                                    isCollapsable
                                    series={series}
                                    placeholderName={`[${formattedValue}] ${getItemLabel(
                                        field,
                                    )}`}
                                    fallbackColor={getSeriesColor(
                                        getSeriesId(series),
                                    )}
                                    onColorChange={(color) => {
                                        updateSingleSeries({
                                            ...series,
                                            color,
                                        });
                                    }}
                                    onNameChange={(name) =>
                                        updateSingleSeries({
                                            ...series,
                                            name,
                                        })
                                    }
                                    onLabelChange={(label) => {
                                        updateSingleSeries({
                                            ...series,
                                            label,
                                        });
                                    }}
                                />
                            );
                        })}
                    </GroupSeriesBlock>
                );
            })}
        </>
    );
};

type BasicSeriesConfigurationProps = {
    series?: Series[];
    items: Array<Field | TableCalculation>;
    getSeriesColor: (key: string) => string | undefined;
    updateSingleSeries: (series: Series) => void;
};

const BasicSeriesConfiguration: FC<BasicSeriesConfigurationProps> = ({
    series: allSeries,
    items,
    getSeriesColor,
    updateSingleSeries,
}) => {
    return (
        <>
            {allSeries?.map((series) => {
                const field = items.find(
                    (item) => getItemId(item) === series.encode.yRef.field,
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
                                {series.encode.yRef.field}
                            </span>
                        </SeriesBlock>
                    );
                }
                return (
                    <SeriesBlock>
                        <SeriesTitle>{getItemLabel(field)}</SeriesTitle>
                        <SeriesConfiguration
                            series={series}
                            placeholderName={getItemLabel(field)}
                            fallbackColor={getSeriesColor(getSeriesId(series))}
                            onColorChange={(color) => {
                                updateSingleSeries({
                                    ...series,
                                    color,
                                });
                            }}
                            onNameChange={(name) =>
                                updateSingleSeries({
                                    ...series,
                                    name,
                                })
                            }
                            onLabelChange={(label) => {
                                updateSingleSeries({
                                    ...series,
                                    label,
                                });
                            }}
                        />
                    </SeriesBlock>
                );
            })}
        </>
    );
};

const ChartConfigTabs: FC = () => {
    const {
        explore,
        resultsData,
        cartesianConfig: {
            dirtyLayout,
            dirtyEchartsConfig,
            setXField,
            addSingleSeries,
            removeSingleSeries,
            updateSingleSeries,
            updateAllGroupedSeries,
            setXAxisName,
            setYAxisName,
        },
        pivotDimensions,
        setPivotDimensions,
    } = useVisualizationContext();
    const yFieldsKeys = dirtyLayout?.yField || [];
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
        (item) => getItemId(item) === dirtyLayout?.xField,
    );

    const firstYAxisField = items.find(
        (item) => getItemId(item) === dirtyLayout?.yField?.[0],
    );

    const fallbackSeriesColours = useMemo(() => {
        return (dirtyEchartsConfig?.series || [])
            .filter(({ color }) => !color)
            .reduce<Record<string, string>>(
                (sum, series, index) => ({
                    ...sum,
                    [getSeriesId(series)]: getDefaultSeriesColor(index),
                }),
                {},
            );
    }, [dirtyEchartsConfig]);

    const getSeriesColor = useCallback(
        (seriesId: string) => {
            return fallbackSeriesColours[seriesId];
        },
        [fallbackSeriesColours],
    );

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
                                        onXClick={(isActive) =>
                                            setXField(
                                                isActive ? itemId : undefined,
                                            )
                                        }
                                        onYClick={(isActive) => {
                                            if (isActive) {
                                                addSingleSeries(itemId);
                                            } else {
                                                const index =
                                                    yFieldsKeys.findIndex(
                                                        (yField) =>
                                                            yField === itemId,
                                                    );
                                                if (index !== undefined) {
                                                    removeSingleSeries(index);
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
                                    defaultValue={
                                        dirtyEchartsConfig?.xAxis?.[0].name
                                    }
                                    onBlur={(e) =>
                                        setXAxisName(e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                            <InputWrapper label="Y-axis label">
                                <InputGroup
                                    placeholder={
                                        dirtyEchartsConfig?.series?.[0]?.name ||
                                        (firstYAxisField
                                            ? getItemLabel(firstYAxisField)
                                            : 'Enter Y-axis label')
                                    }
                                    defaultValue={
                                        dirtyEchartsConfig?.yAxis?.[0].name
                                    }
                                    onBlur={(e) =>
                                        setYAxisName(e.currentTarget.value)
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
                        pivotDimension ? (
                            <GroupedSeriesConfiguration
                                items={items}
                                groupedSeries={
                                    dirtyEchartsConfig?.series?.reduce<
                                        Record<string, Series[]>
                                    >(
                                        (hash, obj) => ({
                                            ...hash,
                                            [obj.encode.yRef.field]: (
                                                hash[obj.encode.yRef.field] ||
                                                []
                                            ).concat(obj),
                                        }),
                                        {},
                                    ) || {}
                                }
                                getSeriesColor={getSeriesColor}
                                updateSingleSeries={updateSingleSeries}
                                updateAllGroupedSeries={updateAllGroupedSeries}
                            />
                        ) : (
                            <BasicSeriesConfiguration
                                items={items}
                                series={dirtyEchartsConfig?.series}
                                getSeriesColor={getSeriesColor}
                                updateSingleSeries={updateSingleSeries}
                            />
                        )
                    }
                />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
