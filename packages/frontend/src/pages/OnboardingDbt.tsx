import {
    DbtProjectType,
    hasSemanticLayerExplore,
    type OrganizationProject,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import {
    IconChecklist,
    IconChevronRight,
    IconTerminal,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
import CodeBlock from '../components/common/CodeBlock/CodeBlock';
import { DocumentTitle } from '../components/common/DocumentTitle';
import MantineIcon from '../components/common/MantineIcon';
import OnboardingLayout from '../components/common/OnboardingLayout';
import { ONBOARDING_DATA_STEPS } from '../components/common/onboardingSteps';
import { StepVisual } from '../components/common/OnboardingVisuals';
import { useOnboardingNavigate } from '../components/common/viewTransition';
import useToaster from '../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useExplores } from '../hooks/useExplores';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProject } from '../hooks/useProject';
import { useProjects } from '../hooks/useProjects';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import { isPlaygroundProvisioningSource } from '../utils/playgroundProject';
import classes from './OnboardingDbt.module.css';

const DOCS_URL =
    'https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready';
const INTEGRATIONS_ROUTE = '/generalSettings/integrations';
const CLI_ROUTE_PARAM = 'cli';
const DETECTION_POLL_INTERVAL_MS = 3000;

const DocsLink: FC = () => {
    const { track } = useTracking();
    return (
        <Anchor
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer noopener"
            size="sm"
            c="dimmed"
            mx="auto"
            onClick={() => {
                track({
                    name: EventName.DOCUMENTATION_BUTTON_CLICKED,
                    properties: { action: 'getting_started' },
                });
            }}
        >
            View docs
        </Anchor>
    );
};

const DbtMethodPicker: FC = () => {
    const navigate = useNavigate();
    const { track } = useTracking();

    const methods = [
        {
            to: `/onboarding/dbt/${CLI_ROUTE_PARAM}`,
            icon: IconTerminal,
            label: 'Using your CLI',
            description: 'with lightdash deploy',
            onTrack: () =>
                track({ name: EventName.CREATE_PROJECT_CLI_BUTTON_CLICKED }),
        },
        {
            to: INTEGRATIONS_ROUTE,
            icon: IconChecklist,
            label: 'Manually',
            description: 'Pull project from git repository',
            onTrack: () =>
                track({
                    name: EventName.CREATE_PROJECT_MANUALLY_BUTTON_CLICKED,
                }),
        },
    ];

    return (
        <Box className={classes.column}>
            <Stack align="center" gap="xs">
                <Title order={1} ta="center">
                    Connect your dbt project
                </Title>
            </Stack>

            <Stack gap="md">
                {methods.map((method) => (
                    <Paper
                        component="button"
                        type="button"
                        key={method.to}
                        radius="md"
                        className={classes.methodCard}
                        onClick={() => {
                            method.onTrack();
                            void navigate(method.to);
                        }}
                    >
                        <MantineIcon
                            icon={method.icon}
                            size="xl"
                            color="dimmed"
                        />
                        <Box className={classes.methodText}>
                            <Text className={classes.methodName}>
                                {method.label}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {method.description}
                            </Text>
                        </Box>
                        <MantineIcon icon={IconChevronRight} color="dimmed" />
                    </Paper>
                ))}
            </Stack>

            <DocsLink />
        </Box>
    );
};

const useDbtSetupDetection = (isEnabled: boolean) => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const pollOptions = {
        refetchInterval: isEnabled ? DETECTION_POLL_INTERVAL_MS : false,
        refetchIntervalInBackground: true,
        staleTime: 0,
    } as const;

    const { data: projects } = useProjects(pollOptions);
    const { data: project } = useProject(activeProjectUuid, pollOptions);
    // The demo project already has dbt and explores, so it never counts as a deploy
    const deployTargetUuid =
        project && !isPlaygroundProvisioningSource(project.provisioningSource)
            ? project.projectUuid
            : null;
    const { data: explores } = useExplores(activeProjectUuid, false, false, {
        ...pollOptions,
        enabled: !!deployTargetUuid,
    });

    const baselineProjectUuids = useRef<string[] | null>(null);
    const [createdProjectUuid, setCreatedProjectUuid] = useState<string | null>(
        null,
    );

    useEffect(() => {
        if (!projects) return;
        const uuids = projects.map(
            ({ projectUuid }: OrganizationProject) => projectUuid,
        );
        if (baselineProjectUuids.current === null) {
            baselineProjectUuids.current = uuids;
            return;
        }
        const created = uuids.find(
            (uuid) => !baselineProjectUuids.current?.includes(uuid),
        );
        if (created) setCreatedProjectUuid(created);
    }, [projects]);

    const dbtType = project?.dbtConnection?.type;
    const isDeployed =
        (!!dbtType && dbtType !== DbtProjectType.NONE) ||
        (!!explores && hasSemanticLayerExplore(explores));
    const detectedProjectUuid =
        deployTargetUuid && isDeployed ? deployTargetUuid : createdProjectUuid;

    return { detectedProjectUuid, deployTargetUuid };
};

const DbtCliWaiting: FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { health } = useApp();
    const { track } = useTracking();
    const { showToastSuccess } = useToaster();
    const os = useOs();

    const siteUrl = health.data?.siteUrl ?? '';
    const version = health.data?.version ?? '';

    const { detectedProjectUuid, deployTargetUuid } =
        useDbtSetupDetection(true);
    const hasCompletedRef = useRef(false);

    useEffect(() => {
        if (!detectedProjectUuid || hasCompletedRef.current) return;
        hasCompletedRef.current = true;

        void (async () => {
            try {
                await Promise.all([
                    queryClient.refetchQueries({
                        queryKey: ['projects'],
                        type: 'all',
                    }),
                    queryClient.refetchQueries({
                        queryKey: ['organization'],
                        type: 'all',
                    }),
                    queryClient.refetchQueries({
                        queryKey: ['project'],
                        type: 'all',
                    }),
                ]);
            } catch {
                // The destination reads these itself if priming failed
            }
            showToastSuccess({ title: 'Your dbt project is connected!' });
            void navigate(`/onboarding/tools/${detectedProjectUuid}`, {
                replace: true,
            });
        })();
    }, [detectedProjectUuid, navigate, queryClient, showToastSuccess]);

    const handleCopy = useCallback(() => {
        track({ name: EventName.COPY_CREATE_PROJECT_CODE_BUTTON_CLICKED });
    }, [track]);

    const npmInstall = version
        ? `npm install -g @lightdash/cli@${version}`
        : 'npm install -g @lightdash/cli';
    const brewInstall = 'brew tap lightdash/lightdash\nbrew install lightdash';

    const steps = [
        {
            title: 'Install the Lightdash CLI',
            content:
                os === 'macos' ? (
                    <Tabs defaultValue="npm">
                        <Tabs.List>
                            <Tabs.Tab value="npm">npm</Tabs.Tab>
                            <Tabs.Tab value="brew">Homebrew</Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="npm" pt="xs">
                            <CodeBlock
                                code={npmInstall}
                                language="bash"
                                onCopy={handleCopy}
                            />
                        </Tabs.Panel>
                        <Tabs.Panel value="brew" pt="xs">
                            <CodeBlock
                                code={brewInstall}
                                language="bash"
                                onCopy={handleCopy}
                            />
                        </Tabs.Panel>
                    </Tabs>
                ) : (
                    <CodeBlock
                        code={npmInstall}
                        language="bash"
                        onCopy={handleCopy}
                    />
                ),
        },
        {
            title: 'Log in to Lightdash',
            content: (
                <CodeBlock
                    code={`lightdash login ${siteUrl}`}
                    language="bash"
                    onCopy={handleCopy}
                />
            ),
        },
        {
            title: 'Deploy your dbt project',
            content: (
                <CodeBlock
                    code={
                        deployTargetUuid
                            ? `lightdash deploy --project ${deployTargetUuid}`
                            : 'lightdash deploy --create'
                    }
                    language="bash"
                    onCopy={handleCopy}
                />
            ),
        },
    ];

    return (
        <Box className={classes.column}>
            <Stack align="center" gap="xs">
                <Loader size="sm" />
                <Title order={1} ta="center">
                    Waiting for data
                </Title>
                <Text size="md" c="dimmed" ta="center">
                    Inside your dbt project, run the steps below. We'll pick it
                    up automatically.
                </Text>
            </Stack>

            <Paper radius="md" className={classes.stepsCard}>
                {steps.map((step, index) => (
                    <Stack key={step.title} gap="xs">
                        <Group gap="sm" wrap="nowrap">
                            <Box className={classes.stepNumber}>
                                {index + 1}
                            </Box>
                            <Text fw={500}>{step.title}</Text>
                        </Group>
                        {step.content}
                    </Stack>
                ))}
            </Paper>

            <DocsLink />
        </Box>
    );
};

