/**
 * DOM mutation repro — the actual runtime mechanism behind
 * LIGHTDASH-FRONTEND-45K / PROD-2237.
 *
 * Browser translation extensions (Google Translate, Firefox Translate) wrap
 * table-cell text nodes in <font> elements. On the next React re-render that
 * removes that specific text child, React calls:
 *
 *   parentSpan.removeChild(textNode)
 *
 * React's `textContent = ""` shortcut only fires when a host element has
 * NO element-sibling children. Table cells produced by getFormattedValueCell
 * often include element children alongside text (e.g. the formatted value
 * text node next to a bar-display <div>, or a rich-text component wrapping
 * alongside raw text). When React detects mixed content it falls back to the
 * explicit `removeChild` per-node deletion path.
 *
 * Because textNode is now inside <font> (no longer a direct child of
 * parentSpan), both Firefox and JSDOM's spec-compliant removeChild throw:
 *
 *   Firefox: NotFoundError: "The object can not be found here."
 *   JSDOM:   NotFoundError: "The node to be removed is not a child of this node."
 *
 * This is NOT a synthetic DOMException injection: the error is produced by
 * JSDOM's Node.removeChild implementation when React's commit phase tries to
 * delete the moved text node.
 *
 * BEFORE FIX: error propagates past BodyCell → reaches page-level boundary →
 *             page shows crash UI (blank/error screen).
 * AFTER  FIX: CellErrorBoundary catches it at cell level → cell shows '-',
 *             page stays intact.
 */
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import CellErrorBoundary from './CellErrorBoundary';

// ---------------------------------------------------------------------------
// simulateTranslationExtension
//
// Wraps the first non-empty text node found inside `container` in a <font>
// element — exactly what Google Translate and Firefox's built-in translation
// perform on page content. After this mutation:
//   - textNode.parentNode === font  (no longer the original span)
//   - font.parentNode     === originalSpan
//
// When React next calls originalSpan.removeChild(textNode) to delete the
// text fiber, JSDOM/Firefox throws NotFoundError because textNode is no
// longer a direct child of originalSpan.
// ---------------------------------------------------------------------------
function simulateTranslationExtension(container: HTMLElement): boolean {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) =>
            (node.textContent ?? '').trim().length > 0
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP,
    });
    const textNode = walker.nextNode() as Text | null;
    if (!textNode || !textNode.parentNode) return false;

    // Google Translate wraps text in <font face="sans-serif">
    const font = document.createElement('font');
    font.setAttribute('face', 'sans-serif');
    textNode.parentNode.insertBefore(font, textNode);
    font.appendChild(textNode);

    return true;
}

// ---------------------------------------------------------------------------
// PageLevelBoundary — stands in for the page-level ErrorBoundary in Page.tsx.
// If triggered, the page "crashes" (shows blank/error screen).
// ---------------------------------------------------------------------------
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
        if (this.state.hasError) return <div>page crashed</div>;
        return this.props.children;
    }
}

// ---------------------------------------------------------------------------
// CellContent — models getFormattedValueCell output for a numeric field.
//
// CRITICAL: the span contains BOTH a text node AND an element child (<em>).
// This is the key structure that prevents React from using its
// `node.textContent = ""` shortcut (which would silently remove all children).
// With mixed content React must call span.removeChild(textNode) explicitly,
// which throws when textNode was moved inside <font> by a translation extension.
//
// Real-world analogue: getFormattedValueCell returns a span with formatted
// text alongside bar-display divs, icon wrappers, or rich-text markup.
// ---------------------------------------------------------------------------
const CellContent = ({ showValue }: { showValue: boolean }) => (
    <span>
        {/* Text node — targeted and wrapped by translation extension */}
        {showValue ? '42,000' : null}
        {/* Element sibling — forces React to use removeChild per-node path */}
        <em />
    </span>
);

// ---------------------------------------------------------------------------
// PreFixBodyCell — BodyCell structure BEFORE CellErrorBoundary was added.
// Children are wrapped only in a plain <span>; no error boundary.
// ---------------------------------------------------------------------------
const PreFixBodyCell = ({ showValue }: { showValue: boolean }) => (
    <td>
        <span>
            <CellContent showValue={showValue} />
        </span>
    </td>
);

