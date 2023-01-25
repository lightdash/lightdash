import { SpaceQuery } from '@lightdash/common';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useSpaces } from '../../../hooks/useSpaces';
import SelectField from '../../ReactHookForm/Select';

const ChartTileForm: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data, isLoading } = useSpaces(projectUuid);

    const allSavedCharts =
        data?.reduce<SpaceQuery[]>(
            (sum, { queries }) => [...sum, ...queries],
            [],
        ) || [];

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
