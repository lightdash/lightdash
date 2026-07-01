import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
    children: ReactNode;
    /** Custom fallback UI; falls back to a neutral message when omitted. */
    fallback?: ReactNode;
};

type State = { hasError: boolean };

/**
 * Render safety net. A component that throws during render — e.g. a stale field
 * reference on a linked chart whose definition changed in Lightdash — is caught
 * here and shown a fallback instead of crashing the whole app to a blank screen.
 *
 * The template wraps the whole app in one of these (see main.jsx). Wrap each
 * data/chart component in one too so a single bad chart degrades locally
 * instead of taking down everything.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Surface to the iframe console for debugging; never rethrow.
        // eslint-disable-next-line no-console
        console.error(
            '[lightdash] render error caught by ErrorBoundary:',
            error,
            info,
        );
    }

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback !== undefined) return this.props.fallback;
            return (
                <div
                    style={{
                        padding: '16px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        background: 'rgba(148,163,184,0.06)',
                        color: 'rgba(148,163,184,0.9)',
                        font: '13px/1.5 ui-sans-serif, system-ui, sans-serif',
                    }}
                >
                    Couldn’t render this content. If a linked chart’s definition
                    changed in Lightdash, regenerate the app to update its
                    layout.
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
