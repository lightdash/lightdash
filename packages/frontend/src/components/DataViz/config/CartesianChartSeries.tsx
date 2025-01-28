import {
    ECHARTS_DEFAULT_COLORS,
    friendlyName,
    type AxisSide,
    type CartesianChartDisplay,
    type ChartKind,
    type PivotChartLayout,
    type ValueLabelPositionOptions,
} from '@lightdash/common';
import { Accordion, SegmentedControl, Stack, Text } from '@mantine/core';
import { useMemo } from 'react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector,
} from '../../../features/sqlRunner/store/hooks';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { Config } from '../../VisualizationConfigs/common/Config';
import { type BarChartActionsType } from '../store/barChartSlice';
import { type LineChartActionsType } from '../store/lineChartSlice';
import { selectCurrentCartesianChartState } from '../store/selectors';
import { SingleSeriesConfiguration } from './SingleSeriesConfiguration';

type ConfigurableSeries = {
    reference: PivotChartLayout['y'][number]['reference'];
} & Pick<
    NonNullable<CartesianChartDisplay['series']>[number],
    'format' | 'label' | 'color' | 'type' | 'valueLabelPosition' | 'whichYAxis'
>;

export const CartesianChartSeries = ({
    selectedChartType,
    actions,
}: {
    selectedChartType: ChartKind;
    actions: BarChartActionsType | LineChartActionsType;
}) => {
    const { data: org } = useOrganization();
    const colors = org?.chartColors ?? ECHARTS_DEFAULT_COLORS;
    const dispatch = useVizDispatch();

    const currentConfig = useAppSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    );

    const series = useAppSelector((state) =>
        selectCurrentCartesianChartState(state, selectedChartType),
    )?.series;

    const groupedSeries: Record<string, ConfigurableSeries[]> = useMemo(() => {
        if (!series) {
            return {};
        }

        return series.reduce<Record<string, ConfigurableSeries[]>>(
            (acc, s, index) => {
                const foundSeries =
                    currentConfig?.display?.series?.[s.pivotColumnName];

                const seriesFormat = foundSeries?.format;
                const seriesLabel = foundSeries?.label;
                const seriesColor = foundSeries?.color;
                const seriesType = foundSeries?.type;
                const seriesValueLabelPosition =
                    foundSeries?.valueLabelPosition;
                const seriesWhichYAxis = foundSeries?.whichYAxis;

                const config = {
                    reference: s.pivotColumnName,
                    format: seriesFormat,
                    label: seriesLabel ?? friendlyName(s.pivotColumnName),
                    color: seriesColor ?? colors[index],
                    type: seriesType,
                    valueLabelPosition: seriesValueLabelPosition,
                    whichYAxis: seriesWhichYAxis,
                };

                // Grouped by referenceField
                return {
                    ...acc,
                    [s.referenceField]: [
                        ...(acc[s.referenceField] || []),
                        config,
                    ],
                };
            },
            {},
        );
    }, [colors, currentConfig?.display?.series, series]);

    const isGrouped = useMemo(() => {
        return (
            currentConfig?.fieldConfig?.groupBy !== undefined &&
            currentConfig?.fieldConfig?.groupBy.length > 0
        );
    }, [currentConfig?.fieldConfig?.groupBy]);

    const onColorChange = (reference: string, color: string) => {
        dispatch(
            actions.setSeriesColor({
                reference: reference,
                color,
            }),
        );
    };

    const handleLabelChange = (reference: string, label: string) => {
        dispatch(
            actions.setSeriesLabel({
                label,
                reference,
            }),
        );
    };

    const handleTypeChange = (
        reference: string,
        type: NonNullable<CartesianChartDisplay['series']>[number]['type'],
    ) => {
        dispatch(
            actions.setSeriesChartType({
                type,
                reference,
            }),
        );
    };

    const handleAxisChange = (reference: string, value: AxisSide) => {
        dispatch(
            actions.setSeriesYAxis({
                whichYAxis: value,
                reference,
            }),
        );
    };

    const handleValueLabelPositionChange = (
        reference: string,
        position: ValueLabelPositionOptions,
    ) => {
        dispatch(
            actions.setSeriesValueLabelPosition({
                valueLabelPosition: position,
                reference,
            }),
        );
    };

    return (
        <Stack mt="sm" spacing="xs">
            {Object.keys(groupedSeries).length === 0 && (
                <Text>No series found. Add a metric to create a series.</Text>
            )}
            {Object.keys(groupedSeries).length > 0 && (
                <>
                    <Config>
                        <Config.Group>
                            <Config.Label>{`Stacking`}</Config.Label>
                            <SegmentedControl
                                radius="md"
                                // TODO: disabled for grouped series. Re-enable when
                                // stacking series is enabled.
                                disabled={
                                    Object.keys(groupedSeries).length === 1 ||
                                    isGrouped
                                }
                                data={[
                                    {
                                        value: 'None',
                                        label: 'None',
                                    },
                                    {
                                        value: 'Stacked',
                                        label: 'Stacked',
                                    },
                                ]}
                                value={
                                    currentConfig?.display?.stack
                                        ? 'Stacked'
                                        : 'None'
                                }
                                onChange={(value) =>
                                    dispatch(
                                        actions.setStacked(value === 'Stacked'),
                                    )
                                }
                            />
                        </Config.Group>
                    </Config>
                </>
            )}
            {isGrouped
                ? Object.entries(groupedSeries).map(
                      ([referenceField, seriesArray]) => (
                          <Accordion
                              key={referenceField}
                              variant="contained"
                              sx={(theme) => ({
                                  root: {
                                      border: `1px solid ${theme.colors.gray[2]}`,
                                  },
                              })}
                          >
                              <Accordion.Item value={referenceField} m={0}>
                                  <Accordion.Control
                                      sx={{
                                          backgroundColor: 'white',
                                      }}
                                  >
                                      <Config.Subheading>
                                          {friendlyName(referenceField)}
                                      </Config.Subheading>
                                  </Accordion.Control>
                                  <Accordion.Panel
                                      sx={(theme) => ({
                                          backgroundColor: 'white',
                                          borderRadius: theme.radius.sm,
                                      })}
                                  >
                                      {seriesArray.map((s, index) => (
                                          <SingleSeriesConfiguration
                                              key={`${s.reference}-${index}`}
                                              reference={s.reference}
                                              color={s.color ?? colors[index]}
                                              colors={colors}
                                              label={s.label}
                                              type={s.type}
                                              whichYAxis={s.whichYAxis}
                                              valueLabelPosition={
                                                  s.valueLabelPosition
                                              }
                                              selectedChartType={
                                                  selectedChartType
                                              }
                                              onColorChange={onColorChange}
                                              onLabelChange={handleLabelChange}
                                              onTypeChange={handleTypeChange}
                                              onAxisChange={handleAxisChange}
                                              onValueLabelPositionChange={
                                                  handleValueLabelPositionChange
                                              }
                                          />
                                      ))}
                                  </Accordion.Panel>
                              </Accordion.Item>
                          </Accordion>
                      ),
                  )
                : Object.values(groupedSeries)
                      .flat()
                      .map(
                          (
                              {
                                  reference,
                                  label,
                                  color,
                                  type,
                                  whichYAxis,
                                  valueLabelPosition,
                              },
                              index,
                          ) => (
                              <SingleSeriesConfiguration
                                  key={`${reference}-${index}`}
                                  reference={reference}
                                  color={color ?? colors[index]}
                                  colors={colors}
                                  label={label}
                                  type={type}
                                  whichYAxis={whichYAxis}
                                  valueLabelPosition={valueLabelPosition}
                                  selectedChartType={selectedChartType}
                                  onColorChange={onColorChange}
                                  onLabelChange={handleLabelChange}
                                  onTypeChange={handleTypeChange}
                                  onAxisChange={handleAxisChange}
                                  onValueLabelPositionChange={
                                      handleValueLabelPositionChange
                                  }
                              />
                          ),
                      )}
        </Stack>
    );
};
