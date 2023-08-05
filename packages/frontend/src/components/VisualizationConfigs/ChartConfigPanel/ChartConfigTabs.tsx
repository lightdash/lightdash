import {
    convertAdditionalMetric,
    fieldId,
    getDimensions,
    getMetrics,
    isField,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { Tabs } from '@mantine/core';
import { FC } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import AxesOptions from './AxesOptions';
import FieldLayoutOptions from './FieldLayoutOptions';
import GridPanel from './Grid';
import LegendPanel from './Legend';
import SeriesTab from './Series';

const ChartConfigTabs: FC = () => {
    const { explore, resultsData } = useVisualizationContext();

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

    return (
        <Tabs w={335} defaultValue="layout">
            <Tabs.List mb="sm">
                <Tabs.Tab px="sm" value="layout">
                    Layout
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="series">
                    Series
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="axes">
                    Axes
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="legend">
                    Display
                </Tabs.Tab>
                <Tabs.Tab px="sm" value="grid">
                    Margins
                </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="layout">
                <FieldLayoutOptions items={items} />
            </Tabs.Panel>
            <Tabs.Panel value="series">
                <SeriesTab items={items} />
            </Tabs.Panel>
            <Tabs.Panel value="axes">
                <AxesOptions items={items} />
            </Tabs.Panel>
            <Tabs.Panel value="legend">
                <LegendPanel items={items} />
            </Tabs.Panel>
            <Tabs.Panel value="grid">
                <GridPanel />
            </Tabs.Panel>
        </Tabs>
    );
};

export default ChartConfigTabs;
