import { Button } from '@blueprintjs/core';
import {
    CompiledDimension,
    DimensionType,
    fieldId as getFieldId,
} from '@lightdash/common';
import { FC, memo, useEffect } from 'react';
import { useExplore } from '../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorerContext,
} from '../../providers/ExplorerProvider';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import UnderlyingDataModal from '../UnderlyingData/UnderlyingDataModal';
import UnderlyingDataProvider from '../UnderlyingData/UnderlyingDataProvider';
import ExplorerHeader from './ExplorerHeader';
import FiltersCard from './FiltersCard/FiltersCard';
import ResultsCard from './ResultsCard/ResultsCard';
import SqlCard from './SqlCard/SqlCard';
import VisualizationCard from './VisualizationCard/VisualizationCard';

const Explorer: FC = memo(() => {
    const unsavedChartVersionTableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const unsavedChartVersionFilters = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.filters,
    );

    const toggleActiveField = useExplorerContext(
        (context) => context.actions.toggleActiveField,
    );
    const toggleExpandedSection = useExplorerContext(
        (context) => context.actions.toggleExpandedSection,
    );
    const queryResults = useExplorerContext(
        (context) => context.queryResults.data,
    );
    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );

    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const { data } = useExplore(tableId);

    console.log('data', data);

    const dimensions = data?.tables[tableId].dimensions || {};
    const metrics = data?.tables[tableId].metrics || {};

    const dimensionMap = Object.entries(dimensions);
    let xAxis = dimensionMap.find(
        (dimension) => dimension[1].type === DimensionType.DATE,
    );
    if (!xAxis)
        xAxis = dimensionMap.find(
            (dimension) => dimension[1].type === DimensionType.TIMESTAMP,
        );

    if (!xAxis)
        xAxis = dimensionMap.find(
            (dimension) => dimension[1].type === DimensionType.BOOLEAN,
        );
    if (!xAxis)
        xAxis = dimensionMap.find(
            (dimension) => dimension[1].type === DimensionType.STRING,
        );

    const metricsMap = Object.entries(metrics);

    console.log('metrics', metrics);
    let yAxis = metricsMap.find((metric) => metric[1].name.includes('total'));
    if (!yAxis)
        yAxis = metricsMap.find((metric) => metric[1].name.includes('count'));
    if (!yAxis) yAxis = metricsMap[0];
    console.log('y axis', yAxis);

    let group: [string, CompiledDimension] | undefined;
    if (xAxis?.[1].type === DimensionType.DATE) {
        group = dimensionMap.find(
            (dimension) => dimension[1].type === DimensionType.BOOLEAN,
        );
        if (!group)
            group = dimensionMap.find(
                (dimension) => dimension[1].type === DimensionType.STRING,
            );
    }
    // If no metrics:  dimensionMap.find(dimension => dimension[0].includes('id'))
    // TODO count unique ids
    // IF !yAxis sum numeric
    let message = (
        <p style={{ marginTop: 10 }}>
            It looks like you're trying to make a chart about{' '}
            <b>{data?.label}</b>. Why don't you try plotting{' '}
            <b>{xAxis?.[1].label}</b> by <b>{yAxis?.[1].label}</b>
            {group !== undefined ? (
                <>
                    {' '}
                    grouped by <b>{group[1].label}</b>
                </>
            ) : (
                ''
            )}
            ?
        </p>
    );

    console.log('isValidQuery ', isValidQuery);
    useEffect(() => {
        fetchResults();
    }, [isValidQuery]);

    return isValidQuery || (xAxis === undefined && yAxis === undefined) ? (
        <>
            <ExplorerHeader />
            <FiltersCard />
            <UnderlyingDataProvider
                filters={unsavedChartVersionFilters}
                tableName={unsavedChartVersionTableName}
            >
                <VisualizationCard />

                <UnderlyingDataModal />
            </UnderlyingDataProvider>
            <ResultsCard />
            <SqlCard />
        </>
    ) : (
        <div
            style={{
                border: '1px dashed blue',
                display: 'flex',
                height: 100,
                padding: 20,
            }}
        >
            <img
                style={{ marginRight: 10 }}
                alt="cloudy"
                src="https://user-images.githubusercontent.com/1983672/207565915-dfce1e0e-fc77-4343-8187-9373358865e5.png"
            />
            {message}
            <Button
                style={{
                    width: 150,
                    marginTop: 13,
                    height: 25,
                    marginLeft: 20,
                }}
                onClick={() => {
                    if (xAxis) toggleActiveField(getFieldId(xAxis?.[1]), true);
                    if (yAxis) toggleActiveField(getFieldId(yAxis?.[1]), false);
                    if (group !== undefined) {
                        //TODO set stacking
                        toggleActiveField(getFieldId(group?.[1]), true);
                    }

                    // Open chart

                    toggleExpandedSection(ExplorerSection.VISUALIZATION);
                }}
            >
                Show me
            </Button>
        </div>
    );
});

export default Explorer;
