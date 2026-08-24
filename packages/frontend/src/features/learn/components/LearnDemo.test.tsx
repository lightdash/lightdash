import { type LearnDemo as LearnDemoManifest } from '@lightdash/common';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LearnDemo } from './LearnDemo';

const demo: LearnDemoManifest = {
    id: 'save-chart',
    title: 'Save a chart',
    viewport: { width: 1440, height: 900 },
    steps: [
        {
            image: 'save-1.png',
            caption: 'Click Save.',
            hotspot: { x: 0.8, y: 0.1, width: 0.1, height: 0.05 },
        },
        { image: 'save-2.png', caption: 'Name it.', hotspot: null },
        { image: 'save-3.png', caption: 'Saved.', hotspot: null },
    ],
};

describe('LearnDemo', () => {
    it('walks the steps by hotspot, then Next, then Replay', () => {
        render(<LearnDemo demo={demo} assetBaseUrl="https://cdn/x" />);
        expect(screen.getByText('1/3')).toBeInTheDocument();
        expect(screen.getByRole('img')).toHaveAttribute(
            'src',
            'https://cdn/x/assets/save-1.png',
        );

        fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
        expect(screen.getByText('2/3')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Next step' }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByText('3/3')).toBeInTheDocument();
        expect(screen.getByText('Saved.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
        expect(screen.getByText('1/3')).toBeInTheDocument();
    });
});
