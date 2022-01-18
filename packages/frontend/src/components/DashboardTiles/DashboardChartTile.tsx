import { MenuItem, NonIdealState } from '@blueprintjs/core';
import {
    DashboardChartTile as IDashboardChartTile,
    DBChartTypes,
    SavedQuery,
} from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useChartConfig } from '../../hooks/useChartConfig';
import { useSavedChartResults } from '../../hooks/useQueryResults';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import SimpleChart from '../SimpleChart';
import TileBase from './TileBase';

const ValidDashboardChartTile: FC<{ data: SavedQuery }> = ({ data }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const chartRef = useRef<EChartsReact>(null);
    const queryResults = useSavedChartResults(projectUuid, data);
    const chartConfig = useChartConfig(
        data.tableName,
        queryResults.data,
        data?.chartConfig.seriesLayout,
    );
    const [activeVizTab, setActiveVizTab] = useState<DBChartTypes>(
        DBChartTypes.COLUMN,
    );

    useEffect(() => {
        if (data?.chartConfig.chartType) {
            setActiveVizTab(data.chartConfig.chartType);
        }
    }, [data]);

    return (
        <SimpleChart
            isLoading={queryResults.isLoading}
            tableName={data.tableName}
            chartRef={chartRef}
            chartType={activeVizTab}
            chartConfig={chartConfig}
        />
    );
};

const InvalidDashboardChartTile: FC = () => (
    <NonIdealState
        title="No chart available"
        description="Chart might have been deleted or you don't have permissions to see it."
        icon="search"
    />
);

type Props = Pick<
    React.ComponentProps<typeof TileBase>,
    'tile' | 'onEdit' | 'onDelete' | 'isEditMode'
> & { tile: IDashboardChartTile };

const DashboardChartTile: FC<Props> = (props) => {
    const {
        tile: {
            properties: { savedChartUuid },
        },
    } = props;
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data, isLoading } = useSavedQuery({
        id: savedChartUuid || undefined,
    });

    return (
        <TileBase
            title={data?.name || ''}
            isLoading={isLoading}
            extraMenuItems={
                savedChartUuid !== null && (
                    <>
                        <MenuItem
                            icon="document-open"
                            text="Edit chart"
                            href={`/projects/${projectUuid}/saved/${savedChartUuid}`}
                        />
                    </>
                )
            }
            {...props}
        >
            <div style={{ flex: 1 }}>
                {data ? (
                    <ValidDashboardChartTile data={data} />
                ) : (
                    <InvalidDashboardChartTile />
                )}
            </div>
        </TileBase>
    );
};

export default DashboardChartTile;
