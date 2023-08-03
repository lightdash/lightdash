import { Callout, H5, Intent } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import {
    CreateWarehouseCredentials,
    DbtProjectConfig,
    DbtProjectType,
    friendlyName,
    ProjectType,
    SupportedDbtVersions,
    WarehouseTypes,
} from '@lightdash/common';
import { Anchor, Avatar, Card, Flex, Stack } from '@mantine/core';
import { FC, useEffect, useMemo, useState } from 'react';
import { FieldErrors, useForm } from 'react-hook-form';
import { SubmitErrorHandler } from 'react-hook-form/dist/types/form';
import { useHistory } from 'react-router-dom';
import useToaster from '../../hooks/toaster/useToaster';
import {
    useCreateMutation,
    useProject,
    useUpdateMutation,
} from '../../hooks/useProject';
import { useActiveJob } from '../../providers/ActiveJobProvider';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useAbilityContext } from '../common/Authorization';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';
import Input from '../ReactHookForm/Input';
import DbtSettingsForm from './DbtSettingsForm';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { getWarehouseIcon } from './ProjectConnectFlow/SelectWarehouse';
import {
    CompileProjectButton,
    FormContainer,
    LeftPanelMessage,
    LeftPanelTitle,
} from './ProjectConnection.styles';
import { ProjectFormProvider } from './ProjectFormProvider';
import ProjectStatusCallout from './ProjectStatusCallout';
import WarehouseSettingsForm from './WarehouseSettingsForm';

type ProjectConnectionForm = {
    name: string;

    dbt: DbtProjectConfig;

    warehouse?: CreateWarehouseCredentials;
    dbtVersion: SupportedDbtVersions;
};

interface Props {
    showGeneralSettings: boolean;
    disabled: boolean;
    defaultType?: DbtProjectType;
    selectedWarehouse?: WarehouseTypes;
    isProjectUpdate?: boolean;
}

const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
    selectedWarehouse,
    isProjectUpdate,
}) => {
    const { health } = useApp();
    const [warehouse, setWarehouse] = useState(selectedWarehouse);

    return (
        <Stack spacing="xl">
            {showGeneralSettings && (
                <SettingsGridCard>
                    <div>
                        <H5>General settings</H5>
                    </div>

                    <div>
                        <Input
                            name="name"
                            label="Project name"
                            rules={{
                                required: 'Required field',
                            }}
                            disabled={disabled}
                        />
                    </div>
                </SettingsGridCard>
            )}

            <SettingsGridCard>
                <div>
                    {warehouse && getWarehouseIcon(warehouse)}
                    <LeftPanelTitle>
                        <H5>Warehouse connection</H5>
                        <DocumentationHelpButton href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse-connection" />
                    </LeftPanelTitle>

                    {health.data?.staticIp && (
                        <LeftPanelMessage>
                            If you need to add our IP address to your database's
                            allow-list, use <b>{health.data?.staticIp}</b>
                        </LeftPanelMessage>
                    )}
                </div>

                <div>
                    <WarehouseSettingsForm
                        disabled={disabled}
                        setSelectedWarehouse={setWarehouse}
                        selectedWarehouse={warehouse}
                        isProjectUpdate={isProjectUpdate}
                    />
                </div>
            </SettingsGridCard>

            <SettingsGridCard>
                <div>
                    <Avatar size="md" src={DbtLogo} alt="dbt icon" />

                    <LeftPanelTitle>
                        <H5>dbt connection</H5>
                        <DocumentationHelpButton href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project" />
                    </LeftPanelTitle>
                </div>

                <div>
                    <DbtSettingsForm
                        disabled={disabled}
                        defaultType={defaultType}
                        selectedWarehouse={warehouse}
                    />
                </div>
            </SettingsGridCard>
        </Stack>
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
            dbtVersion: data?.dbtVersion,
        },
    });
    const { reset } = methods;
    useEffect(() => {
        if (data) {
            reset({
                name: data.name,
                dbt: data.dbtConnection,
                warehouse: data.warehouseConnection,
                dbtVersion: data.dbtVersion,
            });
        }
    }, [reset, data]);
    const { track } = useTracking();

    const onSubmit = async ({
        name,
        dbt: dbtConnection,
        warehouse: warehouseConnection,
        dbtVersion,
    }: Required<ProjectConnectionForm>) => {
        if (user.data) {
            track({
                name: EventName.UPDATE_PROJECT_BUTTON_CLICKED,
            });
            await mutateAsync({
                name,
                dbtConnection,
                warehouseConnection,
                dbtVersion: dbtVersion,
            });
        }
    };

    if (data?.type === ProjectType.PREVIEW) {
        return (
            <Callout intent="warning">
                <p>
                    Developer previews are temporary Lightdash projects where
                    settings cannot be changed.
                </p>
                Read docs{' '}
                <Anchor
                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-preview"
                    target="_blank"
                    rel="noreferrer"
                >
                    here
                </Anchor>{' '}
                to know more.
            </Callout>
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
                <ProjectForm
                    showGeneralSettings
                    isProjectUpdate
                    disabled={isDisabled}
                    defaultType={health.data?.defaultProject?.type}
                />
            </ProjectFormProvider>

            {!isIdle && (
                <ProjectStatusCallout
                    style={{ marginBottom: '20px' }}
                    mutation={updateMutation}
                />
            )}

            <Card
                component={Flex}
                justify="flex-end"
                pos="sticky"
                withBorder
                shadow="sm"
                sx={(theme) => ({
                    zIndex: 1,
                    bottom: `-${theme.spacing.xl}`,
                })}
            >
                <CompileProjectButton
                    large
                    type="submit"
                    intent={Intent.PRIMARY}
                    loading={isSaving}
                    disabled={isDisabled}
                >
                    {data?.dbtConnection?.type === DbtProjectType.NONE
                        ? 'Save and test'
                        : 'Test & compile project'}
                </CompileProjectButton>
            </Card>
        </FormContainer>
    );
};

