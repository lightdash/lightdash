import { ComparisonDiffTypes } from '@lightdash/common';
import { cleanup, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { BigNumberDisplay } from './BigNumberDisplay';

const baseProps = {
    value: '1,234',
    label: 'Revenue',
    showLabel: true,
    comparison: undefined,
    flipColors: false,
};

const pillClassesFor = (
    direction: ComparisonDiffTypes,
    flipColors: boolean,
) => {
    cleanup();
    renderWithProviders(
        <BigNumberDisplay
            {...baseProps}
            flipColors={flipColors}
            comparison={{
                formattedValue: '+20',
                direction,
                label: undefined,
                tooltip: 'tooltip',
            }}
        />,
    );
    return screen.getByText('+20').parentElement?.className ?? '';
};

describe('BigNumberDisplay', () => {
    it('renders the value and label', () => {
        renderWithProviders(<BigNumberDisplay {...baseProps} />);

        expect(screen.getByTestId('big-number-value')).toHaveTextContent(
            '1,234',
        );
        expect(screen.getByText('Revenue')).toBeInTheDocument();
    });

    it('hides the label', () => {
        renderWithProviders(
            <BigNumberDisplay {...baseProps} showLabel={false} />,
        );

        expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    });

    it('applies a conditional formatting colour to the value', () => {
        renderWithProviders(
            <BigNumberDisplay
                {...baseProps}
                valueColor="light-dark(#ff0000, #ff8888)"
            />,
        );

        expect(screen.getByTestId('big-number-value')).toHaveStyle({
            '--big-number-color': 'light-dark(#ff0000, #ff8888)',
        });
    });

    it('wraps the value when a renderer is supplied', () => {
        renderWithProviders(
            <BigNumberDisplay
                {...baseProps}
                renderValue={(value) => (
                    <button type="button" data-testid="context-menu">
                        {value}
                    </button>
                )}
            />,
        );

        expect(screen.getByTestId('context-menu')).toContainElement(
            screen.getByTestId('big-number-value'),
        );
    });

    it('colours an increase green and a decrease red', () => {
        expect(pillClassesFor(ComparisonDiffTypes.POSITIVE, false)).toContain(
            'trendPillUp',
        );
        expect(pillClassesFor(ComparisonDiffTypes.NEGATIVE, false)).toContain(
            'trendPillDown',
        );
    });

    it('swaps the comparison colours when flipColors is on', () => {
        expect(pillClassesFor(ComparisonDiffTypes.POSITIVE, true)).toContain(
            'trendPillDown',
        );
        expect(pillClassesFor(ComparisonDiffTypes.NEGATIVE, true)).toContain(
            'trendPillUp',
        );
    });

    it('renders an unchanged comparison neutrally', () => {
        expect(pillClassesFor(ComparisonDiffTypes.NONE, false)).toContain(
            'trendPillNeutral',
        );
    });
});
