import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

/**
 * Cell-level error boundary to catch DOMException errors caused by browser
 * translation extensions (e.g. Google Translate, Grammarly) that modify the
 * DOM behind React's back, causing React's reconciler to throw a
 * NotFoundError (Firefox: "The object can not be found here.").
 *
 * Without this boundary, a single cell render error propagates to the
 * page-level ErrorBoundary and crashes the entire page. With it, only the
 * affected cell shows a '-' fallback, leaving the rest of the table intact.
 */
class CellErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // DOMException NotFoundError is caused by browser translation
        // extensions mutating the DOM. Log at warn level — it's not a
        // Lightdash application error.
        if (error instanceof DOMException || error.name === 'NotFoundError') {
            console.warn(
                '[CellErrorBoundary] DOMException in table cell (likely caused by a browser translation extension):',
                error.message,
                info.componentStack,
            );
        } else {
            console.error(
                '[CellErrorBoundary] Unexpected error in table cell:',
                error,
                info.componentStack,
            );
        }
    }

    render(): ReactNode {
        if (this.state.hasError) {
            // Graceful fallback: show a dash so the table remains usable
            return <span>-</span>;
        }
        return this.props.children;
    }
}

export default CellErrorBoundary;
