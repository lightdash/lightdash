import {
    Checkbox,
    HTMLSelect,
    InputGroup,
    Label,
    Tab,
    Tabs,
} from '@blueprintjs/core';
import {
    convertAdditionalMetric,
    fieldId,
    getAxisName,
    getDimensions,
    getItemId,
    getItemLabel,
    getMetrics,
    isField,
    isNumericItem,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { FC, useCallback, useState } from 'react';
import { useToggle } from 'react-use';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import {
    AutoRangeSwitch,
    GridSettings,
    InputWrapper,
    MinMaxContainer,
    MinMaxInput,
    MinMaxWrapper,
    SectionTitle,
    Wrapper,
} from './ChartConfigPanel.styles';
import FieldLayoutOptions from './FieldLayoutOptions';
import GridPanel from './Grid';
import LegendPanel from './Legend';
import SeriesTab from './Series';

interface MinMaxProps {
    label: string;
    min: string | undefined;
    max: string | undefined;
    setMin: (value: string | undefined) => void;
    setMax: (value: string | undefined) => void;
}

const AxisMinMax: FC<MinMaxProps> = ({ label, min, max, setMin, setMax }) => {
    const [isAuto, toggleAuto] = useToggle(!(min || max));
    const { track } = useTracking();

    const clearRange = useCallback(() => {
        if (!isAuto) {
            setMin(undefined);
            setMax(undefined);
        }
        return;
    }, [isAuto, setMin, setMax]);

    return (
        <MinMaxContainer>
            <AutoRangeSwitch
                name="auto-range"
                checked={isAuto}
                label={label}
                onChange={() => {
                    toggleAuto((prev: boolean) => !prev);
                    clearRange();
                    track({
                        name: EventName.CUSTOM_AXIS_RANGE_TOGGLE_CLICKED,
                        properties: {
                            custom_axis_range: isAuto,
                        },
                    });
                }}
            />
            {!isAuto && (
                <MinMaxWrapper>
                    <MinMaxInput label="Min">
                        <InputGroup
                            placeholder="Min"
                            defaultValue={min || undefined}
                            onBlur={(e) => setMin(e.currentTarget.value)}
                        />
                    </MinMaxInput>

                    <MinMaxInput label="Max">
                        <InputGroup
                            placeholder="Max"
                            defaultValue={max || undefined}
                            onBlur={(e) => setMax(e.currentTarget.value)}
                        />
                    </MinMaxInput>
                </MinMaxWrapper>
            )}
        </MinMaxContainer>
    );
};

const ChartConfigTabs: FC = () => {
    const {
        explore,
        resultsData,
        cartesianConfig: {
            dirtyLayout,
            dirtyEchartsConfig,
            setXAxisName,
            setYAxisName,
            setYMinValue,
            setYMaxValue,
            setShowGridX,
            setShowGridY,
            setInverseX,
        },
    } = useVisualizationContext();
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
                  ...(resultsData?.metricQuery.additionalMetrics || []).reduce<
                      Metric[]
                  >((acc, additionalMetric) => {
                      const table = explore.tables[additionalMetric.table];
                      if (table) {
                          const metric = convertAdditionalMetric({
                              additionalMetric,
                              table,
                          });
                          return [...acc, metric];
                      }
                      return acc;
                  }, []),
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

    const selectedAxisInSeries = Array.from(
        new Set(
            dirtyEchartsConfig?.series?.map(({ yAxisIndex }) => yAxisIndex),
        ),
    );
    const isAxisTheSameForAllSeries: boolean =
        selectedAxisInSeries.length === 1;
    const selectedAxisIndex = selectedAxisInSeries[0] || 0;

    const [showFirstAxisRange, showSecondAxisRange] = (
        dirtyEchartsConfig?.series || []
    ).reduce<[boolean, boolean]>(
        (acc, series) => {
            const seriesField = items.find(
                (item) => getItemId(item) === series.encode.yRef.field,
            );
            if (isNumericItem(seriesField)) {
                acc[series.yAxisIndex || 0] = true;
            }
            return acc;
        },
        [false, false],
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
                    panel={<FieldLayoutOptions items={items} />}
                />
                <Tab
                    id="series"
                    title="Series"
                    panel={<SeriesTab items={items} />}
                />
                <Tab
                    id="axes"
                    title="Axes"
                    panel={
                        <>
                            <InputWrapper
                                label={`${
                                    dirtyLayout?.flipAxes ? 'Y' : 'X'
                                }-axis label`}
                            >
                                <InputGroup
                                    placeholder="Enter axis label"
                                    defaultValue={
                                        dirtyEchartsConfig?.xAxis?.[0]?.name ||
                                        (xAxisField && getItemLabel(xAxisField))
                                    }
                                    onBlur={(e) =>
                                        setXAxisName(e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                            <GridSettings style={{ marginTop: 10 }}>
                                <Label style={{ marginTop: 5 }}>Sort</Label>
                                <HTMLSelect
                                    options={[
                                        {
                                            value: 'ascending',
                                            label: 'Ascending',
                                        },
                                        {
                                            value: 'descending',
                                            label: 'Descending',
                                        },
                                    ]}
                                    defaultValue={
                                        dirtyEchartsConfig?.xAxis?.[0]?.inverse
                                            ? 'descending'
                                            : 'ascending'
                                    }
                                    onChange={(e) => {
                                        setInverseX(
                                            e.target.value === 'descending',
                                        );
                                    }}
                                />
                            </GridSettings>

                            <InputWrapper
                                label={`${
                                    dirtyLayout?.flipAxes ? 'X' : 'Y'
                                }-axis label (${
                                    dirtyLayout?.flipAxes ? 'bottom' : 'left'
                                })`}
                            >
                                <InputGroup
                                    placeholder="Enter axis label"
                                    defaultValue={
                                        dirtyEchartsConfig?.yAxis?.[0]?.name ||
                                        getAxisName({
                                            isAxisTheSameForAllSeries,
                                            selectedAxisIndex,
                                            axisReference: 'yRef',
                                            axisIndex: 0,
                                            series: dirtyEchartsConfig?.series,
                                            items,
                                        })
                                    }
                                    onBlur={(e) =>
                                        setYAxisName(0, e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>
                            {showFirstAxisRange && (
                                <AxisMinMax
                                    label={`Auto ${
                                        dirtyLayout?.flipAxes ? 'x' : 'y'
                                    }-axis range (${
                                        dirtyLayout?.flipAxes
                                            ? 'bottom'
                                            : 'left'
                                    })`}
                                    min={dirtyEchartsConfig?.yAxis?.[0]?.min}
                                    max={dirtyEchartsConfig?.yAxis?.[0]?.max}
                                    setMin={(newValue) =>
                                        setYMinValue(0, newValue)
                                    }
                                    setMax={(newValue) =>
                                        setYMaxValue(0, newValue)
                                    }
                                />
                            )}

                            <InputWrapper
                                label={`${
                                    dirtyLayout?.flipAxes ? 'X' : 'Y'
                                }-axis label (${
                                    dirtyLayout?.flipAxes ? 'top' : 'right'
                                })`}
                            >
                                <InputGroup
                                    placeholder="Enter axis label"
                                    defaultValue={
                                        dirtyEchartsConfig?.yAxis?.[1]?.name ||
                                        getAxisName({
                                            isAxisTheSameForAllSeries,
                                            selectedAxisIndex,
                                            axisReference: 'yRef',
                                            axisIndex: 1,
                                            series: dirtyEchartsConfig?.series,
                                            items,
                                        })
                                    }
                                    onBlur={(e) =>
                                        setYAxisName(1, e.currentTarget.value)
                                    }
                                />
                            </InputWrapper>

                            {showSecondAxisRange && (
                                <AxisMinMax
                                    label={`Auto ${
                                        dirtyLayout?.flipAxes ? 'x' : 'y'
                                    }-axis range (${
                                        dirtyLayout?.flipAxes ? 'top' : 'right'
                                    })`}
                                    min={dirtyEchartsConfig?.yAxis?.[1]?.min}
                                    max={dirtyEchartsConfig?.yAxis?.[1]?.max}
                                    setMin={(newValue) =>
                                        setYMinValue(1, newValue)
                                    }
                                    setMax={(newValue) =>
                                        setYMaxValue(1, newValue)
                                    }
                                />
                            )}

                            <InputWrapper label="Show grid">
                                <Checkbox
                                    label={`${
                                        dirtyLayout?.flipAxes ? 'Y' : 'X'
                                    }-axis`}
                                    checked={!!dirtyLayout?.showGridX}
                                    onChange={(e) => {
                                        setShowGridX(!dirtyLayout?.showGridX);
                                    }}
                                />

                                <Checkbox
                                    label={`${
                                        dirtyLayout?.flipAxes ? 'X' : 'Y'
                                    }-axis`}
                                    checked={
                                        dirtyLayout?.showGridY !== undefined
                                            ? dirtyLayout?.showGridY
                                            : true
                                    }
                                    onChange={(e) => {
                                        setShowGridY(
                                            dirtyLayout?.showGridY !== undefined
                                                ? !dirtyLayout?.showGridY
                                                : false,
                                        );
                                    }}
                                />
                            </InputWrapper>
                        </>
                    }
                />
                <Tab
                    id="legend"
                    title="Legend"
                    panel={<LegendPanel items={items} />}
                />
                <Tab id="grid" title="Margins" panel={<GridPanel />} />
            </Tabs>
        </Wrapper>
    );
};

export default ChartConfigTabs;
