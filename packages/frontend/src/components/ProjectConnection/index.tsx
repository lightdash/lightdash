import { Callout, Card, Colors, H5, Intent } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    DbtProjectType,
    friendlyName,
    Organisation,
    ProjectType,
} from '@lightdash/common';
import React, { FC, useEffect, useState } from 'react';
import { FieldErrors, useForm } from 'react-hook-form';
import { SubmitErrorHandler } from 'react-hook-form/dist/types/form';
import { useHistory } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useCreateMutation,
    useProject,
    useUpdateMutation,
} from '../../hooks/useProject';
import { SelectedWarehouse } from '../../pages/CreateProject';
import { useActiveJob } from '../../providers/ActiveJobProvider';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useAbilityContext } from '../common/Authorization';
import DocumentationHelpButton from '../DocumentationHelpButton';
import Input from '../ReactHookForm/Input';
import DbtSettingsForm from './DbtSettingsForm';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import {
    CompileProjectButton,
    CompileProjectWrapper,
    FormContainer,
    FormWrapper,
    WarehouseLogo,
} from './ProjectConnection.styles';
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
    defaultType?: DbtProjectType;
    selectedWarehouse?: SelectedWarehouse | undefined;
    isProjectUpdate?: boolean | undefined;
}

const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
    selectedWarehouse,
    isProjectUpdate,
}) => {
    const [hasWarehouse, setHasWarehouse] = useState<
        SelectedWarehouse | undefined
    >(selectedWarehouse);

    return (
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
                }}
                elevation={1}
            >
                <div style={{ flex: 1 }}>
                    {hasWarehouse && (
                        <WarehouseLogo
                            src={hasWarehouse.icon}
                            alt={hasWarehouse.key}
                        />
                    )}
                    <div>
                        <H5 style={{ display: 'inline', marginRight: 5 }}>
                            Warehouse connection
                        </H5>
                        <DocumentationHelpButton url="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse-connection" />
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <WarehouseSettingsForm
                        disabled={disabled}
                        setSelectedWarehouse={setHasWarehouse}
                        selectedWarehouse={hasWarehouse}
                        isProjectUpdate={isProjectUpdate}
                    />
                </div>
            </Card>
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
                        <WarehouseLogo src={DbtLogo} alt="dbt icon" />
                        <div>
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
                    </div>

                    <p style={{ color: Colors.GRAY1 }}>
                        Your dbt project must be compatible with{' '}
                        <a
                            href="https://docs.getdbt.com/docs/guides/migration-guide/upgrading-to-1-0-0"
                            target="_blank"
                            rel="noreferrer"
                        >
                            dbt version <b>1.1.0</b>
                        </a>
                    </p>
                </div>
                <div style={{ flex: 1 }}>
                    <DbtSettingsForm
                        disabled={disabled}
                        defaultType={defaultType}
                        selectedWarehouse={hasWarehouse}
                    />
                </div>
            </Card>
        </>
    );
};

const useOnProjectError = (): SubmitErrorHandler<ProjectConnectionForm> => {
    const { showToastError } = useToaster();
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

export const UpdateProjectConnection: FC<{
    projectUuid: string;
}> = ({ projectUuid }) => {
    const { user, health } = useApp();
    const ability = useAbilityContext();
    const { data } = useProject(projectUuid);
    const onError = useOnProjectError();
    const updateMutation = useUpdateMutation(projectUuid);
    const { isLoading: isSaving, mutateAsync, isIdle } = updateMutation;

    const isDisabled =
        isSaving ||
        ability.cannot(
            'update',
            subject('Project', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        );

    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            name: data?.name,
            dbt: data?.dbtConnection,
            warehouse: {
                ...data?.warehouseConnection,
            },
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

    if (data?.type === ProjectType.PREVIEW) {
        return (
            <FormWrapper>
                <Callout intent="warning">
                    <p>
                        Developer previews are temporary Lightdash projects
                        where settings cannot be changed.
                    </p>
                    Read docs{' '}
                    <a
                        href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-preview"
                        target="_blank"
                        rel="noreferrer"
                    >
                        here
                    </a>{' '}
                    to know more.
                </Callout>
            </FormWrapper>
        );
    }

    return (
        <FormContainer
            name="update_project"
            methods={methods}
            onSubmit={onSubmit}
            onError={onError}
        >
            <ProjectFormProvider savedProject={data}>
                <FormWrapper>
                    <ProjectForm
                        showGeneralSettings
                        isProjectUpdate
                        disabled={isDisabled}
                        defaultType={health.data?.defaultProject?.type}
                    />
                </FormWrapper>
            </ProjectFormProvider>
            {!isIdle && (
                <ProjectStatusCallout
                    style={{ marginBottom: '20px' }}
                    mutation={updateMutation}
                />
            )}
            <CompileProjectWrapper>
                <FormWrapper>
                    <CompileProjectButton
                        type="submit"
                        intent={Intent.PRIMARY}
                        text="Test &amp; compile project"
                        loading={isSaving}
                        disabled={isDisabled}
                    />
                </FormWrapper>
            </CompileProjectWrapper>
        </FormContainer>
    );
};

interface CreateProjectConnectionProps {
    orgData: Organisation | undefined;
    selectedWarehouse?: SelectedWarehouse | undefined;
}

export const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    orgData,
    selectedWarehouse,
}) => {
    const history = useHistory();
    const { user, health } = useApp();
    const { activeJobIsRunning, activeJob } = useActiveJob();
    const onError = useOnProjectError();
    const createMutation = useCreateMutation();
    const { isLoading: isSaving, mutateAsync } = createMutation;
    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            name: user.data?.organizationName,
            dbt: health.data?.defaultProject,
            warehouse: { type: selectedWarehouse?.key },
        },
    });
    const { track } = useTracking();

    const onSubmit = async ({
        name,
        dbt: dbtConnection,
        warehouse: warehouseConnection,
    }: Required<ProjectConnectionForm>) => {
        track({
            name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
        });
        if (selectedWarehouse) {
            await mutateAsync({
                name: name || user.data?.organizationName || 'My project',
                dbtConnection,
                //@ts-ignore
                warehouseConnection: {
                    ...warehouseConnection,
                    type: selectedWarehouse?.key,
                },
            });
        }
    };

    useEffect(() => {
        if (activeJob?.jobResults?.projectUuid) {
            history.push({
                pathname: `/createProjectSettings/${activeJob?.jobResults?.projectUuid}`,
            });
        }
    }, [activeJob, history]);

    return (
        <FormContainer
            name="create_project"
            methods={methods}
            onSubmit={onSubmit}
            onError={onError}
        >
            <ProjectFormProvider>
                <FormWrapper>
                    <ProjectForm
                        showGeneralSettings={!orgData?.needsProject}
                        disabled={isSaving || !!activeJobIsRunning}
                        defaultType={health.data?.defaultProject?.type}
                        selectedWarehouse={selectedWarehouse}
                    />
                </FormWrapper>
            </ProjectFormProvider>
            <CompileProjectWrapper fixedButton>
                <FormWrapper>
                    <CompileProjectButton
                        type="submit"
                        intent={Intent.PRIMARY}
                        text="Test &amp; compile project"
                        loading={isSaving || activeJobIsRunning}
                    />
                </FormWrapper>
            </CompileProjectWrapper>
        </FormContainer>
    );
};
