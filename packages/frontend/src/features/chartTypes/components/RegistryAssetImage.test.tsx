import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegistryAssetImage from './RegistryAssetImage';

describe('RegistryAssetImage', () => {
    it('renders the proxied image and swaps to the fallback on load error', () => {
        render(
            <RegistryAssetImage
                path="charts/heatmap/0.1.0/thumbnail.png"
                alt="Heatmap"
                fallback={<span>fallback</span>}
            />,
        );
        const img = screen.getByRole('img', { name: 'Heatmap' });
        expect(img).toHaveAttribute(
            'src',
            expect.stringContaining('/api/v1/ee/chart-registry/assets?path='),
        );
        expect(screen.queryByText('fallback')).not.toBeInTheDocument();

        fireEvent.error(img);

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByText('fallback')).toBeInTheDocument();
    });

    it('renders nothing on load error when the fallback is null', () => {
        render(
            <RegistryAssetImage
                path="missing.png"
                alt="Gone"
                fallback={null}
            />,
        );

        fireEvent.error(screen.getByRole('img', { name: 'Gone' }));

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
});
