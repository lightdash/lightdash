import {
    assertUnreachable,
    DbtProjectType,
    DuckdbConnectionType,
    ProjectType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type Project,
    type WarehouseCredentials,
} from '@lightdash/common';
import { Button, Code, CopyButton, Stack, Text, Title } from '@mantine-8/core';
import { IconCheck, IconChevronLeft, IconCopy } from '@tabler/icons-react';
import { useMemo, useRef, useState, type FC } from 'react';
import { useCreateProjectWithoutCompileMutation } from '../../../hooks/useProject';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
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
import { createWarehouseValueValidators } from '../WarehouseForms/validators';
import WarehouseSettingsForm from '../WarehouseSettingsForm';
import { OnboardingTitle } from './common/OnboardingTitle';
import { getWarehouseIcon, getWarehouseLabel } from './utils';

type PreparedProject = Pick<Project, 'projectUuid' | 'warehouseConnection'>;

type ConnectionDefaults = {
    database: string | undefined; // undefined when the warehouse has no database concept
    schema: string | undefined;
};

// Treats empty strings as "not configured"
const nonEmpty = (value: string | undefined): string | undefined =>
    value || undefined;

const getConnectionDefaults = (
    credentials: WarehouseCredentials,
): ConnectionDefaults => {
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.TRINO:
            return {
                database: nonEmpty(credentials.dbname),
                schema: nonEmpty(credentials.schema),
            };
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.ATHENA:
            return {
                database: nonEmpty(credentials.database),
                schema: nonEmpty(credentials.schema),
            };
        case WarehouseTypes.BIGQUERY:
            return {
                database: nonEmpty(credentials.project),
                schema: nonEmpty(credentials.dataset),
            };
        case WarehouseTypes.DATABRICKS:
            // `database` is semantically the schema for Databricks
            return {
                database: nonEmpty(credentials.catalog),
                schema: nonEmpty(credentials.database),
            };
        case WarehouseTypes.CLICKHOUSE:
            return {
                database: undefined,
                schema: nonEmpty(credentials.schema),
            };
        case WarehouseTypes.DORIS:
            // Doris addresses tables as `database.table`; the schema field
            // is the database name (no separate catalog concept like Databricks).
            return {
                database: undefined,
                schema: nonEmpty(credentials.schema),
            };
        case WarehouseTypes.DUCKDB:
            if (credentials.connectionType === DuckdbConnectionType.DUCKLAKE) {
                return {
                    database: nonEmpty(credentials.catalogAlias) ?? 'ducklake',
                    schema: nonEmpty(credentials.schema),
                };
            }
            return {
                database: nonEmpty(credentials.database),
                schema: nonEmpty(credentials.schema),
            };
        default:
            return assertUnreachable(
                credentials,
                'Unknown warehouse type when getting connection defaults',
            );
    }
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
    const { track } = useTracking();

    const form = useForm({
        initialValues: {
            name: '',
            dbt: { type: DbtProjectType.NONE },
            warehouse: warehouseDefaultValues[selectedWarehouse],
            dbtVersion: dbtDefaults.dbtVersion,
            organizationWarehouseCredentialsUuid: undefined,
        },
        validate: {
            warehouse: createWarehouseValueValidators[selectedWarehouse],
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

    const agentSetupPrompt = useMemo(() => {
        if (!preparedProject) return undefined;

        const normalizedSiteUrl = siteUrl.replace(/\/+$/, '');
        const instructionsUrl = `${normalizedSiteUrl}/api/v1/prompts/project-onboarding`;

        const connectionDefaults = preparedProject.warehouseConnection
            ? getConnectionDefaults(preparedProject.warehouseConnection)
            : undefined;

        return [
            '# Complete Lightdash project setup',
            '',
            '## Prepared setup',
            '',
            `- Warehouse type: ${selectedWarehouse}`,
            `- Prepared project UUID: ${preparedProject.projectUuid}`,
            ...(connectionDefaults?.database
                ? [`- Configured database: ${connectionDefaults.database}`]
                : []),
            ...(connectionDefaults?.schema
                ? [`- Configured schema: ${connectionDefaults.schema}`]
                : []),
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
                                    onClick={() => {
                                        copy();
                                        track({
                                            name: EventName.AGENT_SETUP_PROMPT_COPIED,
                                        });
                                    }}
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
