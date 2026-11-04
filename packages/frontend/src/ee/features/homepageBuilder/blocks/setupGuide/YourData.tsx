import {
    type ExternalConnectionListItem,
    type SummaryExplore,
} from '@lightdash/common';
import { Anchor, Box, Button, Group, Loader, Paper, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDatabase,
    IconExternalLink,
    IconLayersLinked,
    IconPlugConnected,
    IconTable,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AI_NAME } from '../../../../../components/common/aiName';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { getApiSourceTarget } from '../../../../../components/Settings/LiveDataSourcesPanel/googleConnection';
import { useLiveSourceExplores } from '../../../../../features/externalConnections/hooks/useLiveSourceExplores';
import { getLiveSource } from '../../../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import {
    getAgentOnboardingRunUrl,
    plural,
} from '../../../agentOnboarding/utils';
import { type RecommendedActionsState } from '../useRecommendedActions';
import {
    SEMANTIC_LAYER_STEP_COUNT,
    SemanticLayerExplainer,
} from './SemanticLayerExplainer';
import guideClasses from './SetupGuide.module.css';
import { type SetupGuideState } from './useSetupGuide';
import classes from './YourData.module.css';

const SEMANTIC_LAYER_DOCS_URL = 'https://docs.lightdash.com/semantic-layer';
const MAX_CHIPS = 8;

const ExploreChips: FC<{
    projectUuid: string;
    explores: { name: string; label: string }[];
}> = ({ projectUuid, explores }) => (
    <Group gap={6} mt="xs">
        {explores.slice(0, MAX_CHIPS).map(({ name, label }) => (
            <Button
                key={name}
                component={Link}
                to={`/projects/${projectUuid}/tables/${name}`}
                variant="default"
                size="compact-xs"
                leftSection={<MantineIcon icon={IconTable} size={12} />}
            >
                {label}
            </Button>
        ))}
        {explores.length > MAX_CHIPS && (
            <Button
                component={Link}
                to={`/projects/${projectUuid}/tables`}
                variant="subtle"
                color="gray"
                size="compact-xs"
            >
                +{explores.length - MAX_CHIPS} more
            </Button>
        )}
    </Group>
);

const SourceBlock: FC<{
    icon: ReactNode;
    title: string;
    detail: ReactNode;
    children: ReactNode;
}> = ({ icon, title, detail, children }) => (
    <Group gap="sm" wrap="nowrap" align="flex-start" className={classes.source}>
        <Box className={classes.sourceIcon}>{icon}</Box>
        <Box className={guideClasses.grow}>
            <Text fz="sm" fw={500}>
                {title}
            </Text>
            <Text fz="xs" c="dimmed" component="div">
                {detail}
            </Text>
            {children}
        </Box>
    </Group>
);

const HowItWorks: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const [isOpen, { open, close }] = useDisclosure(false);
    const [step, setStep] = useState(0);
    const isLastStep = step === SEMANTIC_LAYER_STEP_COUNT - 1;
    return (
        <>
            <Anchor
                component="button"
                type="button"
                fz="xs"
                onClick={() => {
                    setStep(0);
                    open();
                }}
            >
                How it works
            </Anchor>
            <MantineModal
                opened={isOpen}
                onClose={close}
                title="How the semantic layer works"
                icon={IconLayersLinked}
                cancelLabel={false}
                leftActions={
                    isLastStep ? (
                        <Anchor
                            href={SEMANTIC_LAYER_DOCS_URL}
                            target="_blank"
                            rel="noreferrer"
                            fz="sm"
                        >
                            <Group gap={4} wrap="nowrap">
                                Read the docs
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size={14}
                                />
                            </Group>
                        </Anchor>
                    ) : (
                        <Text fz="xs" c="dimmed">
                            {step + 1} of {SEMANTIC_LAYER_STEP_COUNT}
                        </Text>
                    )
                }
                actions={
                    <Group gap="xs">
                        {step > 0 && (
                            <Button
                                variant="default"
                                onClick={() => setStep(step - 1)}
                            >
                                Back
                            </Button>
                        )}
                        {isLastStep ? (
                            <Button
                                component={Link}
                                to={`/projects/${projectUuid}/metrics`}
                            >
                                Explore your metrics
                            </Button>
                        ) : (
                            <Button onClick={() => setStep(step + 1)}>
                                Next
                            </Button>
                        )}
                    </Group>
                }
            >
                <SemanticLayerExplainer step={step} />
            </MantineModal>
        </>
    );
};

