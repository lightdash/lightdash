import { screen } from '@testing-library/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../testing/testUtils';
import CellErrorBoundary from './CellErrorBoundary';

// Suppress console.error/console.warn output during error boundary tests
// so vitest output stays clean. We still verify behaviour via assertions.
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
    console.error = vi.fn();
    console.warn = vi.fn();
});

afterEach(() => {
    console.error = originalError;
    console.warn = originalWarn;
});

// A component that throws the given error on render
const ThrowingChild = ({ error }: { error: Error }) => {
    throw error;
};

// Simulates the page-level ErrorBoundary in Page.tsx — the outer boundary
// that would catch unhandled errors from any descendant component.
class PageLevelBoundary extends Component<
    { children: ReactNode; onCatch?: (e: Error) => void },
    { hasError: boolean }
> {
    constructor(props: { children: ReactNode; onCatch?: (e: Error) => void }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): { hasError: boolean } {
        return { hasError: true };
    }

    componentDidCatch(error: Error, _info: ErrorInfo): void {
        this.props.onCatch?.(error);
    }

    render(): ReactNode {
        if (this.state.hasError) {
            return <div>page crashed</div>;
        }
        return this.props.children;
    }
}

describe('CellErrorBoundary', () => {
    it('renders children normally when no error is thrown', () => {
        renderWithProviders(
            <CellErrorBoundary>
                <span>cell value</span>
            </CellErrorBoundary>,
        );
        expect(screen.getByText('cell value')).toBeInTheDocument();
    });

    it('renders fallback dash when a Firefox DOMException NotFoundError is thrown', () => {
        // This is the exact error that browser translation extensions cause:
        // Firefox's DOMException when React can't find a text node it tried to
        // update (because the extension wrapped it in a <font> element).
        const domException = new DOMException(
            'The object can not be found here.',
            'NotFoundError',
        );

        renderWithProviders(
            <CellErrorBoundary>
                <ThrowingChild error={domException} />
            </CellErrorBoundary>,
        );

        // The cell should show a dash fallback instead of crashing
        expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('renders fallback dash when an error with name NotFoundError is thrown', () => {
        // Covers the case where the error is not a DOMException instance but
        // has the same .name (cross-realm objects, serialised errors, etc.)
        const err = new Error('The object can not be found here.');
        err.name = 'NotFoundError';

        renderWithProviders(
            <CellErrorBoundary>
                <ThrowingChild error={err} />
            </CellErrorBoundary>,
        );

        expect(screen.getByText('-')).toBeInTheDocument();
    });

    it('renders fallback dash when an unrelated error is thrown (prevents page crash)', () => {
        // Any error inside a cell should be contained at cell level — it must
        // not propagate to the page-level ErrorBoundary and crash the whole page.
        const err = new TypeError('Cannot read properties of undefined');

        renderWithProviders(
            <CellErrorBoundary>
                <ThrowingChild error={err} />
            </CellErrorBoundary>,
        );

        expect(screen.getByText('-')).toBeInTheDocument();
    });
});

describe('CellErrorBoundary — error propagation path', () => {
    const domException = new DOMException(
        'The object can not be found here.',
        'NotFoundError',
    );

    it('[BEFORE FIX] without CellErrorBoundary, a DOMException propagates to the page-level boundary and crashes the page', () => {
        // This simulates the pre-fix BodyCell render: children were wrapped in
        // a plain <span> with no cell-level error boundary. The DOMException
        // thrown by browser translation extensions would escape all the way to
        // the page-level ErrorBoundary, showing a blank/error page.
        const caught: Error[] = [];

        renderWithProviders(
            // Outer boundary = page-level ErrorBoundary in Page.tsx
            <PageLevelBoundary onCatch={(e) => caught.push(e)}>
                {/* Pre-fix BodyCell structure: no CellErrorBoundary */}
                <span>
                    <ThrowingChild error={domException} />
                </span>
            </PageLevelBoundary>,
        );

        // The outer boundary DOES catch it → page crashes
        expect(caught).toHaveLength(1);
        expect(caught[0].message).toBe('The object can not be found here.');
        expect(screen.getByText('page crashed')).toBeInTheDocument();
    });

    it('[AFTER FIX] with CellErrorBoundary, the same DOMException is caught at cell level — the page-level boundary is never triggered', () => {
        // This simulates the fixed BodyCell render: children are now wrapped
        // in CellErrorBoundary before being placed in the <span>. The
        // DOMException is caught at cell level; the outer (page-level) boundary
        // never sees it.
        const caught: Error[] = [];

        renderWithProviders(
            // Outer boundary = page-level ErrorBoundary in Page.tsx
            <PageLevelBoundary onCatch={(e) => caught.push(e)}>
                {/* Fixed BodyCell structure: CellErrorBoundary wraps the children */}
                <CellErrorBoundary>
                    <span>
                        <ThrowingChild error={domException} />
                    </span>
                </CellErrorBoundary>
            </PageLevelBoundary>,
        );

        // The outer boundary was NOT triggered → page does not crash
        expect(caught).toHaveLength(0);
        expect(screen.queryByText('page crashed')).not.toBeInTheDocument();

        // The cell shows its graceful '-' fallback instead
        expect(screen.getByText('-')).toBeInTheDocument();
    });
});
