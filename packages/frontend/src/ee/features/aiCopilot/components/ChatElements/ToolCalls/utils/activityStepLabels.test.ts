import { DEFAULT_UI_STRINGS, type UiStringKey } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getActivityStepLabels } from './activityStepLabels';

const english = (key: UiStringKey) => DEFAULT_UI_STRINGS[key];

describe('getActivityStepLabels', () => {
    it('counts the running step plus earlier steps as the finished total', () => {
        expect(
            getActivityStepLabels(
                {
                    totalCalls: 7,
                    latestCallCount: 1,
                    hasReasoning: true,
                },
                english,
            ),
        ).toEqual({
            running: 'Step 7',
            earlier: '6 earlier steps',
            finished: '7 steps',
        });
    });

    it('excludes every call shown in the latest group from earlier steps', () => {
        expect(
            getActivityStepLabels(
                {
                    totalCalls: 4,
                    latestCallCount: 2,
                    hasReasoning: false,
                },
                english,
            ).earlier,
        ).toBe('2 earlier steps');
    });

    it('labels reasoning alone without counting it as a step', () => {
        expect(
            getActivityStepLabels(
                {
                    totalCalls: 1,
                    latestCallCount: 1,
                    hasReasoning: true,
                },
                english,
            ),
        ).toEqual({ running: null, earlier: 'Reasoning', finished: '1 step' });
    });

    it('uses the singular for one earlier step', () => {
        expect(
            getActivityStepLabels(
                {
                    totalCalls: 2,
                    latestCallCount: 1,
                    hasReasoning: false,
                },
                english,
            ).earlier,
        ).toBe('1 earlier step');
    });
});
