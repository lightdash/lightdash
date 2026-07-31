import { FeatureFlags } from '@lightdash/common';
import { Box, Button, Stack, Text } from '@mantine-8/core';
import { IconDatabase } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, Navigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import PageSpinner from '../../../components/PageSpinner';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useIsCopilotEnabled } from '../aiCopilot/hooks/useIsCopilotEnabled';
import { RecommendedActionsChecklist } from './blocks/RecommendedActionsChecklist';
import { useRecommendedActions } from './blocks/useRecommendedActions';
import { DayOneAskInput } from './DayOneAskInput';
import layout from './homepageLayout.module.css';
import HomepageStars from './HomepageStars';
import { useHomepageBuilderFlag } from './hooks/useProjectHomepage';

const NoProjectHomepage: FC = () => {
    const { data: organization, isInitialLoading } = useOrganization();
    const orgSetupPageFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const homepageBuilderFlag = useHomepageBuilderFlag();
    const { isCopilotEnabled, isLoading: isCopilotLoading } =
        useIsCopilotEnabled();
    const actions = useRecommendedActions(null);

    if (
        isInitialLoading ||
        orgSetupPageFlag.isLoading ||
        homepageBuilderFlag.isLoading ||
        isCopilotLoading
    ) {
        return <PageSpinner />;
    }

    if (!orgSetupPageFlag.data?.enabled) {
        return <Navigate to="/" replace />;
    }

    if (!homepageBuilderFlag.isEnabled) {
        return <Navigate to="/" replace />;
    }

    if (organization && !organization.needsProject) {
        return <Navigate to="/" replace />;
    }

    // Without copilot the composer would be a teaser for something the org
    // can't use — connecting a warehouse becomes the headline act instead.
    const connectWarehouse = actions.statuses['connect-warehouse'];

    return (
        <Box className={layout.page}>
            <Box className={`${layout.heroSection} ${layout.heroStage}`}>
                <HomepageStars />
                <Box className={`${layout.hero} ${layout.heroStageContent}`}>
                    <Stack gap={16} align="center" w="100%">
                        <Text component="h1" className={layout.heroGreeting}>
                            Let's get started
                        </Text>
                        {isCopilotEnabled ? (
                            <Box w="100%">
                                <DayOneAskInput
                                    projectUuid={null}
                                    hideSuggestions
                                />
                            </Box>
                        ) : (
                            <Stack gap={14} align="center">
                                <Text c="dimmed" fz={15} ta="center" maw={420}>
                                    Connect your data warehouse to start
                                    exploring and building dashboards.
                                </Text>
                                {/* The checklist below already leads with this
                                    step whenever it renders */}
                                {!actions.hasPendingActions && (
                                    <Button
                                        component={Link}
                                        to={connectWarehouse.url}
                                        size="md"
                                        leftSection={
                                            <MantineIcon icon={IconDatabase} />
                                        }
                                    >
                                        Connect a data warehouse
                                    </Button>
                                )}
                            </Stack>
                        )}
                        {actions.hasPendingActions && (
                            <RecommendedActionsChecklist actions={actions} />
                        )}
                    </Stack>
                </Box>
            </Box>
        </Box>
    );
};

export default NoProjectHomepage;
