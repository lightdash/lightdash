import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import ForbiddenPanel from '../components/ForbiddenPanel';
import RecentlyDeletedPage from '../features/recentlyDeleted/components/RecentlyDeletedPage';
import { useRecentlyDeletedAccess } from '../features/recentlyDeleted/hooks/useRecentlyDeletedAccess';
import { useProjectUuid } from '../hooks/useProjectUuid';

const RecentlyDeleted: FC = () => {
    const projectUuid = useProjectUuid();
    const allowed = useRecentlyDeletedAccess(projectUuid);
    if (!allowed || !projectUuid) return <ForbiddenPanel />;
    return (
        <Page title="Recently deleted" withFooter>
            <RecentlyDeletedPage projectUuid={projectUuid} />
        </Page>
    );
};

export default RecentlyDeleted;
