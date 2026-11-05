import { interpolateUiString, type UiStringResolver } from '@lightdash/common';

// Reasoning is not a step, so running, earlier and finished counts agree.
export const getActivityStepLabels = (
    {
        totalCalls,
        latestCallCount,
        hasReasoning,
    }: {
        totalCalls: number;
        latestCallCount: number;
        hasReasoning: boolean;
    },
    getUiString: UiStringResolver,
) => {
    const earlierCount = totalCalls - latestCallCount;
    const count = (
        n: number,
        singular:
            | 'aiAgent.activity.steps.singular'
            | 'aiAgent.activity.earlierSteps.singular',
        plural:
            | 'aiAgent.activity.steps.plural'
            | 'aiAgent.activity.earlierSteps.plural',
    ) =>
        interpolateUiString(getUiString(n === 1 ? singular : plural), {
            count: n,
        });
    return {
        running:
            totalCalls > 1
                ? interpolateUiString(getUiString('aiAgent.activity.step'), {
                      count: totalCalls,
                  })
                : null,
        earlier:
            earlierCount > 0
                ? count(
                      earlierCount,
                      'aiAgent.activity.earlierSteps.singular',
                      'aiAgent.activity.earlierSteps.plural',
                  )
                : hasReasoning
                  ? getUiString('aiAgent.activity.reasoning')
                  : null,
        finished: count(
            totalCalls,
            'aiAgent.activity.steps.singular',
            'aiAgent.activity.steps.plural',
        ),
    };
};
