import { FeatureFlags } from '@lightdash/common';
import { Box, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { RecommendedActionsChecklist } from './blocks/RecommendedActionsChecklist';
import { useRecommendedActions } from './blocks/useRecommendedActions';
import { DayOneAskInput } from './DayOneAskInput';
import { getGreeting } from './greeting';
import layout from './homepageLayout.module.css';

const NoProjectHomepage: FC = () => {
    const { user } = useApp();
    const { data: organization, isInitialLoading } = useOrganization();
    const orgSetupPageFlag = useServerFeatureFlag(FeatureFlags.NewOnboarding);
    const actions = useRecommendedActions(null);

    if (isInitialLoading || orgSetupPageFlag.isLoading) {
        return <PageSpinner />;
    }

    if (!orgSetupPageFlag.data?.enabled) {
        return <Navigate to="/" replace />;
    }

    if (organization && !organization.needsProject) {
        return <Navigate to="/" replace />;
    }

    return (
        <Box className={layout.page}>
            <Box className={layout.heroSection}>
                <Box className={layout.hero}>
                    <Stack gap={16} align="center" w="100%">
                        <Text
                            component="h1"
                            fz={23}
                            fw={600}
                            lts="-0.02em"
                            lh={1.2}
                            ta="center"
                            m={0}
                        >
                            {getGreeting(user.data?.firstName)}.
                        </Text>
                        <Box w="100%">
                            <DayOneAskInput
                                projectUuid={null}
                                hideSuggestions
                            />
                        </Box>
                        {actions.hasPendingActions && (
                            <RecommendedActionsChecklist
                                projectUuid={null}
                                actions={actions}
                            />
                        )}
                    </Stack>
                </Box>
            </Box>
        </Box>
    );
};

export default NoProjectHomepage;
