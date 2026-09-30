import { AI_BILLABLE_FEATURES } from './billable';

describe('AI_BILLABLE_FEATURES', () => {
    test('charges agent, deep research, agent sub-tasks, compaction and data app generation only', () => {
        expect([...AI_BILLABLE_FEATURES].sort()).toEqual([
            'agent',
            'agent-subtask',
            'compaction',
            'data-app',
            'deep-research',
        ]);
    });
});
