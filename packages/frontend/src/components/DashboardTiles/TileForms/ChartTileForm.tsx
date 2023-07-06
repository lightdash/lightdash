import { Select } from '@mantine/core';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';

const ChartTileForm: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data, isLoading } = useChartSummaries(projectUuid);
    const allSavedCharts = data || [];

    return (
        <Select
            id="savedChartUuid"
            label="Select a saved chart"
            data={allSavedCharts.map(({ uuid, name }) => ({
                value: uuid,
                label: name,
            }))}
            required
            defaultValue={allSavedCharts[0]?.uuid}
            disabled={isLoading}
        />
    );
};

export default ChartTileForm;
