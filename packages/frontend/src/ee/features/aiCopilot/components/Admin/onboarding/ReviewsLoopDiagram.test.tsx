import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { ReviewsLoopDiagram } from './ReviewsLoopDiagram';

describe('ReviewsLoopDiagram', () => {
    it('renders the four steps and the feedback line', () => {
        renderWithProviders(<ReviewsLoopDiagram />);

        expect(screen.getByText('Finding')).toBeInTheDocument();
        expect(screen.getByText('Pull request')).toBeInTheDocument();
        expect(screen.getByText('dbt compile')).toBeInTheDocument();
        expect(screen.getByText('Future answers')).toBeInTheDocument();
        expect(screen.getByText(/The agent picks this up/)).toBeInTheDocument();
    });
});
