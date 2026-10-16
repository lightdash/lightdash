import { Anchor, Box, Stack } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';

const getFailureReason = (error: string, t: TFunction): string => {
    switch (error) {
        case 'not_agent_session':
            return t('agentConnected.errors.notAgentSession');
        case 'no_refresh_token':
            return t('agentConnected.errors.noRefreshToken');
        case 'license_required':
            return t('agentConnected.errors.licenseRequired');
        default:
            return t('agentConnected.errors.default');
    }
};

const AgentConnected = () => {
    const { t } = useTranslation('pages');
    const [searchParams] = useSearchParams();
    const error = searchParams.get('error');

    return (
        <>
            <DocumentTitle title={t('agentConnected.documentTitle')} />
            <Stack>
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                {error !== null ? (
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={t('agentConnected.failed')}
                        description={getFailureReason(error, t)}
                        action={
                            <Anchor
                                component={Link}
                                to="/generalSettings/myAgentConnections"
                            >
                                {t('agentConnected.tryAgain')}
                            </Anchor>
                        }
                    />
                ) : (
                    <SuboptimalState
                        title={t('agentConnected.connected')}
                        description={t('agentConnected.connectedDescription')}
                    />
                )}
            </Stack>
        </>
    );
};

export default AgentConnected;
