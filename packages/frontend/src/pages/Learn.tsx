import { type FC } from 'react';
import Page from '../components/common/Page/Page';
import LearnPage from '../features/learn/LearnPage';

const Learn: FC = () => (
    <Page title="Learn" withFooter noContentPadding>
        <LearnPage />
    </Page>
);

export default Learn;
