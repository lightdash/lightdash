import { Anchor, Stack } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import Callout from '../../../../../../components/common/Callout';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import AiAgentAdminMemoriesTable from '../AiAgentAdminMemoriesTable';

export const AiMemoriesSettingsPage = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <SettingsPage
            title={t('settings.memories.title')}
            description={t('settings.memories.description')}
        >
            <Stack gap="md">
                <Callout
                    variant="warning"
                    title={t('settings.memories.deprecatedTitle')}
                >
                    <Trans
                        t={t}
                        i18nKey="settings.memories.deprecatedBody"
                        components={{
                            anchor: (
                                <Anchor
                                    href="https://docs.lightdash.com/agents/agent-context"
                                    target="_blank"
                                />
                            ),
                        }}
                    />
                </Callout>
                <AiAgentAdminMemoriesTable />
            </Stack>
        </SettingsPage>
    );
};
