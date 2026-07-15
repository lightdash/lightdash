import {
    DbtProjectType,
    ProjectType,
    type CreateWarehouseCredentials,
    type Project,
    type WarehouseTypes,
} from '@lightdash/common';
import { Button, Code, CopyButton, Stack, Text, Title } from '@mantine-8/core';
import { IconCheck, IconChevronLeft, IconCopy } from '@tabler/icons-react';
import { useMemo, useRef, useState, type FC } from 'react';
import { useCreateProjectWithoutCompileMutation } from '../../../hooks/useProject';
import MantineIcon from '../../common/MantineIcon';
import {
    SettingsCard,
    SettingsGridCard,
} from '../../common/Settings/SettingsCard';
import { dbtDefaults } from '../DbtForms/defaultValues';
import { FormProvider, useForm } from '../formContext';
import { ProjectFormProvider } from '../ProjectFormProvider';
import { type ProjectConnectionForm } from '../types';
import { useOnProjectError } from '../useOnProjectError';
import { warehouseDefaultValues } from '../WarehouseForms/defaultValues';
import { warehouseValueValidators } from '../WarehouseForms/validators';
import WarehouseSettingsForm from '../WarehouseSettingsForm';
import { OnboardingTitle } from './common/OnboardingTitle';
import { getWarehouseIcon, getWarehouseLabel } from './utils';

type PreparedProject = Pick<Project, 'projectUuid'>;

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
            warehouse: warehouseValueValidators[selectedWarehouse],
        },
        validateInputOnBlur: true,
    });

    const handleSubmit = async (formValues: ProjectConnectionForm) => {
        if (preparedProject || isCreatingProjectRef.current) return;

        isCreatingProjectRef.current = true;
        try {
            const result = await createProjectMutation.mutateAsync({
                name: `Coding agent onboarding ${new Date().toISOString()}`,
                type: ProjectType.DEFAULT,
                dbtConnection: { type: DbtProjectType.NONE },
                dbtVersion: dbtDefaults.dbtVersion,
                organizationWarehouseCredentialsUuid:
                    formValues.organizationWarehouseCredentialsUuid,
                warehouseConnection: {
                    ...formValues.warehouse,
                    type: selectedWarehouse,
                } as CreateWarehouseCredentials,
            });

            const project = {
                projectUuid: result.project.projectUuid,
            };
            setPreparedProject(project);
            form.reset();
        } catch {
            return;
        } finally {
            isCreatingProjectRef.current = false;
        }
    };

    const agentSetupPrompt = useMemo(() => {
        if (!preparedProject) return undefined;

        const normalizedSiteUrl = siteUrl.replace(/\/+$/, '');
        const instructionsUrl = `${normalizedSiteUrl}/api/v1/prompts/project-onboarding`;

        return [
            '# Complete Lightdash project setup',
            '',
            '## Prepared setup',
            '',
            `- Warehouse type: ${selectedWarehouse}`,
            `- Prepared project UUID: ${preparedProject.projectUuid}`,
            '',
            '## Next step',
            '',
            `Fetch and follow the remaining instructions from: ${instructionsUrl}`,
            'Use the prepared setup values above whenever those instructions refer to a setup value.',
        ].join('\n');
    }, [preparedProject, selectedWarehouse, siteUrl]);

    if (preparedProject) {
        return (
            <Stack w="100%" maw={960} mx="auto" mt="xl">
                <SettingsCard p="xl">
                    <Stack gap="lg" className="sentry-block ph-no-capture">
                        <div>
                            <Title order={3}>Complete your project setup</Title>
                            <Text c="dimmed" mt="xs">
                                Copy the prompt below and run it with your
                                coding agent to finish setting up your Lightdash
                                project.
                            </Text>
                        </div>

                        <Code
                            block
                            className="sentry-block ph-no-capture"
                            style={{
                                whiteSpace: 'pre-wrap',
                                overflowWrap: 'anywhere',
                            }}
                        >
                            {agentSetupPrompt}
                        </Code>

                        <CopyButton value={agentSetupPrompt ?? ''}>
                            {({ copied, copy }) => (
                                <Button
                                    onClick={copy}
                                    leftSection={
                                        <MantineIcon
                                            icon={copied ? IconCheck : IconCopy}
                                        />
                                    }
                                >
                                    {copied ? 'Prompt copied' : 'Copy prompt'}
                                </Button>
                            )}
                        </CopyButton>
                    </Stack>
                </SettingsCard>
            </Stack>
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
