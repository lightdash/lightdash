import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type FC } from 'react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

const Editor: FC = () => {
    const [isDirty, setIsDirty] = useState(false);
    const guard = useUnsavedChangesGuard(isDirty);
    return (
        <>
            <button onClick={() => setIsDirty(true)}>edit</button>
            <Link to="/elsewhere">leave</Link>
            {guard.isBlocked && (
                <>
                    <span>blocked</span>
                    <button onClick={guard.proceed}>proceed</button>
                    <button onClick={guard.reset}>stay</button>
                </>
            )}
        </>
    );
};

const renderEditor = () => {
    const router = createMemoryRouter([
        { path: '/', element: <Editor /> },
        { path: '/elsewhere', element: <span>elsewhere</span> },
    ]);
    render(<RouterProvider router={router} />);
    return router;
};

describe('useUnsavedChangesGuard', () => {
    it('lets navigation through when there are no changes', async () => {
        const router = renderEditor();
        await userEvent.click(screen.getByText('leave'));
        await waitFor(() =>
            expect(router.state.location.pathname).toBe('/elsewhere'),
        );
    });

    it('blocks navigation with changes until the user proceeds', async () => {
        const router = renderEditor();
        await userEvent.click(screen.getByText('edit'));
        await userEvent.click(screen.getByText('leave'));
        expect(await screen.findByText('blocked')).toBeInTheDocument();
        expect(router.state.location.pathname).toBe('/');

        await userEvent.click(screen.getByText('stay'));
        await waitFor(() =>
            expect(screen.queryByText('blocked')).not.toBeInTheDocument(),
        );
        expect(router.state.location.pathname).toBe('/');

        await userEvent.click(screen.getByText('leave'));
        await userEvent.click(await screen.findByText('proceed'));
        await waitFor(() =>
            expect(router.state.location.pathname).toBe('/elsewhere'),
        );
    });
});
