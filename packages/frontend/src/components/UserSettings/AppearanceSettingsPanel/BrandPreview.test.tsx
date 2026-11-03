import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { BrandPreview } from './BrandPreview';

const preview = (compact: boolean, color: string) => (
    <MantineProvider env="test">
        <BrandPreview
            compact={compact}
            name={null}
            logos={[]}
            colors={[{ hex: color, type: 'accent', brightness: null }]}
            titleFont={null}
            bodyFont={null}
        />
    </MantineProvider>
);

describe('BrandPreview', () => {
    it('reflects the chosen color across the compact dashboard preview', () => {
        const { container, rerender } = render(preview(true, '#f59f00'));
        expect(screen.getByText('Revenue overview')).toBeInTheDocument();
        expect(screen.getByText('Weekly trend')).toBeInTheDocument();
        expect(screen.getByText('Revenue by channel')).toBeInTheDocument();
        expect(
            screen.getByRole('table', { name: 'Revenue by channel' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Revenue share')).not.toBeInTheDocument();
        expect(
            container.querySelector('path[stroke="#f59f00"]'),
        ).toBeInTheDocument();
        rerender(preview(true, '#7950f2'));
        expect(
            container.querySelector('path[stroke="#7950f2"]'),
        ).toBeInTheDocument();
    });
    it('preserves all charts in the full appearance settings preview', () => {
        render(preview(false, '#f59f00'));
        expect(screen.getByText('Revenue by channel')).toBeInTheDocument();
        expect(screen.getByText('Revenue share')).toBeInTheDocument();
    });
});
