import { type AiAgentAdminEvalSummary } from '@lightdash/common';
import { Drawer } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminEvalsTable from '../AiAgentAdminEvalsTable';
import { EvalPreviewSidebar } from '../EvalPreviewSidebar';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

export const AiEvalsSettingsPage = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { data: settings } = useAiOrganizationSettings();

    const [selectedEval, setSelectedEval] =
        useState<AiAgentAdminEvalSummary | null>(null);

    return (
        <SettingsPage
            title={t('settings.evals.title')}
            description={t('settings.evals.description')}
        >
            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentAdminEvalsTable
                selectedEval={selectedEval}
                onEvalSelect={setSelectedEval}
            />

            <Drawer
                opened={!!selectedEval}
                onClose={() => setSelectedEval(null)}
                position="right"
                size="lg"
                withCloseButton={false}
                padding={0}
                classNames={{
                    inner: drawerClasses.inner,
                    overlay: drawerClasses.overlay,
                }}
                __vars={{
                    '--drawer-top-offset': `${NAVBAR_HEIGHT}px`,
                }}
            >
                {selectedEval && (
                    <EvalPreviewSidebar
                        evalSummary={selectedEval}
                        onClose={() => setSelectedEval(null)}
                    />
                )}
            </Drawer>
        </SettingsPage>
    );
};
