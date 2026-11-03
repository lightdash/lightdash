import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import {
    IconExternalLink,
    IconInfoCircle,
    IconLayersLinked,
    IconX,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import useIsEmbedded from '../../../../providers/Embed/useIsEmbedded';
import { getAgentOnboardingDashboardUrl } from '../../../agentOnboarding/utils';
import classes from './SetupGuide.module.css';
import { type SetupGuideRow } from './setupGuideModel';
import { StepArt } from './StepArt';

const SEMANTIC_LAYER_DOCS_URL = 'https://docs.lightdash.com/semantic-layer';

const PARTS: { key: string; term: string; detail: string }[] = [
    {
        key: 'metrics',
        term: 'Metrics',
        detail: 'The numbers you track, like revenue or order count.',
    },
    {
        key: 'dimensions',
        term: 'Dimensions',
        detail: 'What you slice them by, like date, region or status.',
    },
    {
        key: 'code',
        term: 'Defined in code',
        detail: 'Kept in YAML next to your models, so changes are reviewed like any other code.',
    },
];

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
                <UnstyledButton className={classes.lessonToggle} onClick={open}>
                    <MantineIcon icon={IconInfoCircle} size={14} />
                    How it works
                </UnstyledButton>
                <Group
                    gap="sm"
                    wrap="nowrap"
                    mt="auto"
                    pt="sm"
                    justify="space-between"
                >
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
                        <Anchor
                            component={Link}
                            to={getAgentOnboardingDashboardUrl(projectUuid)}
                            fz="xs"
                            c="dimmed"
                        >
                            Open starter dashboard
                        </Anchor>
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
                <Stack gap="md">
                    <Text fz="sm" c="dimmed">
                        Your metrics are defined once on top of your tables.
                        Every chart, dashboard and Aurora answer uses those
                        definitions, so the same question always gets the same
                        number.
                    </Text>
                    {PARTS.map(({ key, term, detail }) => (
                        <Box key={key}>
                            <Text fz="sm" fw={500}>
                                {term}
                            </Text>
                            <Text fz="sm" c="dimmed">
                                {detail}
                            </Text>
                        </Box>
                    ))}
                </Stack>
            </MantineModal>
        </Box>
    );
};
