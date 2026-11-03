import { type AgentOnboardingRun } from '@lightdash/common';
import { minutesFromNow, PROJECT_UUID, RUN_UUID } from './storyApi';

export const storyAgentRun = (completed: boolean): AgentOnboardingRun => ({
    agentOnboardingRunUuid: RUN_UUID,
    projectUuid: PROJECT_UUID,
    status: completed ? 'completed' : 'running',
    stage: completed ? 'handoff' : 'deploying_semantic_layer',
    createdAt: minutesFromNow(-4),
    startedAt: minutesFromNow(-4),
    updatedAt: minutesFromNow(-1),
    completedAt: completed ? minutesFromNow(-1) : null,
    errorMessage: null,
    usage: null,
    handoff: completed
        ? {
              summary:
                  'Your orders, customers and revenue models are ready. Open the starter dashboard to explore weekly sales and repeat purchases.',
              dashboardUrl: `/projects/${PROJECT_UUID}/dashboards/coffee-overview`,
          }
        : null,
    events: [
        {
            eventType: 'stage',
            stage: 'preparing_project',
            message: 'Preparing your project',
            createdAt: minutesFromNow(-4),
        },
        {
            eventType: 'stage',
            stage: 'exploring_warehouse',
            message: 'Found orders, customers and payments in public',
            createdAt: minutesFromNow(-3),
        },
        {
            eventType: 'stage',
            stage: 'deploying_semantic_layer',
            message: 'Defining revenue, order count and repeat customers',
            createdAt: minutesFromNow(-2),
        },
        ...(completed
            ? ([
                  {
                      eventType: 'stage',
                      stage: 'building_dashboard',
                      message: 'Created the coffee overview dashboard',
                      createdAt: minutesFromNow(-1.8),
                  },
                  {
                      eventType: 'stage',
                      stage: 'verifying',
                      message: 'Checked the models and dashboard queries',
                      createdAt: minutesFromNow(-1.5),
                  },
                  {
                      eventType: 'stage',
                      stage: 'handoff',
                      message: 'Your starter dashboard is ready to explore',
                      createdAt: minutesFromNow(-1),
                  },
              ] as const)
            : []),
    ],
    files: [
        {
            path: 'models/orders.yml',
            sizeBytes: 245,
            updatedAt: minutesFromNow(-2),
        },
        ...(completed
            ? [
                  {
                      path: 'handoff.md',
                      sizeBytes: 180,
                      updatedAt: minutesFromNow(-1),
                  },
              ]
            : []),
    ],
});
