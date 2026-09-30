import { describe, expect, it } from 'vitest';
import { themeComponents } from './index';

describe('scrollbar defaults', () => {
    it.each(['ScrollArea', 'Select', 'MultiSelect'])(
        '%s does not force persistent scrollbars globally',
        (component) => {
            const defaults = themeComponents?.[component]?.defaultProps;
            expect(defaults?.type).not.toBe('always');
            expect(defaults?.scrollAreaProps?.type).not.toBe('always');
        },
    );
});
