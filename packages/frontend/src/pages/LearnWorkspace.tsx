import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import LearnWorkspacePage from '../features/learnSandbox/LearnWorkspacePage';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';

const LearnWorkspace: FC = () => (
    <TrackPage name={PageName.LEARN_WORKSPACE}>
        <Page title="Workspace" noContentPadding>
            <LearnWorkspacePage />
        </Page>
    </TrackPage>
);

export default LearnWorkspace;
