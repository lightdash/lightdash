import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import TotalNotComputableCell from './TotalNotComputableCell';

describe('TotalNotComputableCell', () => {
    it('says there is no total and carries the reason for the tooltip', () => {
        render(
            <MantineProvider>
                <TotalNotComputableCell reason="Average rating is an average, so it has no total here." />
            </MantineProvider>,
        );

        expect(screen.getByText('No total')).toBeInTheDocument();
        expect(
            screen.getByLabelText(
                'No total: Average rating is an average, so it has no total here.',
            ),
        ).toBeInTheDocument();
    });
});
