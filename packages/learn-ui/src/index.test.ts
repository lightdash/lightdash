import { describe, expect, it } from 'vitest';
import { LEARN_UI_PACKAGE } from './index';

describe('package', () => {
    it('exports its name', () => {
        expect(LEARN_UI_PACKAGE).toBe('@lightdash/learn-ui');
    });
});
