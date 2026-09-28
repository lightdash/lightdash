import { ContentType } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentProps, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type InfiniteResourceTable from '../components/common/ResourceView/InfiniteResourceTable';
import { ColumnVisibility } from '../components/common/ResourceView/types';
import classes from './Document.module.css';
import Documents from './Documents';

const mocks = vi.hoisted(() => ({
    table: vi.fn(),
    canCreate: true,
    authoring: true,
    flag: { data: { enabled: true }, isInitialLoading: false, isError: false },
}));

vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => mocks.flag,
}));
vi.mock('../hooks/user/useCreateInAnySpaceAccess', () => ({
    default: () => mocks.canCreate,
}));
vi.mock('../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => mocks.authoring,
}));
vi.mock('../features/documents/DocumentCreateModal', () => ({
    default: ({ onClose }: { onClose: () => void }) => (
        <div role="dialog" aria-label="Create document">
            <button onClick={onClose}>Close create</button>
        </div>
    ),
}));
vi.mock('../components/common/Page/Page', () => ({
    default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('../components/common/PageBreadcrumbs', () => ({
    default: ({ items }: { items: { title: string }[] }) => (
        <nav>{items.map((item) => item.title).join(' / ')}</nav>
    ),
}));
vi.mock('../providers/Favorites/FavoritesProvider', () => ({
    FavoritesProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/common/ResourceView/InfiniteResourceTable', () => ({
    default: (props: ComponentProps<typeof InfiniteResourceTable>) => {
        mocks.table(props);
        return <div>Shared resource table</div>;
    },
}));

const renderPage = () => {
    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/documents',
                element: <Documents />,
            },
            {
                path: '/projects/:projectUuid/home',
                element: <div>Project home</div>,
            },
        ],
        { initialEntries: ['/projects/project-uuid/documents'] },
    );
    render(
        <MantineProvider env="test">
            <RouterProvider router={router} />
        </MantineProvider>,
    );
};

describe('Documents page', () => {
    beforeEach(() => {
        mocks.table.mockClear();
        mocks.canCreate = true;
        mocks.authoring = true;
        mocks.flag = {
            data: { enabled: true },
            isInitialLoading: false,
            isError: false,
        };
    });

    test('uses the dashboard resource list shell with Document-only discovery', () => {
        renderPage();
        expect(screen.getByText('Home / All documents')).toBeInTheDocument();
        expect(screen.getByText('Shared resource table')).toBeInTheDocument();
        expect(screen.getByRole('main').parentElement).toHaveClass(
            classes.page,
        );
        expect(mocks.table).toHaveBeenCalledWith({
            filters: {
                projectUuid: 'project-uuid',
                contentTypes: [ContentType.DOCUMENT],
            },
            columnVisibility: { [ColumnVisibility.VIEWS]: false },
            emptyState: { entityName: 'documents' },
            errorStateTitle: 'Unable to load documents',
        });
        expect(
            screen.queryByRole('button', { name: /create/i }),
        ).not.toBeInTheDocument();
    });

    test('opens the create dialog from New document', () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'New document' }));
        expect(
            screen.getByRole('dialog', { name: 'Create document' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close create' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test.each([
        { canCreate: false, authoring: true },
        { canCreate: true, authoring: false },
    ])('hides New document without create rights or authoring: %j', (state) => {
        Object.assign(mocks, state);
        renderPage();
        expect(
            screen.queryByRole('button', { name: 'New document' }),
        ).not.toBeInTheDocument();
    });

    test('does not mount discovery while its flag is loading', () => {
        mocks.flag.isInitialLoading = true;
        renderPage();
        expect(screen.getByText('Loading documents')).toBeInTheDocument();
        expect(mocks.table).not.toHaveBeenCalled();
    });

    test.each(['disabled', 'failed'])(
        'does not mount discovery when its flag is %s',
        (state) => {
            mocks.flag.data.enabled = state !== 'disabled';
            mocks.flag.isError = state === 'failed';
            renderPage();
            expect(screen.getByText('Project home')).toBeInTheDocument();
            expect(mocks.table).not.toHaveBeenCalled();
        },
    );
});
