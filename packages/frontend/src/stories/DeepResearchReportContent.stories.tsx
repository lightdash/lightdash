import { type ParsedDeepResearchReport } from '@lightdash/common';
import {
    Box,
    Center,
    Loader,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import Callout from '../components/common/Callout';
import { DeepResearchReportContent } from '../ee/features/aiCopilot/components/DeepResearch/DeepResearchReportContent';

const report: ParsedDeepResearchReport = {
    title: 'Reliability Drove Retention Losses',
    introductionMarkdown:
        'Enterprise retention fell because unresolved reliability incidents coincided with several large renewals. One account has incomplete support sentiment, but the pattern is concentrated enough to make renewal reliability the central story.',
    findings: [
        {
            title: 'Reliability drove the decline',
            evidenceQueryUuid: 'chart-1',
            interpretationMarkdown:
                'Losses cluster among incident-exposed accounts, making reliability the strongest tested explanation rather than a broad commercial slowdown. The evidence is observational, so the useful next step is to compare incident timing with renewal decisions for the affected cohort.',
        },
        {
            title: 'Adoption was not the cause',
            evidenceQueryUuid: null,
            interpretationMarkdown:
                'Adoption improved after most renewal decisions had already been made. It remains a useful health signal for retained customers, but it does not explain the losses in this cohort.',
        },
    ],
    conclusionMarkdown:
        'Reliability at renewal is the clearest intervention point. Prioritize incident resolution for accounts entering their renewal window, then track whether the retention gap narrows.',
};

const SimulatedChart = () => {
    const theme = useMantineTheme();
    const bars = [42, 68, 52, 86, 73, 94];

    return (
        <Stack h="100%" gap="lg">
            <Text fw={650}>Renewal rate by incident exposure</Text>
            <Box
                role="img"
                aria-label="Simulated renewal rate chart"
                style={{
                    display: 'flex',
                    alignItems: 'end',
                    gap: theme.spacing.md,
                    flex: 1,
                    minHeight: 220,
                    padding: `${theme.spacing.lg} ${theme.spacing.md}`,
                    borderBottom: `1px solid ${theme.colors.gray[3]}`,
                }}
            >
                {bars.map((height, index) => (
                    <Box
                        key={index}
                        style={{
                            width: '100%',
                            height: `${height}%`,
                            borderRadius: `${theme.radius.sm} ${theme.radius.sm} 0 0`,
                            background:
                                index > 3
                                    ? theme.colors.indigo[6]
                                    : theme.colors.indigo[3],
                        }}
                    />
                ))}
            </Box>
        </Stack>
    );
};

const meta: Meta<typeof DeepResearchReportContent> = {
    component: DeepResearchReportContent,
    parameters: {
        layout: 'fullscreen',
        chromatic: { viewports: [390, 900, 1440] },
    },
    decorators: [
        (Story) => (
            <Box p={{ base: 'md', md: 'xl' }} maw={1280} mx="auto">
                <Story />
            </Box>
        ),
    ],
    args: {
        report,
        projectUuid: 'project-1',
        runUuid: 'run-1',
    },
};

export default meta;

type Story = StoryObj<typeof DeepResearchReportContent>;

export const ResponsiveReport: Story = {
    args: { renderEvidence: () => <SimulatedChart /> },
};

export const LoadingEvidence: Story = {
    args: {
        renderEvidence: () => (
            <Center mih={220}>
                <Stack align="center" gap="sm">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                        Loading live chart data
                    </Text>
                </Stack>
            </Center>
        ),
    },
};

export const UnavailableEvidence: Story = {
    args: {
        renderEvidence: () => (
            <Callout variant="warning" title="Chart unavailable">
                The live data for this chart could not be loaded. The finding’s
                interpretation remains available.
            </Callout>
        ),
    },
};
