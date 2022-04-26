import { Button, Card, Colors, H5, Intent } from '@blueprintjs/core';
import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    friendlyName,
    ProjectType,
} from 'common';
import React, { FC, useEffect, useState } from 'react';
import { FieldErrors, useForm } from 'react-hook-form';
import { SubmitErrorHandler } from 'react-hook-form/dist/types/form';
import { useHistory, useParams } from 'react-router-dom';
import {
    useCreateMutation,
    useProject,
    useUpdateMutation,
} from '../../hooks/useProject';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useServerStatus } from '../../hooks/useServerStatus';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import DocumentationHelpButton from '../DocumentationHelpButton';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import DbtSettingsForm from './DbtSettingsForm';
import { ProjectFormProvider } from './ProjectFormProvider';
import ProjectStatusCallout from './ProjectStatusCallout';
import WarehouseSettingsForm from './WarehouseSettingsForm';

type ProjectConnectionForm = {
    name: string;
    dbt: DbtProjectConfig;
    warehouse?: CreateWarehouseCredentials;
};

interface Props {
    showGeneralSettings: boolean;
    disabled: boolean;
    defaultType?: ProjectType;
}

const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
}) => (
    <>
        {showGeneralSettings && (
            <Card
                style={{
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 20,
                }}
                elevation={1}
            >
                <div style={{ flex: 1 }}>
                    <div
                        style={{
                            marginBottom: 15,
                        }}
                    >
                        <H5 style={{ display: 'inline', marginRight: 5 }}>
                            General settings
                        </H5>
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <Input
                        name="name"
                        label="Project name"
                        rules={{
                            required: 'Required field',
                        }}
                        disabled={disabled}
                    />
                </div>
            </Card>
        )}
        <Card
            style={{
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'row',
                gap: 20,
            }}
            elevation={1}
        >
            <div style={{ flex: 1 }}>
                <div
                    style={{
                        marginBottom: 15,
                    }}
                >
                    <H5
                        style={{
                            display: 'inline',
                            marginRight: 5,
                        }}
                    >
                        dbt connection
                    </H5>
                    <DocumentationHelpButton url="https://docs.lightdash.com/get-started/setup-lightdash/connect-project" />
                </div>

                <p style={{ color: Colors.GRAY1 }}>
                    Your dbt project must be compatible with{' '}
                    <a
                        href="https://docs.getdbt.com/docs/guides/migration-guide/upgrading-to-1-0-0"
                        target="_blank"
                        rel="noreferrer"
                    >
                        dbt version <b>1.0.0</b>
                    </a>
                </p>
            </div>
            <div style={{ flex: 1 }}>
                <DbtSettingsForm
                    disabled={disabled}
                    defaultType={defaultType}
                />
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
                <WarehouseSettingsForm disabled={disabled} />
            </div>
        </Card>
    </>
);

const useOnProjectError = (): SubmitErrorHandler<ProjectConnectionForm> => {
    const { showToastError } = useApp();
    return async (errors: FieldErrors<ProjectConnectionForm>) => {
        if (!errors) {
            showToastError({
                title: 'Form error',
                subtitle: 'Unexpected error, please contact support',
            });
        } else {
            const errorMessages: string[] = Object.values(errors).reduce<
                string[]
            >((acc, section) => {
                const sectionErrors = Object.entries(section || {}).map(
                    ([key, { message }]) => `${friendlyName(key)}: ${message}`,
                );
                return [...acc, ...sectionErrors];
            }, []);
            showToastError({
                title: 'Form errors',
                subtitle: errorMessages.join('\n\n'),
            });
        }
    };
};

