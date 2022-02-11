import {
    DashboardTileTypes,
    getDefaultChartTileSize,
    SavedQuery,
} from 'common';
import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import {
    useDashboardQuery,
    useUpdateDashboard,
} from '../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import ActionModal, {
    ActionModalProps,
    ActionTypeModal,
} from '../common/modal/ActionModal';
import SelectField from '../ReactHookForm/Select';

const Form = ({
    isDisabled,
}: Pick<
    ActionModalProps<{ dashboardUuid: string }>,
    'useActionModalState' | 'isDisabled'
>) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data, isLoading } = useDashboards(projectUuid);
    return (
        <>
            <SelectField
                key={data?.[0]?.uuid} // Note: force re-render when data load
                name="dashboardUuid"
                label="Select a dashboard"
                options={(data || []).map(({ uuid, name }) => ({
                    value: uuid,
                    label: name,
                }))}
                rules={{
                    required: 'Required field',
                }}
                defaultValue={data?.[0]?.uuid}
                disabled={isDisabled || isLoading}
            />
        </>
    );
};

const useUpdateMutation = (id?: string) => {
    const hook = useUpdateDashboard(id || '', true);
    if (id) {
        return hook;
    }
    return { mutate: undefined, isIdle: undefined, isSuccess: undefined };
};

interface Props {
    savedChart: SavedQuery;
    onClose?: () => void;
}

const AddTilesToDashboardModal: FC<Props> = ({ savedChart, onClose }) => {
    const [selectedDashboardUuid, setSelectedDashboardUuid] =
        useState<string>();
    const { data } = useDashboardQuery(selectedDashboardUuid);
    const { mutate, isSuccess, isIdle } = useUpdateMutation(
        selectedDashboardUuid,
    );
    const [actionState, setActionState] = useState<{
        actionType: number;
    }>({
        actionType: ActionTypeModal.UPDATE,
    });
    const [completedMutation, setCompletedMutation] = useState(false);

    const onSubmitForm = (properties: { dashboardUuid: string }) => {
        setCompletedMutation(false);
        setSelectedDashboardUuid(properties.dashboardUuid);
    };

    useEffect(() => {
        if (data && mutate && isIdle) {
            mutate({
                tiles: [
                    ...data.tiles,
                    {
                        uuid: uuid4(),
                        type: DashboardTileTypes.SAVED_CHART,
                        properties: {
                            savedChartUuid: savedChart.uuid,
                        },
                        ...getDefaultChartTileSize(
                            savedChart.chartConfig.chartType,
                        ),
                    },
                ],
            });
        }
    }, [data, mutate, isIdle, savedChart]);

    useEffect(() => {
        if (isSuccess) {
            setCompletedMutation(true);
        }
    }, [isSuccess]);

    return (
        <ActionModal
            title="Add chart to dashboard"
            confirmButtonLabel="Add"
            useActionModalState={[actionState, setActionState]}
            isDisabled={false}
            onSubmitForm={onSubmitForm}
            completedMutation={completedMutation}
            ModalContent={Form}
            onClose={onClose}
        />
    );
};

export default AddTilesToDashboardModal;
