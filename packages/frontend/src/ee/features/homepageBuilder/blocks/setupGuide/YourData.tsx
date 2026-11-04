import { type ExternalConnectionListItem } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Paper,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconArrowRight,
    IconDatabase,
    IconExternalLink,
    IconHelpCircle,
    IconInfoCircle,
    IconLayersLinked,
    IconPlugConnected,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLocalStorage } from 'react-use';
import { AI_NAME } from '../../../../../components/common/aiName';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { getLiveSource } from '../../../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import useApp from '../../../../../providers/App/useApp';
import { getAgentOnboardingRunUrl } from '../../../agentOnboarding/utils';
import { type RecommendedActionsState } from '../useRecommendedActions';
import {
    SEMANTIC_LAYER_STEP_COUNT,
    SemanticLayerExplainer,
} from './SemanticLayerExplainer';
import guideClasses from './SetupGuide.module.css';
import { ChoiceArt } from './StepArt';
import { type SetupGuideState } from './useSetupGuide';
import classes from './YourData.module.css';

const SEMANTIC_LAYER_DOCS_URL = 'https://docs.lightdash.com/semantic-layer';

const SourceTag: FC<{
    icon: ReactNode;
    name: string;
    detail: ReactNode | null;
}> = ({ icon, name, detail }) => (
    <Group gap={6} wrap="nowrap" className={classes.pill}>
        <Box className={classes.sourceIcon}>{icon}</Box>
        <Text fz="xs" fw={500}>
            {name}
        </Text>
        {detail && (
            <Text fz="xs" c="dimmed" component="div">
                {detail}
            </Text>
        )}
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
                <Group gap={4} wrap="nowrap">
                    <MantineIcon icon={IconHelpCircle} size={14} />
                    How models work
                </Group>
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
    return null;
};

const liveSourceTag = (connection: ExternalConnectionListItem) => {
    const { apiSource } = connection;
    return (
        <SourceTag
            key={connection.externalConnectionUuid}
            icon={
                apiSource ? (
                    <LiveSourceIcon connector={apiSource.connector} size={14} />
                ) : (
                    <MantineIcon icon={IconPlugConnected} size={14} />
                )
            }
            name={
                apiSource
                    ? getLiveSource(apiSource.connector).label
                    : connection.name
            }
            detail={null}
        />
    );
};

const PathLabel: FC<{ label: string }> = ({ label }) => (
    <Group justify="space-between" wrap="nowrap" px="sm" py={8}>
        <Text fz="sm" fw={500}>
            {label}
        </Text>
        <MantineIcon icon={IconArrowRight} size={14} color="dimmed" />
    </Group>
);

/** What is connected, and the two ways to start building on it */
export const YourData: FC<{
    projectUuid: string;
    actions: RecommendedActionsState;
    guide: SetupGuideState;
    onAsk: () => void;
}> = ({ projectUuid, actions, guide, onAsk }) => {
    const { user } = useApp();
    const [isDismissed, setIsDismissed] = useLocalStorage(
        `homepage-your-data-dismissed-${user.data?.userUuid ?? 'anon'}-${projectUuid}`,
        false,
    );
    const warehouse = actions.statuses['connect-warehouse'];
    if (!warehouse.isComplete || isDismissed) return null;
    return (
        <Paper p="md" className={classes.panel}>
            <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <MantineIcon
                        icon={IconInfoCircle}
                        size={16}
                        color="dimmed"
                    />
                    <Text fz="sm" fw={600}>
                        Your data is ready to explore
                    </Text>
                </Group>
                <Tooltip label="Hide">
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label="Hide your data"
                        className={classes.hide}
                        onClick={() => setIsDismissed(true)}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Group gap={6} mt="xs">
                <SourceTag
                    icon={
                        warehouse.doneIcon ?? (
                            <MantineIcon icon={IconDatabase} size={14} />
                        )
                    }
                    name={warehouse.annotation ?? 'Warehouse'}
                    detail={
                        guide.activeRun ? (
                            <SemanticLayerDetail guide={guide} />
                        ) : null
                    }
                />
                {guide.liveConnections.map(liveSourceTag)}
            </Group>
            <Box className={classes.paths}>
                <UnstyledButton className={classes.path} onClick={onAsk}>
                    <ChoiceArt kind="ask" />
                    <PathLabel label={`Ask ${AI_NAME}`} />
                </UnstyledButton>
                <Link
                    to={`/projects/${projectUuid}/tables`}
                    className={classes.path}
                >
                    <ChoiceArt kind="explore" />
                    <PathLabel label="Build in Explore" />
                </Link>
            </Box>
            {guide.semanticExplores.length > 0 && (
                <Group justify="flex-end" mt="sm">
                    <HowItWorks projectUuid={projectUuid} />
                </Group>
            )}
        </Paper>
    );
};
