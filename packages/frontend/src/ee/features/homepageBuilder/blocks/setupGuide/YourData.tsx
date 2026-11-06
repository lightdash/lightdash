import {
    type AgentOnboardingRun,
    type ExternalConnectionListItem,
} from '@lightdash/common';
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
    IconCircleDashed,
    IconDatabase,
    IconExternalLink,
    IconHelpCircle,
    IconLayersLinked,
    IconPlugConnected,
    IconX,
} from '@tabler/icons-react';
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLocalStorage } from 'react-use';
import { AI_NAME } from '../../../../../components/common/aiName';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { WarehouseLogoStack } from '../../../../../components/ProjectConnection/ProjectConnectFlow/WarehouseLogoStack';
import { getLiveSource } from '../../../../../features/externalConnections/liveSources/liveSourceCatalog';
import { LiveSourceIcon } from '../../../../../features/externalConnections/liveSources/LiveSourceIcon';
import useApp from '../../../../../providers/App/useApp';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { getAgentOnboardingRunUrl } from '../../../agentOnboarding/utils';
import { useCanManageProject } from '../../hooks/useHomepageAbilities';
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

type ModalAction = { label: string; to: string };

const SemanticLayerModal: FC<{
    opened: boolean;
    onClose: () => void;
    finalAction: ModalAction | null;
}> = ({ opened, onClose, finalAction }) => {
    const [step, setStep] = useState(0);
    const isLastStep = step === SEMANTIC_LAYER_STEP_COUNT - 1;
    const handleClose = () => {
        setStep(0);
        onClose();
    };
    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
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
                            <MantineIcon icon={IconExternalLink} size={14} />
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
                        finalAction && (
                            <Button component={Link} to={finalAction.to}>
                                {finalAction.label}
                            </Button>
                        )
                    ) : (
                        <Button onClick={() => setStep(step + 1)}>Next</Button>
                    )}
                </Group>
            }
        >
            <SemanticLayerExplainer step={step} />
        </MantineModal>
    );
};

const HowItWorks: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const [isOpen, { open, close }] = useDisclosure(false);
    return (
        <>
            <Anchor
                component="button"
                type="button"
                fz="xs"
                c="dimmed"
                onClick={open}
            >
                <Group gap={4} wrap="nowrap">
                    <MantineIcon icon={IconHelpCircle} size={14} />
                    How models work
                </Group>
            </Anchor>
            <SemanticLayerModal
                opened={isOpen}
                onClose={close}
                finalAction={{
                    label: 'Explore your metrics',
                    to: `/projects/${projectUuid}/metrics`,
                }}
            />
        </>
    );
};

const StepText: FC<{ title: string; description: string }> = ({
    title,
    description,
}) => (
    <Box flex={1}>
        <Text fz="sm" fw={500}>
            {title}
        </Text>
        <Text fz="xs" c="dimmed">
            {description}
        </Text>
    </Box>
);

/** What a warehouse and a semantic layer would add, for projects running on live sources */
const NextSteps: FC<{
    warehouseUrl: string | null;
    semanticLayer: { finalAction: ModalAction | null } | null;
}> = ({ warehouseUrl, semanticLayer }) => {
    const [isModalOpen, { open, close }] = useDisclosure(false);
    if (!warehouseUrl && !semanticLayer) return null;
    return (
        <Box className={classes.nextSteps}>
            <Text fz="xs" c="dimmed" className={classes.nextStepsLabel}>
                When you're ready
            </Text>
            {warehouseUrl && (
                <Link to={warehouseUrl} className={classes.nextStep}>
                    <MantineIcon icon={IconCircleDashed} color="dimmed" />
                    <StepText
                        title="Connect a warehouse"
                        description="Chart your own tables next to your tool data."
                    />
                    <WarehouseLogoStack size="sm" monochrome />
                </Link>
            )}
            {semanticLayer && (
                <>
                    <UnstyledButton className={classes.nextStep} onClick={open}>
                        <MantineIcon icon={IconCircleDashed} color="dimmed" />
                        <StepText
                            title="Add a semantic layer"
                            description="Define metrics once so every chart and answer uses the same numbers."
                        />
                        <Text fz="xs" c="dimmed" className={classes.nowrap}>
                            How it works
                        </Text>
                    </UnstyledButton>
                    <SemanticLayerModal
                        opened={isModalOpen}
                        onClose={close}
                        finalAction={semanticLayer.finalAction}
                    />
                </>
            )}
        </Box>
    );
};

const DraftingModelsDetail: FC<{ run: AgentOnboardingRun }> = ({ run }) => (
    <Group gap={6} wrap="nowrap">
        <Box className={guideClasses.liveDot} aria-hidden />
        Drafting models
        <Anchor
            component={Link}
            to={getAgentOnboardingRunUrl(
                run.agentOnboardingRunUuid,
                run.projectUuid,
            )}
            fz="xs"
        >
            Watch
        </Anchor>
    </Group>
);

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

