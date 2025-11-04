import type {
    AiAgentEvaluationRunResult,
    AiAgentEvaluationRunSummary,
} from '@lightdash/common';
import { type DefaultMantineColor } from '@mantine-8/core';

type StatusUnion =
    | AiAgentEvaluationRunResult['status']
    | AiAgentEvaluationRunSummary['status'];

export const isRunning = (status: StatusUnion) =>
    status !== 'completed' && status !== 'failed';

type Config = {
    color: DefaultMantineColor;
    label: string;
};

export const statusConfig = {
    completed: { color: 'green', label: 'Completed' },
    failed: { color: 'red', label: 'Errored' },
    running: { color: 'yellow', label: 'Running' },
    assessing: { color: 'indigo', label: 'Assessing' },
    pending: { color: 'gray', label: 'Pending' },
} satisfies Record<StatusUnion, Config>;

export const getAssessmentConfig = (passed?: boolean): Config =>
    passed === undefined
        ? { label: 'N/A', color: 'gray' }
        : passed
        ? { label: 'Passed', color: 'green.8' }
        : { label: 'Failed', color: 'red.8' };
