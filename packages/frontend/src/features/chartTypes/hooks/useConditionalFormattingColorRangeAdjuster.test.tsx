import { MantineProvider } from '@mantine/core';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { transformColorsForDarkMode } from '../../../utils/colorUtils';
import { useConditionalFormattingColorRangeAdjuster } from './useConditionalFormattingColorRangeAdjuster';

const range = { start: '#ffffff', end: '#000000' };

const renderInScheme = (scheme: 'light' | 'dark') =>
    renderHook(() => useConditionalFormattingColorRangeAdjuster(), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <MantineProvider env="test" forceColorScheme={scheme}>
                {children}
            </MantineProvider>
        ),
    }).result.current;

describe('useConditionalFormattingColorRangeAdjuster', () => {
    it('keeps colour ranges as saved in light mode', () => {
        expect(renderInScheme('light')(range)).toEqual(range);
    });

    it('adjusts colour ranges like built-in tables in dark mode', () => {
        const adjusted = renderInScheme('dark')(range);
        expect(adjusted).toEqual(transformColorsForDarkMode(range));
        expect(adjusted).not.toEqual(range);
    });

    it('passes an invalid colour range through in dark mode instead of throwing', () => {
        const invalid = { start: 'not-a-colour', end: '#000000' };
        expect(renderInScheme('dark')(invalid)).toEqual(invalid);
    });
});
