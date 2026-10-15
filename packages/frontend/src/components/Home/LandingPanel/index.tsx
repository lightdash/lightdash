import { subject } from '@casl/ability';
import { Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { EventName } from '../../../types/Events';
import MantineLinkButton from '../../common/MantineLinkButton';

interface Props {
    userName: string | undefined;
    projectUuid: string;
    projectUrlIdentifier: string;
}

const LandingPanel: FC<Props> = ({
    userName,
    projectUuid,
    projectUrlIdentifier,
}) => {
    const { t } = useTranslation('home');
    const { user } = useApp();
    return (
        <Group justify="space-between" my="xl">
            <Stack justify="flex-start" gap="xs">
                <Title order={3}>
                    {userName
                        ? t('landing.welcomeUser', { name: userName })
                        : t('landing.welcome')}{' '}
                    ⚡️
                </Title>
                <Text c="ldGray.7">{t('landing.subtitle')}</Text>
            </Stack>
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                <MantineLinkButton
                    href={`/projects/${projectUrlIdentifier}/tables`}
                    trackingEvent={{
                        name: EventName.LANDING_RUN_QUERY_CLICKED,
                        properties: {
                            organizationId: user.data?.organizationUuid || '',
                            projectId: projectUuid,
                        },
                    }}
                >
                    {t('landing.runQuery')}
                </MantineLinkButton>
            </Can>
        </Group>
    );
};

export default LandingPanel;
