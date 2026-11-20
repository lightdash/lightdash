import { FeatureFlags } from '@lightdash/common';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { AiMarkdown } from './AiMarkdown';
import { LazyWordsMarkdown } from './LazyWordsMarkdown';

type Props = {
    children: string;
    className?: string;
};

/** Plain agent-thread markdown: Words when `ai-agent-words-markdown` is on, else Streamdown. */
export const AgentMarkdown: FC<Props> = ({ children, className }) => {
    const { data: wordsFlag } = useServerFeatureFlag(
        FeatureFlags.AiAgentWordsMarkdown,
    );
    const streamdown = (
        <AiMarkdown className={className}>{children}</AiMarkdown>
    );
    return wordsFlag?.enabled ? (
        <LazyWordsMarkdown
            isStreaming={false}
            className={className}
            fallback={streamdown}
        >
            {children}
        </LazyWordsMarkdown>
    ) : (
        streamdown
    );
};
