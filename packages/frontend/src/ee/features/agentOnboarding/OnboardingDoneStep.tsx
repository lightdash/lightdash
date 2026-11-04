import {
    AGENT_ONBOARDING_STAGES,
    type ApiConnectorType,
} from '@lightdash/common';
import { Box, Button, Image, Stack, Text, Title } from '@mantine/core';
import { IconArrowRight, IconCheck } from '@tabler/icons-react';
import { Fragment, useEffect, type FC } from 'react';
import { Link } from 'react-router';
import { DocumentTitle } from '../../../components/common/DocumentTitle';
import MantineIcon from '../../../components/common/MantineIcon';
import OnboardingLayout from '../../../components/common/OnboardingLayout';
import { WarehouseTypeLabels } from '../../../components/ProjectConnection/ProjectConnectFlow/utils';
import { useExternalConnections } from '../../../features/externalConnections/hooks/useExternalConnections';
import { LiveSourceIcon } from '../../../features/externalConnections/liveSources/LiveSourceIcon';
import { useProject } from '../../../hooks/useProject';
import { markHomepageTourSeen } from '../homepageBuilder/onboarding';
import { useAuroraRun } from './hooks/useAuroraRun';
import { useAskAurora } from './hooks/useFirstQuestions';
import classes from './OnboardingDoneStep.module.css';
import { OnboardingRunActivity } from './OnboardingRunActivity';

type Source = {
    key: string;
    name: string;
    logo: string | null;
    connector: ApiConnectorType | null;
};

const SourceName: FC<{ source: Source }> = ({ source }) => (
    <Box component="span" className={classes.source}>
        {source.logo ? (
            <Image src={source.logo} alt="" w={12} h={12} fit="contain" />
        ) : (
            <LiveSourceIcon connector={source.connector} size={12} />
        )}
        {source.name}
    </Box>
);

const FIRST_QUESTION =
    "What's in my data, and what are three questions worth asking?";

export const OnboardingDoneStep: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    useEffect(markHomepageTourSeen, []);
    const ask = useAskAurora(projectUuid);
    const { run, isLive } = useAuroraRun(projectUuid);
    // Asked before the semantic layer deploys, the agent only sees the raw sources
    const areMetricsLive =
        !isLive ||
        (!!run?.stage &&
            AGENT_ONBOARDING_STAGES.indexOf(run.stage) >
                AGENT_ONBOARDING_STAGES.indexOf('deploying_semantic_layer'));
    const { data: project } = useProject(projectUuid);
    const { data: connections = [] } = useExternalConnections(projectUuid);

    const warehouse = WarehouseTypeLabels.find(
        ({ key }) => key === project?.warehouseConnection?.type,
    );
    const sources: Source[] = [
        ...(warehouse?.iconType === 'image'
            ? [
                  {
                      key: 'warehouse',
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
                                    <SourceName source={source} />
                                </Fragment>
                            ))}{' '}
                            is ready.
                        </Text>
                    )}
                </Stack>

                <Box className={classes.runCard}>
                    <OnboardingRunActivity
                        projectUuid={projectUuid}
                        variant="grouped"
                    />
                </Box>

                <Stack gap="md">
                    <Stack gap="xs">
                        {isLive && (
                            <Text fz="sm" fw={500}>
                                {areMetricsLive
                                    ? 'Your metrics are live'
                                    : 'Available once your metrics are live'}
                            </Text>
                        )}
                        <Button
                            size="md"
                            fullWidth
                            disabled={!areMetricsLive}
                            onClick={() => ask(FIRST_QUESTION)}
                            rightSection={<MantineIcon icon={IconArrowRight} />}
                            className={classes.primary}
                        >
                            Ask your first question
                        </Button>
                    </Stack>
                    <Button
                        size="md"
                        fullWidth
                        variant="subtle"
                        color="gray"
                        component={Link}
                        to={`/projects/${projectUuid}/home`}
                        viewTransition
                    >
                        Go to home
                    </Button>
                </Stack>
            </Stack>
        </OnboardingLayout>
    );
};