interface CreateProjectConnectionProps {
    isCreatingFirstProject: boolean;
    selectedWarehouse?: WarehouseTypes | undefined;
}

export const CreateProjectConnection: FC<CreateProjectConnectionProps> = ({
    isCreatingFirstProject,
    selectedWarehouse,
}) => {
    const history = useHistory();
    const { user, health } = useApp();
    const [createProjectJobId, setCreateProjectJobId] = useState<string>();
    const { activeJobIsRunning, activeJobId, activeJob } = useActiveJob();
    const onError = useOnProjectError();
    const createMutation = useCreateMutation();
    const { isLoading: isSaving, mutateAsync } = createMutation;
    const methods = useForm<ProjectConnectionForm>({
        shouldUnregister: true,
        defaultValues: {
            name: user.data?.organizationName,
            dbt: health.data?.defaultProject,
            warehouse: { type: selectedWarehouse },
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
            const data = await mutateAsync({
                name: name || user.data?.organizationName || 'My project',
                type: ProjectType.DEFAULT,
                dbtConnection,
                //@ts-ignore
                warehouseConnection: {
                    ...warehouseConnection,
                    type: selectedWarehouse,
                },
            });
            setCreateProjectJobId(data.jobUuid);
        }
    };

    useEffect(() => {
        if (
            createProjectJobId &&
            createProjectJobId === activeJob?.jobUuid &&
            activeJob?.jobResults?.projectUuid
        ) {
            history.push({
                pathname: `/createProjectSettings/${activeJob?.jobResults?.projectUuid}`,
            });
        }
    }, [activeJob, createProjectJobId, history]);

    const isSavingProject = useMemo<boolean>(
        () =>
            isSaving ||
            (!!activeJobIsRunning && activeJobId === createProjectJobId),
        [activeJobId, activeJobIsRunning, createProjectJobId, isSaving],
    );

    return (
        <FormContainer
            name="create_project"
            methods={methods}
            onSubmit={onSubmit}
            onError={onError}
        >
            <ProjectFormProvider>
                <ProjectForm
                    showGeneralSettings={!isCreatingFirstProject}
                    disabled={isSavingProject}
                    defaultType={health.data?.defaultProject?.type}
                    selectedWarehouse={selectedWarehouse}
                />

                <CompileProjectButton
                    large
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="Test & compile project"
                    loading={isSavingProject}
                />
            </ProjectFormProvider>
        </FormContainer>
    );
};
