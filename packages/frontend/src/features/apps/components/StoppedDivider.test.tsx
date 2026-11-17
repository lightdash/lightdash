import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import StoppedDivider from './StoppedDivider';

describe('StoppedDivider', () => {
    it('marks the stopped build', () => {
        renderWithProviders(<StoppedDivider />);

        expect(screen.getByRole('status')).toHaveTextContent('Build stopped');
    });
});
