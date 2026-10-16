import { getDocumentUrl } from '@lightdash/common';
import { Button, Center } from '@mantine/core';
import { IconFileOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import PageSpinner from '../../../components/PageSpinner';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { DeepResearchReport } from '../../features/aiCopilot/components/DeepResearch/DeepResearchReport';
import { useDeepResearchReport } from '../../features/aiCopilot/hooks/useDeepResearch';

const DeepResearchReportPage = () => {
    const { t } = useTranslation('eeMisc');
    const { runUuid } = useParams();
    const projectUuid = useProjectUuid();
    const navigate = useNavigate();
    const runQuery = useDeepResearchReport(projectUuid, runUuid);

    if (!projectUuid || !runUuid) {
        return <ErrorState />;
    }
    if (runQuery.isLoading) {
        return <PageSpinner />;
    }
    if (runQuery.isError || !runQuery.data) {
        return <ErrorState error={runQuery.error?.error} />;
    }

    const run = runQuery.data;
    const threadUrl = `/projects/${projectUuid}/ai-agents/${run.agentUuid}/threads/${run.threadUuid}`;
    const backToChat = () => navigate(threadUrl, { replace: true });

    if (run.document) {
        return (
            <Navigate
                to={getDocumentUrl(
                    projectUuid,
                    run.document.documentUuid,
                    run.document.slug,
                )}
                replace
            />
        );
    }

    if (!run.resultMarkdown || !run.completedAt) {
        return (
            <Center h="100%">
                <SuboptimalState
                    icon={IconFileOff}
                    title={
                        run.isReportExpired
                            ? t('agents.deepResearch.expiredTitle')
                            : t('agents.deepResearch.notReadyTitle')
                    }
                    description={
                        run.isReportExpired
                            ? t('agents.deepResearch.expiredDescription')
                            : t('agents.deepResearch.notReadyDescription')
                    }
                    action={
                        <Button variant="default" onClick={backToChat}>
                            {t('agents.deepResearch.backToChat')}
                        </Button>
                    }
                />
            </Center>
        );
    }

    return <DeepResearchReport run={run} opened onClose={backToChat} />;
};

export default DeepResearchReportPage;
