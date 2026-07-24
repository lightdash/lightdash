import {
    assertUnreachable,
    DuckdbConnectionType,
    WarehouseTypes,
    type Project,
    type WarehouseCredentials,
} from '@lightdash/common';
import {
    Button,
    Code,
    Collapse,
    CopyButton,
    Divider,
    Group,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from '@mantine-8/core';
import {
    IconCheck,
    IconChevronDown,
    IconCopy,
    IconSparkles,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useIsCopilotEnabled } from '../aiCopilot/hooks/useIsCopilotEnabled';
import { AgentOnboardingProgress } from './AgentOnboardingProgress';
import { useStartAgentOnboardingRun } from './hooks/useAgentOnboarding';
import { getAgentOnboardingRunUrl } from './utils';

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
        case WarehouseTypes.DUCKDB:
            if (credentials.connectionType === DuckdbConnectionType.DUCKLAKE) {
                return {
                    database: nonEmpty(credentials.catalogAlias) ?? 'ducklake',
                    schema: nonEmpty(credentials.schema),
                };
            }
            if (credentials.connectionType === DuckdbConnectionType.EMBEDDED) {
                return {
                    database: credentials.dataset,
                    schema: undefined,
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

type AgentOnboardingLaunchPanelProps = {
    project: Pick<Project, 'projectUuid' | 'warehouseConnection'>;
    warehouseType: WarehouseTypes;
    siteUrl: string;
};

export const AgentOnboardingLaunchPanel: FC<
    AgentOnboardingLaunchPanelProps
> = ({ project, warehouseType, siteUrl }) => {
    const [isLocalPromptOpen, setIsLocalPromptOpen] = useState(false);
    const navigate = useNavigate();
    const startAgentOnboardingRun = useStartAgentOnboardingRun();
    const { isCopilotEnabled } = useIsCopilotEnabled();
    const { track } = useTracking();

    const agentSetupPrompt = useMemo(() => {
        const normalizedSiteUrl = siteUrl.replace(/\/+$/, '');
        const instructionsUrl = `${normalizedSiteUrl}/api/v1/prompts/project-onboarding`;

        const connectionDefaults = project.warehouseConnection
            ? getConnectionDefaults(project.warehouseConnection)
            : undefined;

        return [
            '# Complete Lightdash project setup',
            '',
            '## Prepared setup',
            '',
            `- Warehouse type: ${warehouseType}`,
            `- Prepared project UUID: ${project.projectUuid}`,
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
    }, [project, warehouseType, siteUrl]);

    const openProject = () => {
        void navigate(`/projects/${project.projectUuid}`);
    };

    const startManagedSetup = async () => {
        try {
            const run = await startAgentOnboardingRun.mutateAsync(
                project.projectUuid,
            );
            void navigate(
                getAgentOnboardingRunUrl(
                    run.agentOnboardingRunUuid,
                    run.projectUuid,
                ),
            );
        } catch {
            return;
        }
    };

    const localPrompt = (
        <Stack gap="lg" className="sentry-block ph-no-capture">
            <div>
                <Title order={3}>Complete your project setup</Title>
                <Text c="dimmed" mt="xs">
                    Copy the prompt below and run it with your coding agent to
                    finish setting up your Lightdash project.
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

            <CopyButton value={agentSetupPrompt}>
                {({ copied, copy }) => (
                    <Button
                        onClick={() => {
                            copy();
                            track({
                                name: EventName.AGENT_SETUP_PROMPT_COPIED,
                            });
                        }}
                        leftSection={
                            <MantineIcon icon={copied ? IconCheck : IconCopy} />
                        }
                    >
                        {copied ? 'Prompt copied' : 'Copy prompt'}
                    </Button>
                )}
            </CopyButton>
        </Stack>
    );

    if (isCopilotEnabled) {
        return (
            <Stack w="100%" maw={960} mx="auto" mt="xl">
                <SettingsCard p="xl">
                    <Stack gap="xl">
                        <Group align="flex-start" wrap="nowrap" gap="md">
                            <ThemeIcon
                                size={44}
                                radius="xl"
                                variant="light"
                                color="violet"
                            >
                                <MantineIcon icon={IconSparkles} size="lg" />
                            </ThemeIcon>
                            <Stack gap={6} style={{ flex: 1 }}>
                                <Title order={3}>
                                    Let Lightdash build it for you
                                </Title>
                                <Text c="dimmed">
                                    We’ll explore your warehouse, create a
                                    semantic layer, and build a starter
                                    dashboard. You can follow every step.
                                </Text>
                            </Stack>
                        </Group>

                        <AgentOnboardingProgress />

                        <Group justify="space-between">
                            <Button
                                size="md"
                                leftSection={
                                    <MantineIcon icon={IconSparkles} />
                                }
                                onClick={() => void startManagedSetup()}
                                loading={startAgentOnboardingRun.isLoading}
                            >
                                Run it for me
                            </Button>
                            <Button
                                variant="subtle"
                                color="gray"
                                onClick={openProject}
                                disabled={startAgentOnboardingRun.isLoading}
                            >
                                Skip to project
                            </Button>
                        </Group>

                        <Divider />

                        <Button
                            variant="subtle"
                            color="gray"
                            w="fit-content"
                            rightSection={
                                <MantineIcon icon={IconChevronDown} />
                            }
                            onClick={() =>
                                setIsLocalPromptOpen((value) => !value)
                            }
                        >
                            Use my own coding agent instead
                        </Button>
                        <Collapse in={isLocalPromptOpen}>
                            {localPrompt}
                        </Collapse>
                    </Stack>
                </SettingsCard>
            </Stack>
        );
    }

    return (
        <Stack w="100%" maw={960} mx="auto" mt="xl">
            <SettingsCard p="xl">{localPrompt}</SettingsCard>
        </Stack>
    );
};
