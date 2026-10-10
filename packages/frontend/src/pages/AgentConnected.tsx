import { Anchor, Box, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { Link, useSearchParams } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';

const getFailureReason = (error: string): string => {
    switch (error) {
        case 'not_agent_session':
            return 'Your Snowflake sign-in is not an agent session. Ask your Snowflake admin to set IS_AGENTIC = TRUE on the security integration used for agents.';
        case 'no_refresh_token':
            return 'Snowflake did not return a refresh token. Try again.';
        case 'license_required':
            return 'An enterprise licence is required.';
        default:
            return 'The sign-in did not complete. Try again.';
    }
};

const AgentConnected = () => {
    const [searchParams] = useSearchParams();
    const error = searchParams.get('error');

    return (
        <>
            <DocumentTitle title="Agent connection" />
            <Stack>
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                {error !== null ? (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title="Agent connection failed."
                        description={getFailureReason(error)}
                        action={
                            <Anchor
                                component={Link}
                                to="/generalSettings/myAgentConnections"
                            >
                                Try again from My agent identity
                            </Anchor>
                        }
                    />
                ) : (
                    <SuboptimalState
                        title="Agent connected."
                        description="Go back to your client and run that again."
                    />
                )}
            </Stack>
        </>
    );
};

export default AgentConnected;
