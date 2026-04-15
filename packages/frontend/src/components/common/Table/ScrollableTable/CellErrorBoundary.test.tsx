import { screen } from '@testing-library/react';
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
