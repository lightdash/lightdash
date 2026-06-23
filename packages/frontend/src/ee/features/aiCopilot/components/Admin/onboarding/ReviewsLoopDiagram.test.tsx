import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ReviewsLoopDiagram } from './ReviewsLoopDiagram';

describe('ReviewsLoopDiagram', () => {
    it('renders the four lifecycle steps and the feedback line', () => {
        renderWithProviders(<ReviewsLoopDiagram />);

        expect(screen.getByText('Pull request')).toBeInTheDocument();
        expect(screen.getByText('Workspace')).toBeInTheDocument();
        expect(screen.getByText('Build and verify')).toBeInTheDocument();
        expect(screen.getByText('Merge')).toBeInTheDocument();
        expect(screen.getByText(/The agent picks this up/)).toBeInTheDocument();
    });
});
