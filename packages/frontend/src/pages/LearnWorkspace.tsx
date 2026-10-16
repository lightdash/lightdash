import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Page from '../components/common/Page/Page';
import LearnWorkspacePage from '../features/learnSandbox/LearnWorkspacePage';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';

const LearnWorkspace: FC = () => {
    const { t } = useTranslation('pages');
    return (
        <TrackPage name={PageName.LEARN_WORKSPACE}>
            <Page
                title={t('learn.workspaceTitle')}
                noContentPadding
                withFullHeight
            >
                <LearnWorkspacePage />
            </Page>
        </TrackPage>
    );
};

export default LearnWorkspace;
