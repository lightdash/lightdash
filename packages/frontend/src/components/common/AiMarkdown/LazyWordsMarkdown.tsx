import {
    lazy,
    Suspense,
    type ComponentProps,
    type FC,
    type ReactNode,
} from 'react';
import { AiMarkdownErrorBoundary } from './AiMarkdownErrorBoundary';

// Words compiles its Wasm on import, so only flagged users load it.
const WordsMarkdown = lazy(() =>
    import('./WordsMarkdown').then((module) => ({
        default: module.WordsMarkdown,
    })),
);

type Props = ComponentProps<typeof WordsMarkdown> & {
    /** Shown while Words loads, and instead of it if it fails to load or render. */
    fallback: ReactNode;
};

export const LazyWordsMarkdown: FC<Props> = ({ fallback, ...props }) => (
    <AiMarkdownErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
            <WordsMarkdown {...props} />
        </Suspense>
    </AiMarkdownErrorBoundary>
);
