import { DashboardTileTypes } from 'common';
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

interface Props {
    savedChartUuid: string;
    onClose?: () => void;
}

const AddTilesToDashboardModal: FC<Props> = ({ savedChartUuid, onClose }) => {
    const [selectedDashboardUuid, setSelectedDashboardUuid] =
        useState<string>();
    const { data } = useDashboardQuery(selectedDashboardUuid);
    const { mutate, isSuccess, isIdle } = useUpdateDashboard();
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
        if (data && isIdle) {
            mutate({
                uuid: data.uuid,
                data: {
                    tiles: [
                        ...data.tiles,
                        {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SAVED_CHART,
                            properties: {
                                savedChartUuid,
                            },
                            h: 3,
                            w: 5,
                            x: 0,
                            y: 0,
                        },
                    ],
                },
            });
        }
    }, [data, mutate, isIdle, savedChartUuid]);

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
