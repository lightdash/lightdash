import { Skeleton } from '@mantine/core';
import { lazy, Suspense, type FC } from 'react';
import { type SuggestionsItem } from '../../types';

// Lazy import the Editor type to avoid importing tiptap at the top level
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type LazyEditor = import('@tiptap/react').Editor;

// Lazy load the CommentWithMentions component to reduce initial bundle size
// This component includes heavy prosemirror dependencies via @tiptap and @mantine/tiptap
const CommentWithMentionsComponent = lazy(() =>
    import('./index').then((module) => ({
        default: module.CommentWithMentions,
    })),
);

type Props = {
    suggestions?: SuggestionsItem[];
    content?: string;
    onUpdate?: (editor: LazyEditor | null) => void;
    shouldClearEditor?: boolean;
    setShouldClearEditor?: (shouldClearEditor: boolean) => void;
};

export const LazyCommentWithMentions: FC<Props> = (props) => (
    <Suspense fallback={<Skeleton height={60} radius="sm" />}>
        <CommentWithMentionsComponent {...props} />
    </Suspense>
);
