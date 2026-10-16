import type {
    AiAgentEvaluationRunResult,
    AiAgentEvaluationRunSummary,
} from '@lightdash/common';
import { type DefaultMantineColor } from '@mantine/core';

type StatusUnion =
    | AiAgentEvaluationRunResult['status']
    | AiAgentEvaluationRunSummary['status'];

export const isRunning = (status: StatusUnion) =>
    status !== 'completed' && status !== 'failed';

type Config = {
    color: DefaultMantineColor;
    labelKey: string;
};

export const statusConfig = {
    completed: { color: 'green', labelKey: 'evals.status.completed' },
    failed: { color: 'red', labelKey: 'evals.status.failed' },
    running: { color: 'yellow', labelKey: 'evals.status.running' },
    assessing: { color: 'indigo', labelKey: 'evals.status.assessing' },
    pending: { color: 'gray', labelKey: 'evals.status.pending' },
} satisfies Record<StatusUnion, Config>;

export const getAssessmentConfig = (passed?: boolean): Config =>
    passed === undefined
        ? { labelKey: 'evals.assessment.notApplicable', color: 'gray' }
        : passed
          ? { labelKey: 'evals.assessment.passed', color: 'green.8' }
          : { labelKey: 'evals.assessment.failed', color: 'red.8' };
