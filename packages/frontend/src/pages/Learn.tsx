import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import LearnPage from '../features/learn/LearnPage';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';

const Learn: FC = () => (
    <TrackPage name={PageName.LEARN}>
        <Page title="Learn" withFooter noContentPadding>
            <LearnPage />
        </Page>
    </TrackPage>
);

export default Learn;