const PathLabel: FC<{ label: string; description: string }> = ({
    label,
    description,
}) => (
    <Group justify="space-between" wrap="nowrap" px="sm" py={10}>
        <Box>
            <Text fz="sm" fw={500}>
                {label}
            </Text>
            <Text fz="xs" c="dimmed">
                {description}
            </Text>
        </Box>
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
    const { track } = useTracking();
    const warehouse = actions.statuses['connect-warehouse'];
    const semanticLayerStatus = actions.statuses['add-semantic-layer'];
    const canConnectWarehouse = useCanManageProject(projectUuid);
    // Live sources compile into explores, so charts work before a warehouse
    const isShown =
        (warehouse.isComplete || guide.liveConnections.length > 0) &&
        !isDismissed;
    const bannerProperties = {
        surface: 'first_chart_banner',
        projectId: projectUuid,
        rowId: 'first-chart',
        actionKey: null,
    } as const;
    const hasTrackedImpression = useRef(false);
    useEffect(() => {
        if (!isShown || hasTrackedImpression.current) return;
        hasTrackedImpression.current = true;
        track({
            name: EventName.HOMEPAGE_RECOMMENDED_ACTION_IMPRESSION,
            properties: {
                surface: 'first_chart_banner',
                projectId: projectUuid,
                rowId: 'first-chart',
                actionKey: null,
                choice: null,
            },
        });
    }, [isShown, track, projectUuid]);
    const trackChoice = (
        choice: 'ask' | 'explore',
        destination: string | null,
    ) =>
        track({
            name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
            properties: { ...bannerProperties, choice, destination },
        });
    const exploreTo = `/projects/${projectUuid}/tables`;
    if (!isShown) return null;
    return (
        <Paper p="md" className={classes.panel}>
            <Group justify="space-between" align="center" wrap="nowrap">
                <Box>
                    <Text fz="sm" fw={600}>
                        {(guide.chartCount ?? 0) > 0
                            ? 'Build a chart'
                            : 'Build your first chart'}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Save it to share with your team or add it to a
                        dashboard.
                    </Text>
                </Box>
                <Tooltip label="Hide">
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label="Hide this card"
                        className={classes.hide}
                        onClick={() => {
                            setIsDismissed(true);
                            track({
                                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_SKIPPED,
                                properties: {
                                    ...bannerProperties,
                                    choice: null,
                                },
                            });
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Box className={classes.paths}>
                <UnstyledButton
                    className={classes.path}
                    onClick={() => {
                        trackChoice('ask', null);
                        onAsk();
                    }}
                >
                    <ChoiceArt kind="ask" />
                    <PathLabel
                        label={`Ask ${AI_NAME}`}
                        description="Ask in plain words, get a chart back."
                    />
                </UnstyledButton>
                <Link
                    to={exploreTo}
                    className={classes.path}
                    onClick={() => trackChoice('explore', exploreTo)}
                >
                    <ChoiceArt kind="explore" />
                    <PathLabel
                        label="Build in Explore"
                        description="Pick fields, then choose a chart type."
                    />
                </Link>
            </Box>
            <Group justify="space-between" mt="sm" gap="sm">
                <Group gap={6}>
                    <Text fz="xs" c="dimmed" mr={2}>
                        Using
                    </Text>
                    {warehouse.isComplete && (
                        <SourceTag
                            icon={
                                warehouse.doneIcon ?? (
                                    <MantineIcon
                                        icon={IconDatabase}
                                        size={14}
                                    />
                                )
                            }
                            name={warehouse.annotation ?? 'Warehouse'}
                            detail={
                                guide.activeRun ? (
                                    <DraftingModelsDetail
                                        run={guide.activeRun}
                                    />
                                ) : null
                            }
                        />
                    )}
                    {guide.liveConnections.map(liveSourceTag)}
                </Group>
                {guide.semanticExplores.length > 0 && (
                    <HowItWorks projectUuid={projectUuid} />
                )}
            </Group>
            <NextSteps
                warehouseUrl={
                    !warehouse.isComplete && canConnectWarehouse
                        ? warehouse.url
                        : null
                }
                semanticLayer={
                    guide.semanticExplores.length === 0 && !guide.activeRun
                        ? {
                              finalAction: !canConnectWarehouse
                                  ? null
                                  : warehouse.isComplete
                                    ? {
                                          label: semanticLayerStatus.ctaLabel,
                                          to: semanticLayerStatus.url,
                                      }
                                    : {
                                          label: 'Connect a warehouse',
                                          to: warehouse.url,
                                      },
                          }
                        : null
                }
            />
        </Paper>
    );
};
