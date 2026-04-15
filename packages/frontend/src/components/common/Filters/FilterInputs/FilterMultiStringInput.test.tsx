import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import FilterMultiStringInput from './FilterMultiStringInput';

describe('FilterMultiStringInput', () => {
    describe('basic rendering', () => {
        it('renders provided string values as tags', () => {
            renderWithProviders(
                <FilterMultiStringInput
                    values={['apple', 'banana']}
                    onChange={vi.fn()}
                />,
            );

            expect(screen.getByText('apple')).toBeInTheDocument();
            expect(screen.getByText('banana')).toBeInTheDocument();
        });

        it('renders placeholder when no values', () => {
            renderWithProviders(
                <FilterMultiStringInput
                    values={[]}
                    onChange={vi.fn()}
                    placeholder="Type to add..."
                />,
            );

            expect(
                screen.getByPlaceholderText('Type to add...'),
            ).toBeInTheDocument();
        });
    });

    describe('non-string value tolerance (LIGHTDASH-FRONTEND-431)', () => {
        it('renders without throwing when values contain numbers', () => {
            // DashboardFilterRule.values is any[] at runtime — numbers can arrive here.
            // Before the fix this triggered: TypeError: value.replace is not a function
            const valuesWithNumbers = [42, 99, 0] as unknown as string[];

            expect(() => {
                renderWithProviders(
                    <FilterMultiStringInput
                        values={valuesWithNumbers}
                        onChange={vi.fn()}
                    />,
                );
            }).not.toThrow();
        });

        it('renders without throwing when values contain null, undefined, or boolean', () => {
            const mixedValues = [
                null,
                undefined,
                true,
                false,
                'valid',
            ] as unknown as string[];

            expect(() => {
                renderWithProviders(
                    <FilterMultiStringInput
                        values={mixedValues}
                        onChange={vi.fn()}
                    />,
                );
            }).not.toThrow();
        });
    });
});
