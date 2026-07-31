import { DbtProjectType, type OrganizationProject } from '@lightdash/common';
import {
    Anchor,
    Box,
    Group,
    Loader,
    Paper,
    Stack,
    Tabs,
    Text,
    Title,
} from '@mantine-8/core';
import { useOs } from '@mantine-8/hooks';
import {
    IconChecklist,
    IconChevronRight,
    IconTerminal,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import AboutFooter from '../components/AboutFooter';
import CodeBlock from '../components/common/CodeBlock/CodeBlock';
import { DocumentTitle } from '../components/common/DocumentTitle';
import MantineIcon from '../components/common/MantineIcon';
import useToaster from '../hooks/toaster/useToaster';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useOnboardingPageGuard } from '../hooks/useOnboardingPageGuard';
import { useProject } from '../hooks/useProject';
import { useProjects } from '../hooks/useProjects';
import useApp from '../providers/App/useApp';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import classes from './OnboardingDbt.module.css';

const DOCS_URL =
    'https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready';
const INTEGRATIONS_ROUTE = '/generalSettings/integrations';
const GET_STARTED_ROUTE = '/get-started';
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
                <Title order={1} ta="center" fw={700}>
                    Let's get you set up!
                </Title>
                <Text size="md" c="dimmed" ta="center">
                    Choose how you want to upload your dbt project.
                </Text>
            </Stack>

            <Stack gap="md">
                {methods.map((method) => (
                    <Paper
                        key={method.to}
                        withBorder
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
                            color="ldGray.6"
                        />
                        <Box className={classes.methodText}>
                            <Text className={classes.methodName}>
                                {method.label}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {method.description}
                            </Text>
                        </Box>
                        <MantineIcon icon={IconChevronRight} color="ldGray.6" />
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

    const baselineProjectUuids = useRef<string[] | null>(null);
    const [isDetected, setIsDetected] = useState(false);

    useEffect(() => {
        if (!projects) return;
        const uuids = projects.map(
            ({ projectUuid }: OrganizationProject) => projectUuid,
        );
        if (baselineProjectUuids.current === null) {
            baselineProjectUuids.current = uuids;
            return;
        }
        if (
            uuids.some((uuid) => !baselineProjectUuids.current?.includes(uuid))
        ) {
            setIsDetected(true);
        }
    }, [projects]);

    useEffect(() => {
        const dbtType = project?.dbtConnection?.type;
        if (dbtType && dbtType !== DbtProjectType.NONE) {
            setIsDetected(true);
        }
    }, [project]);

    return { isDetected, activeProjectUuid };
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

    const { isDetected } = useDbtSetupDetection(true);
    const hasCompletedRef = useRef(false);

    useEffect(() => {
        if (!isDetected || hasCompletedRef.current) return;
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
            void navigate(GET_STARTED_ROUTE, { replace: true });
        })();
    }, [isDetected, navigate, queryClient, showToastSuccess]);

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
                    code="lightdash deploy --create"
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
                <Title order={1} ta="center" fw={700}>
                    Waiting for data
                </Title>
                <Text size="md" c="dimmed" ta="center">
                    Inside your dbt project, run the steps below. We'll pick it
                    up automatically.
                </Text>
            </Stack>

            <Paper withBorder radius="md" className={classes.stepsCard}>
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

    if (method && method !== CLI_ROUTE_PARAM) {
        return <Navigate to="/onboarding/dbt" replace />;
    }

    return (
        <Box className={classes.page}>
            <DocumentTitle title="Set up your dbt" />
            {method === CLI_ROUTE_PARAM ? (
                <DbtCliWaiting />
            ) : (
                <DbtMethodPicker />
            )}
            <AboutFooter />
        </Box>
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