export const UpdateProjectConnection: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { user } = useApp();
    const { data } = useProject(projectUuid);
    const onError = useOnProjectError();
    const updateMutation = useUpdateMutation(projectUuid);
    const { isLoading: isSaving, mutateAsync, isIdle } = updateMutation;

    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            name: data?.name,
            dbt: data?.dbtConnection,
            warehouse: data?.warehouseConnection,
        },
    });
    const { reset } = methods;
    useEffect(() => {
        if (data) {
            reset({
                name: data.name,
                dbt: data.dbtConnection,
                warehouse: data.warehouseConnection,
            });
        }
    }, [reset, data]);
    const { track } = useTracking();

    const onSubmit = async ({
        name,
        dbt: dbtConnection,
        warehouse: warehouseConnection,
    }: Required<ProjectConnectionForm>) => {
        if (user.data) {
            track({
                name: EventName.UPDATE_PROJECT_BUTTON_CLICKED,
            });
            await mutateAsync({
                name,
                dbtConnection,
                warehouseConnection,
            });
        }
    };

    return (
        <Form
            name="update_project"
            methods={methods}
            onSubmit={onSubmit}
            onError={onError}
        >
            <ProjectFormProvider savedProject={data}>
                <ProjectForm showGeneralSettings disabled={isSaving} />
            </ProjectFormProvider>
            {!isIdle && (
                <ProjectStatusCallout
                    style={{ marginBottom: '20px' }}
                    mutation={updateMutation}
                    isCompiling={false}
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
    const history = useHistory();
    const { user, health } = useApp();
    const onError = useOnProjectError();
    const createMutation = useCreateMutation();
    const refreshServer = useRefreshServer();

    const [refreshStatus, setRefreshStatus] = useState<string>();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const status = useServerStatus(projectUuid ? 1000 : 60000);
    const isRefreshLoading = status.data === 'loading';
    const isCompiling = refreshStatus ? refreshStatus !== 'COMPLETED' : false;
    const {
        isLoading: isCreateSaving,
        mutateAsync,
        isIdle,
        isSuccess,
        data,
    } = createMutation;
    const isFinished = refreshStatus === 'COMPLETED';

    const isSaving = isCreateSaving || isRefreshLoading;
    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            name: user.data?.organizationName,
            dbt: health.data?.defaultProject,
        },
    });
    const { track } = useTracking();

    useEffect(() => {
        if (refreshStatus === 'QUEUED' && projectUuid) {
            refreshServer.mutate();
            setRefreshStatus('STARTED');
        }
    }, [projectUuid, refreshStatus, refreshServer]);

    useEffect(() => {
        if (refreshStatus === 'STARTED' && status.data === 'loading') {
            setRefreshStatus('RUNNING');
        } else if (refreshStatus === 'RUNNING' && status.data === 'ready') {
            setRefreshStatus('COMPLETED');
        }
    }, [refreshStatus, status]);

    const onSubmit = async ({
        name,
        dbt: dbtConnection,
        warehouse: warehouseConnection,
    }: Required<ProjectConnectionForm>) => {
        track({
            name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
        });
        const result = await mutateAsync({
            name: name || user.data?.organizationName || 'My project',
            dbtConnection,
            warehouseConnection,
        });
        setRefreshStatus('QUEUED');
        history.push({
            pathname: `/createProject/${result.projectUuid}`,
        });
    };

    return (
        <Form
            name="create_project"
            methods={methods}
            onSubmit={onSubmit}
            onError={onError}
        >
            <ProjectFormProvider>
                <ProjectForm
                    showGeneralSettings={!health.data?.needsProject}
                    disabled={isSaving || isSuccess}
                    defaultType={health.data?.defaultProject?.type}
                />
            </ProjectFormProvider>
            {!isIdle && (
                <ProjectStatusCallout
                    style={{ marginBottom: '20px' }}
                    mutation={createMutation}
                    isCompiling={isCompiling}
                />
            )}
            {isFinished ? (
                <Button
                    intent={Intent.PRIMARY}
                    text="Next"
                    onClick={async () => {
                        history.push({
                            pathname: `/createProjectSettings/${data?.projectUuid}`,
                        });
                    }}
                    style={{ float: 'right' }}
                />
            ) : (
                <Button
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="Test & save connection"
                    loading={isSaving || isCompiling}
                    style={{ float: 'right' }}
                />
            )}
        </Form>
    );
};