const OnboardingDbtContent: FC = () => {
    const { method } = useParams<{ method?: string }>();
    const onboardingNavigate = useOnboardingNavigate();
    const location = useLocation();

    if (method && method !== CLI_ROUTE_PARAM) {
        return <Navigate to="/onboarding/dbt" replace />;
    }

    return (
        <OnboardingLayout
            screen="dbt"
            journey={{
                currentStep: 1,
                steps: ONBOARDING_DATA_STEPS,
                progress: 0.8,
            }}
            stackDepth={method === CLI_ROUTE_PARAM ? 2 : 1}
            aside={<StepVisual step="warehouse" />}
        >
            <DocumentTitle title="Connect your dbt project" />
            {method === CLI_ROUTE_PARAM ? (
                <DbtCliWaiting />
            ) : (
                <DbtMethodPicker />
            )}
            <Group justify="space-between" mt="xl">
                <Button
                    variant="subtle"
                    color="gray"
                    onClick={() =>
                        location.key === 'default'
                            ? onboardingNavigate('/onboarding/data-source')
                            : onboardingNavigate(-1)
                    }
                >
                    Back
                </Button>
                <Button
                    variant="default"
                    onClick={() =>
                        onboardingNavigate('/onboarding/data-source')
                    }
                >
                    No dbt? Connect a warehouse
                </Button>
            </Group>
        </OnboardingLayout>
    );
};

const OnboardingDbt: FC = () => {
    const guard = useOnboardingPageGuard();

    if (guard.status === 'blocked') {
        return guard.element;
    }

    return <OnboardingDbtContent key={guard.user.userUuid} />;
};

export default OnboardingDbt;
