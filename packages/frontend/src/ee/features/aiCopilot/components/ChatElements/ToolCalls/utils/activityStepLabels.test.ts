import { DEFAULT_UI_STRINGS, type UiStringKey } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getActivityStepLabels } from './activityStepLabels';

const english = (key: UiStringKey) => DEFAULT_UI_STRINGS[key];

describe('getActivityStepLabels', () => {
    it('numbers the running step and counts the finished total', () => {
        expect(getActivityStepLabels({ totalCalls: 7 }, english)).toEqual({
            running: 'Step 7',
            finished: '7 steps',
        });
    });

    it('omits the step number for a single step and uses the singular', () => {
        expect(getActivityStepLabels({ totalCalls: 1 }, english)).toEqual({
            running: null,
            finished: '1 step',
        });
    });
});
