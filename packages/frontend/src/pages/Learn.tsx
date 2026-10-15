import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Page from '../components/common/Page/Page';
import LearnPage from '../features/learn/LearnPage';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';

const Learn: FC = () => {
    const { t } = useTranslation('pages');
    return (
        <TrackPage name={PageName.LEARN}>
            <Page title={t('learn.title')} withFooter noContentPadding>
                <LearnPage />
            </Page>
        </TrackPage>
    );
};

export default Learn;
