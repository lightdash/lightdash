import { subject } from '@casl/ability';
import {
    DbtProjectType,
    friendlyName,
    ProjectType,
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
    type SupportedDbtVersions,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    Alert,
    Anchor,
    Avatar,
    Button,
    Card,
    Flex,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useForm, useFormContext, type FieldErrors } from 'react-hook-form';
import { type SubmitErrorHandler } from 'react-hook-form/dist/types/form';
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
import MantineIcon from '../common/MantineIcon';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DocumentationHelpButton from '../DocumentationHelpButton';
import DbtSettingsForm from './DbtSettingsForm';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { getWarehouseIcon } from './ProjectConnectFlow/SelectWarehouse';
import { FormContainer } from './ProjectConnection.styles';
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
    const { register } = useFormContext();

    return (
        <Stack spacing="xl">
            {showGeneralSettings && (
                <SettingsGridCard>
                    <div>
                        <Title order={5}>General settings</Title>
                    </div>

                    <div>
                        <TextInput
                            label="Project name"
                            required
                            disabled={disabled}
                            {...register('name')}
                        />
                    </div>
                </SettingsGridCard>
            )}

            <SettingsGridCard>
                <div>
                    {warehouse && getWarehouseIcon(warehouse)}
                    <Flex align="center" gap={2}>
                        <Title order={5}>Warehouse connection</Title>
                        <DocumentationHelpButton
                            href={`${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project#warehouse-connection`}
                            pos="relative"
                            top="2px"
                        />
                    </Flex>

                    {health.data?.staticIp && (
                        <Text color="gray">
                            If you need to add our IP address to your database's
                            allow-list, use <b>{health.data?.staticIp}</b>
                        </Text>
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

                    <Flex align="center" gap={2}>
                        <Title order={5}>dbt connection</Title>
                        <DocumentationHelpButton
                            href={`${health.data?.siteHelpdeskUrl}/get-started/setup-lightdash/connect-project`}
                            pos="relative"
                            top="2px"
                        />
                    </Flex>
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
                dbtVersion,
            });
        }
    };

    if (data?.type === ProjectType.PREVIEW) {
        return (
            <Alert
                color="orange"
                icon={<MantineIcon icon={IconExclamationCircle} size="lg" />}
                title={`Developer previews are temporary ${health.data?.siteName} projects where settings cannot be changed.`}
            >
                Read docs{' '}
                <Anchor
                    href={`${health.data?.siteHelpdeskUrl}/guides/cli/how-to-use-lightdash-preview`}
                    target="_blank"
                    rel="noreferrer"
                >
                    here
                </Anchor>{' '}
                to know more.
            </Alert>
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

            {!isIdle && <ProjectStatusCallout mutation={updateMutation} />}

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
                <Button type="submit" loading={isSaving} disabled={isDisabled}>
                    {data?.dbtConnection?.type === DbtProjectType.NONE
                        ? 'Save and test'
                        : 'Test & compile project'}
                </Button>
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
        dbtVersion,
    }: Required<ProjectConnectionForm>) => {
        track({
            name: EventName.CREATE_PROJECT_BUTTON_CLICKED,
        });
        if (selectedWarehouse) {
            const data = await mutateAsync({
                name: name || user.data?.organizationName || 'My project',
                type: ProjectType.DEFAULT,
                dbtConnection,
                dbtVersion,
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

                <Button
                    sx={{ alignSelf: 'end' }}
                    type="submit"
                    loading={isSavingProject}
                >
                    Test & compile project
                </Button>
            </ProjectFormProvider>
        </FormContainer>
    );
};
