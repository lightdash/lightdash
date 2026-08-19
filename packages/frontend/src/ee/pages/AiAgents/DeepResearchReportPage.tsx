import { Button, Center } from '@mantine/core';
import { IconFileOff } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import PageSpinner from '../../../components/PageSpinner';
import { DeepResearchReport } from '../../features/aiCopilot/components/DeepResearch/DeepResearchReport';
import { useDeepResearchReport } from '../../features/aiCopilot/hooks/useDeepResearch';

const DeepResearchReportPage = () => {
    const { projectUuid, runUuid } = useParams();
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

    if (!run.resultMarkdown || !run.completedAt) {
        return (
            <Center h="100%">
                <SuboptimalState
                    icon={IconFileOff}
                    title={
                        run.isReportExpired
                            ? 'This report is no longer available'
                            : 'This report is not ready yet'
                    }
                    description={
                        run.isReportExpired
                            ? 'Deep Research reports are available for 30 days.'
                            : 'Return to the conversation to check its progress.'
                    }
                    action={
                        <Button variant="default" onClick={backToChat}>
                            Back to chat
                        </Button>
                    }
                />
            </Center>
        );
    }

    return <DeepResearchReport run={run} opened onClose={backToChat} />;
};

export default DeepResearchReportPage;
