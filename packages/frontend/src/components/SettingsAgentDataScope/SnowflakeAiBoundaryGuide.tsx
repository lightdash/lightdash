import { Box, Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconShieldCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { CopyActionIcon } from '../common/CopyActionIcon';
import EmptyStateLoader from '../common/EmptyStateLoader';
import InlineErrorState from '../common/InlineErrorState';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { GuideChecklist } from './GuideChecklist';
import { GuideLimitations, GuideOverview } from './GuideOverview';
import { GuideSection } from './GuideSection';
import { RestrictionsStep } from './RestrictionsStep';
import { getBoundarySecuritySummary } from './snowflakeAiBoundaryStatus';
import { useBoundaryGuide } from './useBoundaryGuide';

export type BoundaryGuideProps = {
    projectUuid: string;
    isSnowflake: boolean;
    showAiAccessRestrictions: boolean;
};

export const SnowflakeAiBoundaryGuide = (props: BoundaryGuideProps) => {
    const guide = useBoundaryGuide(props);
    const [opened, setOpened] = useState(['how']);
    const [reviewVerified, setReviewVerified] = useState(false);
    const toggle = (id: string, open: boolean) =>
        setOpened((value) =>
            open
                ? [...new Set([...value, id])]
                : value.filter((item) => item !== id),
        );
    const openFix = (id: string) => {
        toggle(id, true);
        requestAnimationFrame(() => {
            const element = document.getElementById(`boundary-${id}`);
            element?.focus();
            element?.scrollIntoView({ block: 'center' });
        });
    };
    if (!props.isSnowflake) return null;
    const data = guide.config.data;
    return (
        <Stack gap="lg">
            <Box id="boundary-restrictions" tabIndex={-1}>
                <RestrictionsStep
                    guide={guide}
                    projectUuid={props.projectUuid}
                    available={props.showAiAccessRestrictions}
                />
            </Box>
            <SettingsCard p="xl">
                <Stack gap="lg">
                    <Group justify="space-between">
                        <Group gap="xs">
                            <MantineIcon
                                icon={IconShieldCheck}
                                color="indigo"
                            />
                            <Title order={5}>Snowflake AI boundary guide</Title>
                        </Group>
                        {data && (
                            <CopyActionIcon
                                value={getBoundarySecuritySummary(data)}
                                copyLabel="Copy summary for security review"
                            />
                        )}
                    </Group>
                    {guide.config.isInitialLoading && (
                        <EmptyStateLoader title="Loading boundary guide" />
                    )}
                    {guide.config.isError && (
                        <InlineErrorState
                            message="Could not load the boundary guide."
                            onRetry={() => void guide.config.refetch()}
                        />
                    )}
                    {guide.mark.isError && (
                        <InlineErrorState message="Could not save your confirmation." />
                    )}
                    {data &&
                        (data.boundaryVerified && !reviewVerified ? (
                            <Group justify="space-between">
                                <Text size="sm">
                                    Boundary verified on{' '}
                                    {data.state.lastTest &&
                                        new Date(
                                            data.state.lastTest.at,
                                        ).toLocaleDateString()}{' '}
                                    by {data.state.lastTest?.name}
                                </Text>
                                <Button
                                    variant="default"
                                    size="xs"
                                    onClick={() => {
                                        setReviewVerified(true);
                                        toggle('checks', true);
                                    }}
                                >
                                    Run checks again
                                </Button>
                            </Group>
                        ) : (
                            <>
                                <GuideSection
                                    id="how"
                                    title="How this works"
                                    summary="You control Snowflake. Lightdash generates SQL and checks the boundary."
                                    status={null}
                                    isOpen={opened.includes('how')}
                                    onToggle={(open) => toggle('how', open)}
                                >
                                    <GuideOverview />
                                </GuideSection>
                                <GuideChecklist
                                    guide={guide}
                                    projectUuid={props.projectUuid}
                                    opened={opened}
                                    onToggle={toggle}
                                    onFix={openFix}
                                />
                                <GuideSection
                                    id="limitations"
                                    title="What this does not cover"
                                    summary="Review the limits of scopes, earlier results and user policies."
                                    status={null}
                                    isOpen={opened.includes('limitations')}
                                    onToggle={(open) =>
                                        toggle('limitations', open)
                                    }
                                >
                                    <GuideLimitations />
                                </GuideSection>
                            </>
                        ))}
                </Stack>
            </SettingsCard>
        </Stack>
    );
};
