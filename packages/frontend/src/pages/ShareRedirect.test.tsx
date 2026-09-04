import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type * as ReactRouter from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof ReactRouter>();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const mockUseGetShare = vi.fn();

vi.mock('../hooks/useShare', () => ({
    useGetShare: (shareNanoid?: string) => mockUseGetShare(shareNanoid),
}));

import ShareRedirect from './ShareRedirect';

const renderShareRedirect = (nanoid = 'test-share-id') =>
    render(
        <MantineProvider>
            <MemoryRouter initialEntries={[`/share/${nanoid}`]}>
                <Routes>
                    <Route
                        path="/share/:shareNanoid"
                        element={<ShareRedirect />}
                    />
                </Routes>
            </MemoryRouter>
        </MantineProvider>,
    );

describe('ShareRedirect', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('redirects with replace: true when share data is loaded', () => {
        mockUseGetShare.mockReturnValue({
            data: { url: '/projects/test-project/tables/orders' },
            error: null,
        });

        renderShareRedirect();

        expect(mockNavigate).toHaveBeenCalledWith(
            '/projects/test-project/tables/orders',
            { replace: true },
        );
    });

    it('shows loading state while fetching share link', () => {
        mockUseGetShare.mockReturnValue({
            data: undefined,
            error: null,
        });

        renderShareRedirect();

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('shows error state when share link does not exist', () => {
        mockUseGetShare.mockReturnValue({
            data: undefined,
            error: new Error('Not found'),
        });

        renderShareRedirect();

        expect(
            screen.getByText('Shared link does not exist'),
        ).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});
