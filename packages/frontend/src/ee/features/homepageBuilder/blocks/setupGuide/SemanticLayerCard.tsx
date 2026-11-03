import { ActionIcon, Anchor, Box, Button, Group, Text } from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import { IconExternalLink, IconLayersLinked, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { getAgentOnboardingDashboardUrl } from '../../../agentOnboarding/utils';
import { SemanticLayerExplainer } from './SemanticLayerExplainer';
import classes from './SetupGuide.module.css';
import { type SetupGuideRow } from './setupGuideModel';
import { StepArt } from './StepArt';

const SEMANTIC_LAYER_DOCS_URL = 'https://docs.lightdash.com/semantic-layer';

export const SemanticLayerCard: FC<{
    projectUuid: string;
    semanticLayer: SetupGuideRow;
    hasStarterDashboard: boolean;
}> = ({ projectUuid, semanticLayer, hasStarterDashboard }) => {
    const isEmbedded = useIsEmbedded();
    const [isModalOpen, { open, close }] = useDisclosure(false);
    const [isDismissed, setIsDismissed] = useLocalStorage({
        key: `ld.setupGuide.auroraResult.${projectUuid}`,
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    if (isDismissed) return null;
    return (
        <Box className={classes.next} pos="relative">
            <StepArt
                id="semantic-layer"
                badge={semanticLayer.evidence?.text ?? 'Ready'}
                size="lg"
            />
            <ActionIcon
                size="sm"
                aria-label="Dismiss"
                className={classes.lessonDismiss}
                onClick={() => setIsDismissed(true)}
            >
                <MantineIcon icon={IconX} size={14} />
            </ActionIcon>
            <Box className={classes.nextBody}>
                <Text fw={600}>Your semantic layer is ready</Text>
                <Text fz="sm" c="dimmed">
                    Metrics are defined once, so every chart and answer uses the
                    same numbers.{' '}
                    <Anchor component="button" fz="sm" onClick={open}>
                        How it works
                    </Anchor>
                </Text>
                <Group gap={4} wrap="nowrap" mt="auto" pt="sm">
                    <Button
                        size="xs"
                        component={Link}
                        to={
                            semanticLayer.action?.to ??
                            `/projects/${projectUuid}/tables`
                        }
                    >
                        Explore your metrics
                    </Button>
                    {hasStarterDashboard && (
                        <Button
                            size="xs"
                            variant="subtle"
                            color="gray"
                            component={Link}
                            to={getAgentOnboardingDashboardUrl(projectUuid)}
                        >
                            Open starter dashboard
                        </Button>
                    )}
                </Group>
            </Box>
            <MantineModal
                opened={isModalOpen}
                onClose={close}
                title="How the semantic layer works"
                icon={IconLayersLinked}
                cancelLabel="Close"
                leftActions={
                    !isEmbedded && (
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
                    )
                }
            >
                <SemanticLayerExplainer />
            </MantineModal>
        </Box>
    );
};
