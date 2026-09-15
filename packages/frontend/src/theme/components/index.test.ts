import { describe, expect, it } from 'vitest';
import { themeComponents } from './index';

describe('dropdown scrollbar defaults', () => {
    it.each(['ScrollArea', 'Select', 'MultiSelect'])(
        '%s keeps scrollbars visible without hover or scrolling',
        (component) => {
            expect(themeComponents?.[component]?.defaultProps).toMatchObject(
                component === 'ScrollArea'
                    ? { type: 'always' }
                    : { scrollAreaProps: { type: 'always' } },
            );
        },
    );
});
