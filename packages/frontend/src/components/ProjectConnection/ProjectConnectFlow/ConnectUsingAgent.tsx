import {
    DbtProjectType,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type Project,
} from '@lightdash/common';
import { Button, Stack, Text, Title } from '@mantine-8/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import { AgentOnboardingLaunchPanel } from '../../../ee/features/agentOnboarding/AgentOnboardingLaunchPanel';
import { useCreateProjectWithoutCompileMutation } from '../../../hooks/useProject';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';
import { dbtDefaults } from '../DbtForms/defaultValues';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import { type ProjectConnectionForm } from '../types';
import { useOnProjectError } from '../useOnProjectError';
import { warehouseDefaultValues } from '../WarehouseForms/defaultValues';
import { createWarehouseValueValidators } from '../WarehouseForms/validators';
import WarehouseSettingsForm from '../WarehouseSettingsForm';
import { OnboardingTitle } from './common/OnboardingTitle';
import { getWarehouseIcon, getWarehouseLabel } from './utils';

type PreparedProject = Pick<Project, 'projectUuid' | 'warehouseConnection'>;

const getSchemaField = (
    warehouseType: WarehouseTypes,
): 'dataset' | 'database' | 'schema' => {
    if (warehouseType === WarehouseTypes.BIGQUERY) return 'dataset';
    if (warehouseType === WarehouseTypes.DATABRICKS) return 'database';
    return 'schema';
};

const getAgentWarehouseValidators = (warehouseType: WarehouseTypes) => {
    const validators = {
        ...createWarehouseValueValidators[warehouseType],
    } as Record<
        string,
        (value: string, values: ProjectConnectionForm) => string | undefined
    >;
    delete validators[getSchemaField(warehouseType)];
    return validators;
};

interface ConnectUsingAgentProps {
    selectedWarehouse: WarehouseTypes;
    siteUrl: string;
    onBack: () => void;
}

const ConnectUsingAgent: FC<ConnectUsingAgentProps> = ({
    selectedWarehouse,
    siteUrl,
    onBack,
}) => {
    const [preparedProject, setPreparedProject] = useState<PreparedProject>();
    const isCreatingProjectRef = useRef(false);
    const createProjectMutation = useCreateProjectWithoutCompileMutation();
    const onProjectError = useOnProjectError();

    const form = useForm({
        initialValues: {
            name: '',
            dbt: { type: DbtProjectType.NONE },
            warehouse: warehouseDefaultValues[selectedWarehouse],
            dbtVersion: dbtDefaults.dbtVersion,
            organizationWarehouseCredentialsUuid: undefined,
        },
        validate: {
            warehouse: getAgentWarehouseValidators(selectedWarehouse),
        },
        validateInputOnBlur: true,
    });

    const handleSubmit = async (formValues: ProjectConnectionForm) => {
        if (preparedProject || isCreatingProjectRef.current) return;

        isCreatingProjectRef.current = true;
        try {
            const warehouseConnection = {
                ...formValues.warehouse,
                type: selectedWarehouse,
                [getSchemaField(selectedWarehouse)]: '',
            } as CreateWarehouseCredentials;
            const result = await createProjectMutation.mutateAsync({
                name: `Coding agent onboarding ${new Date().toISOString()}`,
                type: ProjectType.DEFAULT,
                dbtConnection: { type: DbtProjectType.NONE },
                dbtVersion: dbtDefaults.dbtVersion,
                organizationWarehouseCredentialsUuid:
                    formValues.organizationWarehouseCredentialsUuid,
                warehouseConnection,
            });

            const project = {
                projectUuid: result.project.projectUuid,
                warehouseConnection: result.project.warehouseConnection,
            };
            setPreparedProject(project);
            form.reset();
        } catch {
            return;
        } finally {
            isCreatingProjectRef.current = false;
        }
    };

    if (preparedProject) {
        return (
            <AgentOnboardingLaunchPanel
                project={preparedProject}
                warehouseType={selectedWarehouse}
                siteUrl={siteUrl}
            />
        );
    }

    return (
        <Stack w="100%" maw={960} mx="auto" mt="xl" align="stretch">
            <Button
                variant="subtle"
                size="sm"
                w="fit-content"
                leftSection={<MantineIcon icon={IconChevronLeft} />}
                onClick={onBack}
            >
                Back
            </Button>

            <div>
                <OnboardingTitle>
                    Connect your {getWarehouseLabel(selectedWarehouse)}{' '}
                    warehouse
                </OnboardingTitle>
                <Text c="dimmed" mt="xs">
                    Lightdash stores these credentials securely. They are never
                    copied into the coding-agent prompt.
                </Text>
            </div>

            <FormProvider form={form}>
                <form
                    onSubmit={form.onSubmit(handleSubmit, onProjectError)}
                    className="sentry-block ph-no-capture"
                >
                    <Stack gap="lg">
                        <SettingsGridCard>
                            <div>
                                {getWarehouseIcon(selectedWarehouse)}
                                <Title order={5} mt="xs">
                                    Warehouse connection
                                </Title>
                                <Text c="dimmed" fz="sm" mt="xs">
                                    The coding agent can query your warehouse
                                    through Lightdash without receiving its
                                    credentials.
                                </Text>
                            </div>
                            <ProjectFormProvider>
                                <WarehouseSettingsForm
                                    disabled={createProjectMutation.isLoading}
                                />
                            </ProjectFormProvider>
                        </SettingsGridCard>

                        <Button
                            type="submit"
                            loading={createProjectMutation.isLoading}
                            disabled={createProjectMutation.isLoading}
                            style={{ alignSelf: 'end' }}
                        >
                            Next
                        </Button>
                    </Stack>
                </form>
            </FormProvider>
        </Stack>
    );
};

export default ConnectUsingAgent;
