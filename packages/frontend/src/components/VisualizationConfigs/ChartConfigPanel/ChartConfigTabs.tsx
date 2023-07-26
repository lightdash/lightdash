import { Tab, Tabs } from '@blueprintjs/core';
import {
    convertAdditionalMetric,
    fieldId,
    getDimensions,
    getMetrics,
    isField,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { FC, useState } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import AxesOptions from './AxesOptions';
import FieldLayoutOptions from './FieldLayoutOptions';
import GridPanel from './Grid';
import LegendPanel from './Legend';
import SeriesTab from './Series';

const ChartConfigTabs: FC = () => {
    const { explore, resultsData } = useVisualizationContext();
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

    return (
        <Box w={320}>
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
                    panel={<AxesOptions items={items} />}
                />
                <Tab
                    id="legend"
                    title="Display"
                    panel={<LegendPanel items={items} />}
                />
                <Tab id="grid" title="Margins" panel={<GridPanel />} />
            </Tabs>
        </Box>
    );
};

export default ChartConfigTabs;
