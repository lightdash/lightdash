import { ActionIcon, Anchor, Box, Button, Group, Text } from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import { IconExternalLink, IconLayersLinked, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import {
    SEMANTIC_LAYER_STEP_COUNT,
    SemanticLayerExplainer,
} from './SemanticLayerExplainer';
import classes from './SetupGuide.module.css';
import { type SetupGuideRow } from './setupGuideModel';
import { StepArt } from './StepArt';

const SEMANTIC_LAYER_DOCS_URL = 'https://docs.lightdash.com/semantic-layer';

export const SemanticLayerCard: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const isEmbedded = useIsEmbedded();
    const [isModalOpen, { open, close }] = useDisclosure(false);
    const [step, setStep] = useState(0);
    const isLastStep = step === SEMANTIC_LAYER_STEP_COUNT - 1;
    const [isDismissed, setIsDismissed] = useLocalStorage({
        key: `ld.setupGuide.auroraResult.${projectUuid}`,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    if (isDismissed) return null;
    return (
        <Box className={classes.next} pos="relative">
            <StepArt id="semantic-layer" badge={null} size="lg" />
            <ActionIcon
                size="sm"
                aria-label="Dismiss"
                className={classes.lessonDismiss}
                onClick={() => setIsDismissed(true)}
            >
                <MantineIcon icon={IconX} size={14} />
            </ActionIcon>
            <Box className={classes.nextBody}>
                <Text fz="sm" fw={600}>
                    Your semantic layer is ready
                </Text>
                <Text fz="xs" c="dimmed">
                    One definition behind every chart and answer.
                </Text>
                <Group justify="space-between" wrap="nowrap" mt="auto" pt="sm">
                    <Button
                        size="xs"
                        component={Link}
                        to={`/projects/${projectUuid}/metrics`}
                    >
                        Explore
                    </Button>
                    <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => {
                            setStep(0);
                            open();
                        }}
                    >
                        Learn
                    </Button>
                </Group>
            </Box>
            <MantineModal
                opened={isModalOpen}
                onClose={close}
                title="How the semantic layer works"
                icon={IconLayersLinked}
                cancelLabel={false}
                leftActions={
                    isLastStep && !isEmbedded ? (
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
        </Box>
    );
};

export const StarterDashboardCard: FC<{
    projectUuid: string;
    starterDashboard: SetupGuideRow;
}> = ({ projectUuid, starterDashboard }) => {
    const [isDismissed, setIsDismissed] = useLocalStorage({
        key: `ld.setupGuide.starterDashboard.${projectUuid}`,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    if (isDismissed || !starterDashboard.action) return null;
    return (
        <Box className={classes.next} pos="relative">
            <StepArt id="starter-dashboard" badge={null} size="lg" />
            <ActionIcon
                size="sm"
                aria-label="Dismiss"
                className={classes.lessonDismiss}
                onClick={() => setIsDismissed(true)}
            >
                <MantineIcon icon={IconX} size={14} />
            </ActionIcon>
            <Box className={classes.nextBody}>
                <Text fz="sm" fw={600}>
                    Your starter dashboard is ready
                </Text>
                <Text fz="xs" c="dimmed">
                    Charts on your new metrics, ready to share.
                </Text>
                <Group gap={4} wrap="nowrap" mt="auto" pt="sm">
                    <Button
                        size="xs"
                        variant="default"
                        component={Link}
                        to={starterDashboard.action.to}
                    >
                        Open
                    </Button>
                </Group>
            </Box>
        </Box>
    );
};
