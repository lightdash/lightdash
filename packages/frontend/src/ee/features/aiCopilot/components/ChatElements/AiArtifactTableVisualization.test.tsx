import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type InfiniteQueryResults } from '../../../../../hooks/useQueryResults';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiArtifactTableVisualization } from './AiArtifactTableVisualization';

const results = (
    overrides: Partial<InfiniteQueryResults>,
): InfiniteQueryResults => ({
    rows: [],
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    fetchMoreRows: vi.fn(),
    refetchRows: vi.fn(),
    setFetchAll: vi.fn(),
    fetchAll: true,
    hasFetchedAllRows: true,
    totalClientFetchTimeMs: undefined,
    error: null,
    ...overrides,
});

describe('AiArtifactTableVisualization', () => {
    it('shows an empty state for a ready result with no rows', () => {
        renderWithProviders(
            <AiArtifactTableVisualization
                results={results({ columns: {}, totalResults: 0 })}
                headerContent="Top customers"
                loadingMessage="Loading results..."
            />,
        );

        expect(screen.getByText('Top customers')).toBeVisible();
        expect(screen.getByText('No rows returned')).toBeVisible();
    });

    it('waits while the first page has no columns yet', () => {
        renderWithProviders(
            <AiArtifactTableVisualization
                results={results({ columns: {}, totalResults: undefined })}
                headerContent="Top customers"
                loadingMessage="Loading results..."
            />,
        );

        expect(screen.queryByText('Top customers')).not.toBeInTheDocument();
    });
});
