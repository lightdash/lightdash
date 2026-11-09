import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import CreateProject from './CreateProject';

vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ isInitialLoading: true, data: undefined }),
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: { isInitialLoading: true, data: undefined },
    }),
}));
vi.mock('../components/PageSpinner', () => ({
    default: () => <div>loading</div>,
}));

const Location = () => <div>{useLocation().pathname}</div>;

const renderAt = (path: string) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/createProject" element={<Location />} />
                <Route
                    path="/createProject/:method"
                    element={<CreateProject />}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('CreateProject', () => {
    it('redirects a removed or unknown connect method to the start', () => {
        renderAt('/createProject/agent');
        expect(screen.getByText('/createProject')).toBeInTheDocument();
    });

    it.each(['cli', 'manual', 'warehouse'])('keeps the %s method', (method) => {
        renderAt(`/createProject/${method}`);
        expect(screen.getByText('loading')).toBeInTheDocument();
    });
});
