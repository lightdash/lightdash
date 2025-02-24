import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import DashboardProvider from '../../providers/Dashboard/DashboardProvider';
import EmbedDashboard from '../features/embed/EmbedDashboard/components/EmbedDashboard';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedDashboardPage: FC<{
    containerStyles?: React.CSSProperties;
}> = ({ containerStyles }) => {
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
            <EmbedDashboard containerStyles={containerStyles} />
        </DashboardProvider>
    );
};
export default EmbedDashboardPage;
