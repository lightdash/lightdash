import {
    ECHARTS_DEFAULT_COLORS,
    friendlyName,
    type CartesianChartDisplay,
    type ChartKind,
    type PivotChartLayout,
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
    seriesIndex: number;
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
                const foundSeries = Object.values(
                    currentConfig?.display?.series || {},
                ).find((displayProps) => displayProps.yAxisIndex === index);

                const seriesFormat = foundSeries?.format;
                const seriesLabel = foundSeries?.label;
                const seriesColor = foundSeries?.color;
                const seriesType = foundSeries?.type;
                const seriesValueLabelPosition =
                    foundSeries?.valueLabelPosition;
                const seriesWhichYAxis = foundSeries?.whichYAxis;

                const config = {
                    reference: s.id,
                    format: seriesFormat,
                    label: seriesLabel ?? friendlyName(s.id),
                    color: seriesColor ?? colors[index],
                    type: seriesType,
                    valueLabelPosition: seriesValueLabelPosition,
                    whichYAxis: seriesWhichYAxis,
                    // TODO: for now tracking the index in the series array.
                    // This makes it so we don't need to make a breaking change to
                    // the saved format, which applies styles by index, but is less
                    // readable and less performant than if we used the reference.
                    seriesIndex: index,
                };

                if (!acc[s.referenceField]) {
                    acc[s.referenceField] = [];
                }

                acc[s.referenceField].push(config);

                return acc;
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
                                defaultValue={
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
                          <Accordion key={referenceField} variant="contained">
                              <Accordion.Item value={referenceField} m={0}>
                                  <Accordion.Control>
                                      <Config.Subheading>
                                          {friendlyName(referenceField)}
                                      </Config.Subheading>
                                  </Accordion.Control>
                                  {seriesArray.map((s, index) => (
                                      <Accordion.Panel
                                          key={`${s.reference}-${index}`}
                                      >
                                          <SingleSeriesConfiguration
                                              key={`${s.reference}-${index}`}
                                              reference={s.reference}
                                              seriesIndex={s.seriesIndex}
                                              color={s.color}
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
                                              dispatch={dispatch}
                                              actions={actions}
                                          />
                                      </Accordion.Panel>
                                  ))}
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
                                  seriesIndex,
                              },
                              index,
                          ) => (
                              <SingleSeriesConfiguration
                                  key={`${reference}-${index}`}
                                  reference={reference}
                                  color={color}
                                  colors={colors}
                                  label={label}
                                  seriesIndex={seriesIndex}
                                  type={type}
                                  whichYAxis={whichYAxis}
                                  valueLabelPosition={valueLabelPosition}
                                  selectedChartType={selectedChartType}
                                  dispatch={dispatch}
                                  actions={actions}
                              />
                          ),
                      )}
        </Stack>
    );
};
