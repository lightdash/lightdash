import { Box } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import EmbedApp from '../features/embed/EmbedApp/components/EmbedApp';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedAppPage: FC = () => {
    const { t } = useTranslation('embed');
    const { appUuid: appUuidFromParams } = useParams<{ appUuid?: string }>();
    const { embedToken, projectUuid, appUuid: appUuidFromContext } = useEmbed();

    // Prefer the embed-context value (SDK mode) over the URL param, mirroring
    // EmbedChart — SDK customers may have an unrelated appUuid in their app URL.
    const appUuid = appUuidFromContext ?? appUuidFromParams;

    if (!embedToken) {
        return (
            <Box mt="md">
                <SuboptimalState
                    icon={IconUnlink}
                    title={t('page.invalidLink')}
                />
            </Box>
        );
    }

    if (!projectUuid || !appUuid) {
        return (
            <Box mt="md">
                <SuboptimalState
                    icon={IconUnlink}
                    title={t('page.missingAppId')}
                />
            </Box>
        );
    }

    return <EmbedApp appUuid={appUuid} projectUuid={projectUuid} />;
};

export default EmbedAppPage;
