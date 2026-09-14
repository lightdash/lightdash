import { ComparisonDiffTypes, type BigNumberSpec } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import BigNumberView from './BigNumberView';

const spec: BigNumberSpec = {
    value: 1234,
    formattedValue: '1,234',
    label: 'Revenue',
    showLabel: true,
    flipColors: false,
    valueColor: undefined,
    comparison: undefined,
};

describe('BigNumberView', () => {
    it('renders the formatted value and label', () => {
        renderWithProviders(
            <BigNumberView spec={spec} isLoading={false} hasValueField />,
        );

        expect(screen.getByTestId('big-number-value')).toHaveTextContent(
            '1,234',
        );
        expect(screen.getByText('Revenue')).toBeInTheDocument();
    });

    it('hides the label when the config says so', () => {
        renderWithProviders(
            <BigNumberView
                spec={{ ...spec, showLabel: false }}
                isLoading={false}
                hasValueField
            />,
        );

        expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    });

    it('renders the comparison pill', () => {
        renderWithProviders(
            <BigNumberView
                spec={{
                    ...spec,
                    comparison: {
                        value: 234,
                        formattedValue: '+234',
                        direction: ComparisonDiffTypes.POSITIVE,
                        label: 'vs target',
                        tooltip: '+234 compared to target',
                    },
                }}
                isLoading={false}
                hasValueField
            />,
        );

        expect(screen.getByText('+234')).toBeInTheDocument();
        // The comparison label is dropped on short tiles, and jsdom reports a
        // zero-height container.
        expect(screen.queryByText('vs target')).not.toBeInTheDocument();
    });

    it('asks for a value field when none is configured', () => {
        renderWithProviders(
            <BigNumberView
                spec={undefined}
                isLoading={false}
                hasValueField={false}
            />,
        );

        expect(
            screen.getByText("You're missing a value field"),
        ).toBeInTheDocument();
    });

    it('surfaces query errors', () => {
        renderWithProviders(
            <BigNumberView
                spec={undefined}
                isLoading={false}
                error={{ message: 'Column not found' }}
                hasValueField
            />,
        );

        expect(screen.getByText('Column not found')).toBeInTheDocument();
    });
});
