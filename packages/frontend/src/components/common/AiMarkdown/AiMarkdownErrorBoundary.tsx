import { Text } from '@mantine/core';
import {
    Component,
    type ErrorInfo,
    type PropsWithChildren,
    type ReactNode,
} from 'react';
import i18n from '../../../i18n/i18n';

type Props = PropsWithChildren<{
    fallback?: ReactNode;
}>;

type State = {
    hasError: boolean;
};

export class AiMarkdownErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Failed to render AI markdown', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                this.props.fallback ?? (
                    <Text size="xs" c="dimmed">
                        {i18n.t('aiMarkdown.renderFailed', { ns: 'commonUi' })}
                    </Text>
                )
            );
        }

        return this.props.children;
    }
}
