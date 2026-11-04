import {
    type ExternalConnectionListItem,
    type SummaryExplore,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Text,
    Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDatabase,
    IconExternalLink,
    IconLayersLinked,
    IconPlugConnected,
    IconTable,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLocalStorage } from 'react-use';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { useLiveSourceExplores } from '../../../../../features/externalConnections/hooks/useLiveSourceExplores';
import { getLiveSource } from '../../../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import useApp from '../../../../../providers/App/useApp';
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
const MAX_CHIPS = 4;

const ExploreChips: FC<{
    projectUuid: string;
    explores: { name: string; label: string }[];
}> = ({ projectUuid, explores }) => (
    <Group gap={6} wrap="nowrap" className={classes.chips}>
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

const SourceRow: FC<{
    icon: ReactNode;
    title: string;
    detail: ReactNode;
    children: ReactNode;
}> = ({ icon, title, detail, children }) => (
    <Group gap="sm" wrap="nowrap" className={classes.row}>
        <Box className={classes.rowIcon}>{icon}</Box>
        <Text fz="sm" fw={500} className={classes.rowTitle}>
            {title}
        </Text>
        <Text fz="xs" c="dimmed" component="div" className={classes.rowDetail}>
            {detail}
        </Text>
        {children}
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
                c="dimmed"
                onClick={() => {
                    setStep(0);
                    open();
                }}
            >
                How models work
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

const SemanticLayerDetail: FC<{ guide: SetupGuideState }> = ({ guide }) => {
    const { activeRun, semanticExplores } = guide;
    if (activeRun) {
        return (
            <Group gap={6} wrap="nowrap">
                <Box className={guideClasses.liveDot} aria-hidden />
                Drafting models
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
        return action ? (
            <Anchor component={Link} to={action.to} fz="xs">
                Add models
            </Anchor>
        ) : (
            'No models yet'
        );
    }
    return plural(semanticExplores.length, 'model');
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
        <SourceRow
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
            detail="Live"
        >
            {explores?.length ? (
                <ExploreChips projectUuid={projectUuid} explores={explores} />
            ) : (
                !isError && <Loader size="xs" />
            )}
        </SourceRow>
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
    const { user } = useApp();
    const [isDismissed, setIsDismissed] = useLocalStorage(
        `homepage-your-data-dismissed-${user.data?.userUuid ?? 'anon'}-${projectUuid}`,
        false,
    );
    const warehouse = actions.statuses['connect-warehouse'];
    if (!warehouse.isComplete || isDismissed) return null;
    return (
        <Paper p="md" className={classes.panel}>
            <Group justify="space-between" wrap="nowrap" mb={4}>
                <Text fz="sm" fw={500}>
                    Explore your data
                </Text>
                <Group gap="xs" wrap="nowrap">
                    {guide.semanticExplores.length > 0 && (
                        <HowItWorks projectUuid={projectUuid} />
                    )}
                    <Tooltip label="Hide">
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            aria-label="Hide your data"
                            onClick={() => setIsDismissed(true)}
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
            <SourceRow
                icon={warehouse.doneIcon ?? <MantineIcon icon={IconDatabase} />}
                title={warehouse.annotation ?? 'Warehouse'}
                detail={<SemanticLayerDetail guide={guide} />}
            >
                {guide.semanticExplores.length > 0 && (
                    <ExploreChips
                        projectUuid={projectUuid}
                        explores={toChips(guide.semanticExplores)}
                    />
                )}
            </SourceRow>
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
