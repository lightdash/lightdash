import { type ApiConnectorType } from '@lightdash/common';
import { Box, Button, Image, Stack, Text, Title } from '@mantine/core';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { Fragment, useEffect, type FC } from 'react';
import { Link, useNavigate } from 'react-router';
import { DocumentTitle } from '../../../components/common/DocumentTitle';
import MantineIcon from '../../../components/common/MantineIcon';
import OnboardingLayout from '../../../components/common/OnboardingLayout';
import { WarehouseTypeLabels } from '../../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import { LiveSourceIcon } from '../../../features/externalConnections/liveSources/LiveSourceIcon';
import { WAREHOUSE_SOURCE_ID } from '../../../features/semanticStudio/realProject';
import { getSemanticStudioSourceUrl } from '../../../features/semanticStudio/urls';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useCanCreateAiAgentThread } from '../aiCopilot/hooks/useAiAgentPermission';
import { useProjectAiAgents } from '../aiCopilot/hooks/useProjectAiAgents';
import { markHomepageTourSeen } from '../homepageBuilder/onboarding';
import classes from './OnboardingDoneStep.module.css';

type Source = {
    key: string;
    name: string;
    logo: string | null;
    connector: ApiConnectorType | null;
};

const SourceName: FC<{ source: Source; to: string | null }> = ({
    source,
    to,
}) => {
    const content = (
        <>
            {source.logo ? (
                <Image src={source.logo} alt="" w={12} h={12} fit="contain" />
            ) : (
                <LiveSourceIcon connector={source.connector} size={12} />
            )}
            {source.name}
        </>
    );
    return to ? (
        <Link to={to} className={classes.source}>
            {content}
        </Link>
    ) : (
        <Box component="span" className={classes.source}>
            {content}
        </Box>
    );
};

const FIRST_QUESTION =
    "What's in my data, and what are three questions worth asking?";

const useAskAurora = (projectUuid: string) => {
    const navigate = useNavigate();
    const canCreateThread = useCanCreateAiAgentThread(projectUuid);
    const { data: agents, isInitialLoading } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
        options: { enabled: canCreateThread },
    });
    const agent = agents?.[0];
    return {
        canAsk: canCreateThread && (isInitialLoading || !!agent),
        ask: (prompt: string) =>
            void navigate(
                agent
                    ? `/projects/${projectUuid}/ai-agents/${agent.uuid}/threads`
                    : `/projects/${projectUuid}/ai-agents`,
                { state: { autoSubmitPrompt: prompt } },
            ),
    };
};

export const OnboardingDoneStep: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    useEffect(markHomepageTourSeen, []);
    const { canAsk, ask } = useAskAurora(projectUuid);
    const { data: project } = useProject(projectUuid);
    const { user } = useApp();
    const { track } = useTracking();
    const trackAction = (action: 'ask_first_question' | 'look_around') =>
        track({
            name: EventName.ONBOARDING_DONE_ACTION_CLICKED,
            properties: {
                organizationId: user.data?.organizationUuid ?? null,
                projectId: projectUuid,
                action,
            },
        });
    const { data: connections = [] } = useExternalConnections(projectUuid);

    const warehouse = WarehouseTypeLabels.find(
        ({ key }) => key === project?.warehouseConnection?.type,
    );
    const sources: Source[] = [
        ...(warehouse?.iconType === 'image'
            ? [
                  {
                      key: WAREHOUSE_SOURCE_ID,
                      name: warehouse.label,
                      logo: warehouse.image,
                      connector: null,
                  },
              ]
            : []),
        ...connections
            .filter(({ kind }) => kind === 'live_source')
            .map((connection) => ({
                key: connection.externalConnectionUuid,
                name: connection.name,
                logo: null,
                connector: connection.apiSource?.connector ?? null,
            })),
    ];

    return (
        <OnboardingLayout
            screen="done"
            stackDepth={6}
            centered
            withAccountSwitch={false}
        >
            <DocumentTitle title="You're all set" />
            <Box className={classes.tick} aria-hidden>
                <MantineIcon icon={IconCheck} size={28} stroke={2.5} />
            </Box>
            <Stack className={classes.column} gap="xl">
                <Stack gap={4} align="center">
                    <Title order={1}>You're all set</Title>
                    {sources.length > 0 && (
                        <Text c="dimmed" className={classes.subtitle}>
                            Your data from{' '}
                            {sources.map((source, index) => (
                                <Fragment key={source.key}>
                                    {index > 0 &&
                                        (index === sources.length - 1
                                            ? ' and '
                                            : ', ')}
                                    <SourceName
                                        source={source}
                                        to={getSemanticStudioSourceUrl(
                                            projectUuid,
                                            source.key,
                                        )}
                                    />
                                </Fragment>
                            ))}{' '}
                            is ready.
                        </Text>
                    )}
                </Stack>

                <Stack gap="md">
                    {canAsk && (
                        <Button
                            size="md"
                            fullWidth
                            onClick={() => {
                                trackAction('ask_first_question');
                                ask(FIRST_QUESTION);
                            }}
                            rightSection={<MantineIcon icon={IconArrowRight} />}
                        >
                            Ask your first question
                        </Button>
                    )}
                    <Button
                        size="md"
                        fullWidth
                        variant={canAsk ? 'subtle' : 'filled'}
                        color={canAsk ? 'gray' : undefined}
                        component={Link}
                        to={`/projects/${projectUuid}/home`}
                        viewTransition
                        onClick={() => trackAction('look_around')}
                    >
                        {canAsk ? "I'll look around first" : 'Go to home'}
                    </Button>
                </Stack>
            </Stack>
        </OnboardingLayout>
    );
};
