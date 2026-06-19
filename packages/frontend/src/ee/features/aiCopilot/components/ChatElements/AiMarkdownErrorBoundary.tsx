import { Text } from '@mantine-8/core';
import { Component, type PropsWithChildren, type ReactNode } from 'react';

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

    render() {
        if (this.state.hasError) {
            return (
                this.props.fallback ?? (
                    <Text size="xs" c="dimmed">
                        Couldn&apos;t render this message.
                    </Text>
                )
            );
        }

        return this.props.children;
    }
}
