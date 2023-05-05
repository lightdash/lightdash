import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import SelectField from '../../ReactHookForm/Select';

const ChartTileForm: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data, isLoading } = useChartSummaries(projectUuid);
    const allSavedCharts = data || [];
    return (
        <SelectField
            key={allSavedCharts[0]?.uuid} // Note: force re-render when saved queries load
            name="savedChartUuid"
            label="Select a saved chart"
            options={allSavedCharts.map(({ uuid, name }) => ({
                value: uuid,
                label: name,
            }))}
            rules={{
                required: 'Required field',
            }}
            defaultValue={allSavedCharts[0]?.uuid}
            disabled={isLoading}
        />
    );
};

export default ChartTileForm;