const SemanticLayerDetail: FC<{
    projectUuid: string;
    guide: SetupGuideState;
}> = ({ projectUuid, guide }) => {
    const { activeRun, semanticExplores, completedRunUrl } = guide;
    if (activeRun) {
        return (
            <Group gap={6} wrap="nowrap">
                <Box className={guideClasses.liveDot} aria-hidden />
                {AI_NAME} is drafting models from your tables.
                <Anchor
                    component={Link}
                    to={getAgentOnboardingRunUrl(
                        activeRun.agentOnboardingRunUuid,
                        activeRun.projectUuid,
                    )}
                    fz="xs"
                >
                    Watch
                </Anchor>
            </Group>
        );
    }
    if (semanticExplores.length === 0) {
        const action = guide.sections
            .flatMap(({ rows }) => rows)
            .find(({ id }) => id === 'semantic-layer')?.action;
        return (
            <>
                No metrics yet.{' '}
                {action && (
                    <Anchor component={Link} to={action.to} fz="xs">
                        Define metrics
                    </Anchor>
                )}
            </>
        );
    }
    return (
        <Group gap={6}>
            {plural(semanticExplores.length, 'model')}
            {completedRunUrl && (
                <>
                    {` built by ${AI_NAME}`}
                    <Anchor component={Link} to={completedRunUrl} fz="xs">
                        See how
                    </Anchor>
                </>
            )}
            <HowItWorks projectUuid={projectUuid} />
        </Group>
    );
};

const LiveSourceBlock: FC<{
    projectUuid: string;
    connection: ExternalConnectionListItem;
}> = ({ projectUuid, connection }) => {
    const { data: explores, isError } = useLiveSourceExplores({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const { apiSource } = connection;
    return (
        <SourceBlock
            icon={
                apiSource ? (
                    <LiveSourceIcon connector={apiSource.connector} size={18} />
                ) : (
                    <MantineIcon icon={IconPlugConnected} />
                )
            }
            title={
                apiSource
                    ? getLiveSource(apiSource.connector).label
                    : connection.name
            }
            detail={
                apiSource
                    ? `${getApiSourceTarget(apiSource)}, queried live`
                    : 'Queried live'
            }
        >
            {explores?.length ? (
                <ExploreChips projectUuid={projectUuid} explores={explores} />
            ) : (
                !isError && <Loader size="xs" mt="xs" />
            )}
        </SourceBlock>
    );
};

const toChips = (explores: SummaryExplore[]) =>
    explores.map(({ name, label }) => ({ name, label }));

/** What is connected and modelled, each a way into building something */
export const YourData: FC<{
    projectUuid: string;
    actions: RecommendedActionsState;
    guide: SetupGuideState;
}> = ({ projectUuid, actions, guide }) => {
    const warehouse = actions.statuses['connect-warehouse'];
    if (!warehouse.isComplete) return null;
    return (
        <Paper p="md" className={classes.panel}>
            <Group justify="space-between" wrap="nowrap" mb="xs">
                <Text fz="sm" fw={500}>
                    Your data
                </Text>
                <Text fz="xs" c="dimmed" truncate>
                    Open a model to build a chart, or ask about it above
                </Text>
            </Group>
            <SourceBlock
                icon={warehouse.doneIcon ?? <MantineIcon icon={IconDatabase} />}
                title={warehouse.annotation ?? 'Warehouse'}
                detail={
                    <SemanticLayerDetail
                        projectUuid={projectUuid}
                        guide={guide}
                    />
                }
            >
                {guide.semanticExplores.length > 0 && (
                    <ExploreChips
                        projectUuid={projectUuid}
                        explores={toChips(guide.semanticExplores)}
                    />
                )}
            </SourceBlock>
            {guide.liveConnections.map((connection) => (
                <LiveSourceBlock
                    key={connection.externalConnectionUuid}
                    projectUuid={projectUuid}
                    connection={connection}
                />
            ))}
        </Paper>
    );
};
