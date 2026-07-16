import { Box, Stack, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { Navigate } from 'react-router';
import PageSpinner from '../../../components/PageSpinner';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useApp from '../../../providers/App/useApp';
import { RecommendedActionsChecklist } from './blocks/RecommendedActionsChecklist';
import { DayOneAskInput } from './DayOneAskInput';
import { getGreeting } from './greeting';
import layout from './homepageLayout.module.css';

const NoProjectHomepage: FC = () => {
    const { user } = useApp();
    const { data: organization, isInitialLoading } = useOrganization();

    if (isInitialLoading) {
        return <PageSpinner />;
    }

    if (organization && !organization.needsProject) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className={layout.page}>
            <div className={layout.heroSection}>
                <div className={layout.hero}>
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
                        <RecommendedActionsChecklist projectUuid={null} />
                    </Stack>
                </div>
            </div>
        </div>
    );
};

export default NoProjectHomepage;
