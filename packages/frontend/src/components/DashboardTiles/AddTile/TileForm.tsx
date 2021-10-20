import React from 'react';
import { DashboardChartTile, SpaceQuery } from 'common';
import { useParams } from 'react-router-dom';
import { ActionModalProps } from '../../common/modal/ActionModal';
import { useSavedQuery } from '../../../hooks/useSpaces';
import SelectField from '../../ReactHookForm/Select';

const TileForm = ({
    isDisabled,
}: Pick<
    ActionModalProps<DashboardChartTile['properties']>,
    'useActionModalState' | 'isDisabled'
>) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data, isLoading } = useSavedQuery(projectUuid);
    const allSavedCharts =
        data?.reduce<SpaceQuery[]>(
            (sum, { queries }) => [...sum, ...queries],
            [],
        ) || [];
    return (
        <>
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
                disabled={isDisabled || isLoading}
            />
        </>
    );
};

export default TileForm;