// ---------------------------------------------------------------------------
// PostFixBodyCell — current BodyCell structure with CellErrorBoundary.
// ---------------------------------------------------------------------------
const PostFixBodyCell = ({ showValue }: { showValue: boolean }) => (
    <td>
        <CellErrorBoundary>
            <span>
                <CellContent showValue={showValue} />
            </span>
        </CellErrorBoundary>
    </td>
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DOM mutation repro — actual translation-extension mechanism', () => {
    it('[BEFORE FIX] translation extension wraps text node → React removeChild throws NotFoundError → page-level boundary triggered', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const consoleWarn = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => {});

        const caught: Error[] = [];

        const { container, rerender } = render(
            <PageLevelBoundary onCatch={(e) => caught.push(e)}>
                <table>
                    <tbody>
                        <tr>
                            <PreFixBodyCell showValue={true} />
                        </tr>
                    </tbody>
                </table>
            </PageLevelBoundary>,
        );

        // Verify initial render
        const innerSpan = container.querySelector('td > span > span');
        expect(innerSpan).not.toBeNull();
        expect(innerSpan!.textContent).toContain('42,000');

        // Simulate translation extension: wrap text node in <font>
        const mutated = simulateTranslationExtension(container);
        expect(mutated).toBe(true);

        // Verify the DOM mutation occurred: first child of inner span is now <font>
        expect(innerSpan!.childNodes[0].nodeName).toBe('FONT');
        expect(innerSpan!.querySelector('font')?.textContent).toBe('42,000');

        // Re-render with showValue=false.
        // React needs to delete the text fiber "42,000" while keeping <em />.
        // Since the span has mixed content (text + element), React calls:
        //   innerSpan.removeChild(textNode)
        // But textNode is inside <font> — NotFoundError is thrown.
        await act(async () => {
            rerender(
                <PageLevelBoundary onCatch={(e) => caught.push(e)}>
                    <table>
                        <tbody>
                            <tr>
                                <PreFixBodyCell showValue={false} />
                            </tr>
                        </tbody>
                    </table>
                </PageLevelBoundary>,
            );
        });

        // The page-level boundary caught the DOMException — page shows crash UI.
        // This reproduces the crash path in LIGHTDASH-FRONTEND-45K:
        //   getFormattedValueCell → BodyCell → page-level React ErrorBoundary
        expect(caught.length).toBeGreaterThan(0);
        expect(caught[0].name).toBe('NotFoundError');
        expect(screen.getByText('page crashed')).toBeInTheDocument();

        // eslint-disable-next-line no-console
        console.info(
            '[BEFORE FIX] NotFoundError reached PageLevelBoundary:',
            caught[0].name,
            '-',
            caught[0].message,
        );

        consoleError.mockRestore();
        consoleWarn.mockRestore();
    });

    it('[AFTER FIX] same DOM mutation with CellErrorBoundary → error caught at cell level, page-level boundary NOT triggered', async () => {
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const warnMessages: string[] = [];
        const consoleWarn = vi
            .spyOn(console, 'warn')
            .mockImplementation((...args: unknown[]) => {
                warnMessages.push(args.map(String).join(' '));
            });

        const caught: Error[] = [];

        const { container, rerender } = render(
            <PageLevelBoundary onCatch={(e) => caught.push(e)}>
                <table>
                    <tbody>
                        <tr>
                            <PostFixBodyCell showValue={true} />
                        </tr>
                    </tbody>
                </table>
            </PageLevelBoundary>,
        );

        const innerSpan = container.querySelector('td > span > span');
        expect(innerSpan).not.toBeNull();
        expect(innerSpan!.textContent).toContain('42,000');

        // Same translation extension DOM mutation
        const mutated = simulateTranslationExtension(container);
        expect(mutated).toBe(true);
        expect(innerSpan!.childNodes[0].nodeName).toBe('FONT');

        // Same re-render that triggers React's removeChild on the moved text node
        await act(async () => {
            rerender(
                <PageLevelBoundary onCatch={(e) => caught.push(e)}>
                    <table>
                        <tbody>
                            <tr>
                                <PostFixBodyCell showValue={false} />
                            </tr>
                        </tbody>
                    </table>
                </PageLevelBoundary>,
            );
        });

        // CellErrorBoundary caught the error — page-level boundary NOT triggered.
        expect(caught).toHaveLength(0);
        expect(screen.queryByText('page crashed')).not.toBeInTheDocument();

        // The cell shows the '-' fallback (CellErrorBoundary's recovery UI).
        expect(screen.getByText('-')).toBeInTheDocument();

        // CellErrorBoundary emitted a console.warn (not an application error).
        const cellBoundaryWarn = warnMessages.find((m) =>
            m.includes('[CellErrorBoundary]'),
        );
        expect(cellBoundaryWarn).toBeDefined();

        // eslint-disable-next-line no-console
        console.info(
            '[AFTER FIX] PageLevelBoundary caught:',
            caught.length,
            'errors (expected 0)',
        );
        // eslint-disable-next-line no-console
        console.info(
            '[AFTER FIX] CellErrorBoundary logged at warn level:',
            cellBoundaryWarn,
        );

        consoleError.mockRestore();
        consoleWarn.mockRestore();
    });
});
