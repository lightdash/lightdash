import { type AiAgentReasoning } from '@lightdash/common';
import { IconBrain } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import {
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../../../utils/markdownUtils';
import { ToolCallContainer } from './ToolCallContainer';

type StreamingReasoning = {
    reasoningId: string;
    parts: string[];
};

type AiReasoningProps = {
    reasoning: AiAgentReasoning[] | StreamingReasoning[] | undefined;
    type?: 'persisted' | 'streaming';
};

export const AiReasoning: FC<AiReasoningProps> = ({
    reasoning,
    type = 'persisted',
}) => {
    const mdStyle = useMdEditorStyle();

    if (!reasoning || reasoning.length === 0) return null;

    const nonEmptyReasoning = reasoning.filter((r) => {
        if (type === 'persisted') {
            return (r as AiAgentReasoning).text !== '';
        }
        return (r as StreamingReasoning).parts.some((part) => part !== '');
    });

    if (nonEmptyReasoning.length === 0) return null;

    // Combine all reasoning into one markdown text
    const allReasoningText = nonEmptyReasoning
        .map((r) => {
            if (type === 'streaming') {
                return (r as StreamingReasoning).parts.join('\n\n');
            }
            return (r as AiAgentReasoning).text;
        })
        .join('\n\n---\n\n');

    return (
        <ToolCallContainer
            defaultOpened={type !== 'persisted'}
            title="Reasoning"
            isStreaming={type === 'streaming'}
            enableIconAnimation={false}
            icon={IconBrain}
        >
            <MDEditor.Markdown
                rehypeRewrite={rehypeRemoveHeaderLinks}
                source={allReasoningText}
                style={{
                    ...mdStyle,
                    padding: '0.5rem 0',
                    fontSize: 'var(--mantine-font-size-xs)',
                    color: 'var(--mantine-color-ldGray-7)',
                }}
                components={mdEditorComponents}
            />
        </ToolCallContainer>
    );
};
