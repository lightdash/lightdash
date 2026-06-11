import { Stack } from '@mantine-8/core';
import type { FC } from 'react';
import {
    useReviewBatchReport,
    useReviewBatchRun,
    useReviewBatchRuns,
    useStartReviewBatch,
} from '../../hooks/useAiAgentReviewBatch';

type Props = {
    projectUuid: string | null;
    agentUuid: string | null;
};

// Placeholder for T9 — batch analysis panel.
export const BatchAnalysisPanel: FC<Props> = ({ projectUuid, agentUuid }) => {
    const { data: runs } = useReviewBatchRuns({
        projectUuid: projectUuid ?? undefined,
        agentUuid: agentUuid ?? undefined,
    });
    const latestRunUuid = runs?.[0]?.runUuid;
    const { data: run } = useReviewBatchRun(latestRunUuid, { poll: true });
    const { data: _report } = useReviewBatchReport(latestRunUuid, {
        enabled: run?.status === 'completed',
    });
    const _startBatch = useStartReviewBatch();

    return <Stack />;
};
