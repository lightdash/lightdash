import { type EmbedDashboard as EmbedDashboardType } from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import DashboardProvider from '../../providers/Dashboard/DashboardProvider';
import EmbedDashboard from '../features/embed/EmbedDashboard/components/EmbedDashboard';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedDashboardPage: FC<{
    containerStyles?: React.CSSProperties;
    initialDashboard?: EmbedDashboardType;
    isEditMode?: boolean;
    onEditModeChange?: (isEditMode: boolean) => void;
}> = ({ containerStyles, initialDashboard, isEditMode, onEditModeChange }) => {
    const { projectUuid: projectUuidFromParams } = useParams<{
        projectUuid?: string;
    }>();

    const { embedToken, projectUuid: projectUuidFromEmbed } = useEmbed();

    const projectUuid = projectUuidFromEmbed ?? projectUuidFromParams;

    if (!embedToken) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    icon={IconUnlink}
                    title="This embed link is not valid"
                />
            </div>
        );
    }

    return (
        <DashboardProvider embedToken={embedToken} projectUuid={projectUuid}>
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
