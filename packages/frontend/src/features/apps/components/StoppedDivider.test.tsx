import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import StoppedDivider from './StoppedDivider';

describe('StoppedDivider', () => {
    it('names the version the preview still shows', () => {
        renderWithProviders(<StoppedDivider fallbackVersion={2} />);

        expect(screen.getByText(/Build stopped/)).toBeInTheDocument();
        expect(screen.getByText('v2')).toBeInTheDocument();
    });
});
