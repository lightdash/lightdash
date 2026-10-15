import { type EmbedDashboard as EmbedDashboardType } from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import DashboardProvider from '../../providers/Dashboard/DashboardProvider';
import EmbedDashboard from '../features/embed/EmbedDashboard/components/EmbedDashboard';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedDashboardPage: FC<{
    containerStyles?: React.CSSProperties;
    initialDashboard?: EmbedDashboardType;
    isEditMode?: boolean;
    onEditModeChange?: (isEditMode: boolean) => void;
}> = ({ containerStyles, initialDashboard, isEditMode, onEditModeChange }) => {
    const { t } = useTranslation('embed');
    const projectUuidFromParams = useProjectUuid();

    const {
        embedToken,
        languageMap,
        projectUuid: projectUuidFromEmbed,
    } = useEmbed();

    const projectUuid = projectUuidFromEmbed ?? projectUuidFromParams;

    if (!embedToken) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    icon={IconUnlink}
                    title={t('page.invalidLink')}
                />
            </div>
        );
    }

    return (
        <DashboardProvider
            embedToken={embedToken}
            projectUuid={projectUuid}
            parameterLabelOverrides={languageMap?.parameters}
        >
            <EmbedDashboard
                containerStyles={containerStyles}
                initialDashboard={initialDashboard}
                isEditMode={isEditMode}
                onEditModeChange={onEditModeChange}
            />
        </DashboardProvider>
    );
};
export default EmbedDashboardPage;
