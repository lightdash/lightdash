import { interpolateUiString, type UiStringResolver } from '@lightdash/common';

export const getActivityStepLabels = (
    { totalCalls }: { totalCalls: number },
    getUiString: UiStringResolver,
) => ({
    running:
        totalCalls > 1
            ? interpolateUiString(getUiString('aiAgent.activity.step'), {
                  count: totalCalls,
              })
            : null,
    finished: interpolateUiString(
        getUiString(
            totalCalls === 1
                ? 'aiAgent.activity.steps.singular'
                : 'aiAgent.activity.steps.plural',
        ),
        { count: totalCalls },
    ),
});
