import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ControlsSidebarPage } from './ControlsSidebarPage';

const pageProps = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../components/common/Page/Page', () => ({
    default: (props: Record<string, unknown>) => {
        pageProps.current = props;
        return null;
    },
}));
vi.mock('./ControlsSidebarProvider', () => ({
    ControlsSidebarProvider: ({ children }: { children: React.ReactNode }) =>
        children,
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: { isSidebarOpen: boolean }) => unknown,
    ) => selector({ isSidebarOpen: true }),
}));
vi.mock('./usePinnedSidebarTop', () => ({ usePinnedSidebarTop: vi.fn() }));
vi.mock('./ControlSidebar', () => ({ ControlSidebar: () => null }));
vi.mock('./TileOverlay', () => ({ TileOverlays: () => null }));
vi.mock('./LinkPrompts', () => ({ LinkPrompts: () => null }));
vi.mock('./TabCounts', () => ({ TabCounts: () => null }));
vi.mock('./FieldTilesBar', () => ({ FieldTilesBar: () => null }));

describe('ControlsSidebarPage', () => {
    it('titles the drawer of a small screen "Edit filter"', () => {
        renderWithProviders(<ControlsSidebarPage />);

        expect(pageProps.current.sidebarTitle).toBe('Edit filter');
        expect(pageProps.current.isSidebarOpen).toBe(true);
    });
});
