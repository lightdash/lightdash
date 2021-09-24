import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Callout, Card, H5, Intent } from '@blueprintjs/core';
import {
    DbtProjectConfig,
    ProjectType,
    ProjectTypeLabels,
    CreateWarehouseCredentials,
    WarehouseTypes,
} from 'common';
import { useHistory } from 'react-router-dom';
import { useQueryClient } from 'react-query';
import { UseFormReturn } from 'react-hook-form/dist/types';
import WarehouseSettingsForm from './WarehouseSettingsForm';
import DbtSettingsForm from './DbtSettingsForm';
import Form from '../ReactHookForm/Form';
import ProjectStatusCallout from './ProjectStatusCallout';
import {
    useCreateMutation,
    useProject,
    useUpdateMutation,
} from '../../hooks/useProject';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useApp } from '../../providers/AppProvider';

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
                <H5 style={{ flex: 1 }}>dbt connection</H5>
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
                <H5 style={{ flex: 1 }}>Warehouse connection</H5>
                <div style={{ flex: 1 }}>
                    {type &&
                    [
                        ProjectType.DBT,
                        ProjectType.GITHUB,
                        ProjectType.GITLAB,
                    ].includes(type) ? (
                        <WarehouseSettingsForm
                            disabled={disabled}
                            warehouseType={warehouseType}
                        />
                    ) : (
                        <Callout
                            intent="primary"
                            title="No configuration needed"
                        >
                            <p>
                                Warehouse connection is managed by{' '}
                                {type
                                    ? ProjectTypeLabels[type]
                                    : 'dbt connection'}
                            </p>
                        </Callout>
                    )}
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
        warehouse?: CreateWarehouseCredentials;
    }) => {
        if (user.data) {
            await mutateAsync({
                name: user.data.organizationName,
                dbtConnection,
                warehouseConnection,
            });
            track({
                name: EventName.UPDATE_PROJECT_BUTTON_CLICKED,
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
        warehouse?: CreateWarehouseCredentials;
    }) => {
        if (user.data) {
            await mutateAsync({
                name: user.data.organizationName,
                dbtConnection,
                warehouseConnection,
            });
            track({
                name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
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
