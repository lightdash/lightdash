import {
    getPreviewWarehouseSignInExpiredMessage,
    type ApiErrorDetail,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { getAsyncQueryError } from '../../../hooks/useQueryResults';
import { renderWithProviders } from '../../../testing/testUtils';
import { ExploreErrorState } from './ExplorerResultsNonIdealStates';

vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({
        data: { upstreamProjectUuid: 'upstream-project-uuid' },
    }),
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'preview-project-uuid',
}));

const renderError = (errorDetail: ApiErrorDetail) =>
    renderWithProviders(
        <MemoryRouter>
            <ExploreErrorState errorDetail={errorDetail} />
        </MemoryRouter>,
    );

describe('ExploreErrorState in a preview', () => {
    it('shows the preview sign-in error with a link to the parent connection settings', () => {
        renderError(
            getAsyncQueryError(
                getPreviewWarehouseSignInExpiredMessage('Production'),
            ).error,
        );

        expect(
            screen.getByText(
                "This preview's warehouse sign-in expired. Reconnect the warehouse on Production.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Open the connection settings' }),
        ).toHaveAttribute(
            'href',
            '/generalSettings/projectManagement/upstream-project-uuid/settings',
        );
        expect(screen.queryByText(/personal settings/)).not.toBeInTheDocument();
    });

    it('keeps other errors free of the connection link', () => {
        renderError({
            name: 'Error',
            statusCode: 500,
            message: 'Query failed',
            data: {},
        });

        expect(
            screen.queryByRole('link', {
                name: 'Open the connection settings',
            }),
        ).not.toBeInTheDocument();
    });
});

describe('getAsyncQueryError', () => {
    it('names the preview sign-in error so the browser can tell it apart', () => {
        expect(
            getAsyncQueryError(
                getPreviewWarehouseSignInExpiredMessage('Production'),
            ).error,
        ).toEqual(
            expect.objectContaining({
                name: 'PreviewWarehouseSignInExpiredError',
                statusCode: 401,
            }),
        );
    });
});
