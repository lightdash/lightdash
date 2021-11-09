import { Button, Card, H5, Intent } from '@blueprintjs/core';
import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    ProjectType,
    WarehouseTypes,
} from 'common';
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { UseFormReturn } from 'react-hook-form/dist/types';
import { useQueryClient } from 'react-query';
import { useHistory } from 'react-router-dom';
import {
    useCreateMutation,
    useProject,
    useUpdateMutation,
} from '../../hooks/useProject';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import DocumentationHelpButton from '../DocumentationHelpButton';
import Form from '../ReactHookForm/Form';
import DbtSettingsForm from './DbtSettingsForm';
import ProjectStatusCallout from './ProjectStatusCallout';
import WarehouseSettingsForm from './WarehouseSettingsForm';

type ProjectConnectionForm = {
    dbt: DbtProjectConfig;
    warehouse?: CreateWarehouseCredentials;
};

interface Props {
    disabled: boolean;
    defaultType?: ProjectType;
    methods: UseFormReturn<ProjectConnectionForm>;
}

const ProjectForm: FC<Props> = ({ disabled, defaultType, methods }) => {
    const type = methods.watch('dbt.type', defaultType || ProjectType.GITHUB);
    const warehouseType = methods.watch(
        'warehouse.type',
        WarehouseTypes.BIGQUERY,
    );

    return (
        <>
            <Card
                style={{
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'row',
                }}
                elevation={1}
            >
                <div style={{ flex: 1 }}>
                    <H5 style={{ display: 'inline', marginRight: 5 }}>
                        dbt connection
                    </H5>
                    <DocumentationHelpButton url="https://docs.lightdash.com/get-started/setup-lightdash/connect-project" />
                </div>
                <div style={{ flex: 1 }}>
                    <DbtSettingsForm disabled={disabled} type={type} />
                </div>
            </Card>
            <Card
                style={{
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'row',
                }}
                elevation={1}
            >
                <div style={{ flex: 1 }}>
                    <H5 style={{ display: 'inline', marginRight: 5 }}>
                        Warehouse connection
                    </H5>
                    <DocumentationHelpButton url="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse-connection" />
                </div>
                <div style={{ flex: 1 }}>
                    <WarehouseSettingsForm
                        disabled={disabled}
                        warehouseType={warehouseType}
                    />
                </div>
            </Card>
        </>
    );
};

export const UpdateProjectConnection: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { user } = useApp();
    const { data } = useProject(projectUuid);
    const updateMutation = useUpdateMutation(projectUuid);
    const { isLoading: isSaving, mutateAsync, isIdle } = updateMutation;

    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            dbt: data?.dbtConnection,
            warehouse: data?.warehouseConnection,
        },
    });
    const { track } = useTracking();

    const onSubmit = async ({
        dbt: dbtConnection,
        warehouse: warehouseConnection,
    }: {
        dbt: DbtProjectConfig;
        warehouse: CreateWarehouseCredentials;
    }) => {
        if (user.data) {
            track({
                name: EventName.UPDATE_PROJECT_BUTTON_CLICKED,
            });
            await mutateAsync({
                name: user.data.organizationName,
                dbtConnection,
                warehouseConnection,
            });
        }
    };

    return (
        <Form methods={methods} onSubmit={onSubmit}>
            <ProjectForm disabled={isSaving} methods={methods} />
            {!isIdle && (
                <ProjectStatusCallout
                    style={{ marginBottom: '20px' }}
                    mutation={updateMutation}
                />
            )}
            <Button
                type="submit"
                intent={Intent.PRIMARY}
                text="Test & save connection"
                loading={isSaving}
                style={{ float: 'right' }}
            />
        </Form>
    );
};

export const CreateProjectConnection: FC = () => {
    const queryClient = useQueryClient();
    const history = useHistory();
    const { user, health } = useApp();
    const createMutation = useCreateMutation();
    const {
        isLoading: isSaving,
        mutateAsync,
        isIdle,
        isSuccess,
        data,
    } = createMutation;
    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            dbt: health.data?.defaultProject,
        },
    });
    const { track } = useTracking();

    const onSubmit = async ({
        dbt: dbtConnection,
        warehouse: warehouseConnection,
    }: {
        dbt: DbtProjectConfig;
        warehouse: CreateWarehouseCredentials;
    }) => {
        if (user.data) {
            track({
                name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
            });
            await mutateAsync({
                name: user.data.organizationName,
                dbtConnection,
                warehouseConnection,
            });
        }
    };

    return (
        <Form methods={methods} onSubmit={onSubmit}>
            <ProjectForm
                disabled={isSaving || isSuccess}
                methods={methods}
                defaultType={health.data?.defaultProject?.type}
            />
            {!isIdle && (
                <ProjectStatusCallout
                    style={{ marginBottom: '20px' }}
                    mutation={createMutation}
                />
            )}
            {isSuccess ? (
                <Button
                    intent={Intent.PRIMARY}
                    text="Start exploring"
                    onClick={async () => {
                        await queryClient.invalidateQueries(['health']);
                        history.push({
                            pathname: `/projects/${data?.projectUuid}`,
                        });
                    }}
                    style={{ float: 'right' }}
                />
            ) : (
                <Button
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="Test & save connection"
                    loading={isSaving}
                    style={{ float: 'right' }}
                />
            )}
        </Form>
    );
};
