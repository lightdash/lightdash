import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { BigQueryAgentConnectionCard } from './BigQueryAgentConnectionCard';

describe('BigQueryAgentConnectionCard', () => {
    it('explains the admin-managed connection without an action', () => {
        renderWithProviders(<BigQueryAgentConnectionCard />);
        expect(
            screen.getByRole('heading', { name: 'BigQuery' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Nothing to do')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Agents run as the AI service account your admin set up. You can still see everything you normally can.',
            ),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
});
