import { type AiAgentAdminEvalSummary } from '@lightdash/common';
import { Drawer } from '@mantine-8/core';
import { useState } from 'react';
import { NAVBAR_HEIGHT } from '../../../../../../components/common/Page/constants';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminEvalsTable from '../AiAgentAdminEvalsTable';
import { EvalPreviewSidebar } from '../EvalPreviewSidebar';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';
import drawerClasses from './ThreadPreviewDrawer.module.css';

export const AiEvalsSettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();

    const [selectedEval, setSelectedEval] =
        useState<AiAgentAdminEvalSummary | null>(null);

    return (
        <SettingsPage
            title="Evals"
            description="Monitor agent evaluations across your organization."
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
