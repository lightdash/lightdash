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
import {
    RecommendedActionsChecklist,
    RecommendedActionsChecklistPlaceholder,
} from './blocks/RecommendedActionsChecklist';
import { useRecommendedActions } from './blocks/useRecommendedActions';
import { DayOneAskInput, DayOneAskInputPlaceholder } from './DayOneAskInput';
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

    // The redirects come first and each still waits for its own input, so a
    // viewer who is about to be sent elsewhere never sees a frame of this page.
    if (
        isInitialLoading ||
        orgSetupPageFlag.isLoading ||
        homepageBuilderFlag.isLoading
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

    // Past the redirects the page is ours to paint, so the rest of the wait is
    // held in place rather than behind a spinner: one answer covers which hero
    // the org gets and what the checklist has to say, and the greeting above
    // never moves because both regions keep their height throughout.
    const isReady = !isCopilotLoading && !actions.isLoading;

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
                        {!isReady ? (
                            // Held at the composer's footprint: it is the
                            // opening this page is designed around, so the
                            // common path resolves without moving at all.
                            <Box w="100%">
                                <DayOneAskInputPlaceholder
                                    projectUuid={null}
                                    hideSuggestions
                                />
                            </Box>
                        ) : isCopilotEnabled ? (
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
                        {isReady ? (
                            actions.hasPendingActions && (
                                <RecommendedActionsChecklist
                                    actions={actions}
                                />
                            )
                        ) : (
                            <RecommendedActionsChecklistPlaceholder
                                actionCount={actions.visibleActions.length}
                            />
                        )}
                    </Stack>
                </Box>
            </Box>
        </Box>
    );
};

export default NoProjectHomepage;
