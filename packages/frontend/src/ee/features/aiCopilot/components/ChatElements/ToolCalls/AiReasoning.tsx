import { type AiAgentReasoning } from '@lightdash/common';
import { IconBrain } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import {
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../../../utils/markdownUtils';
import { toggleReasoningPanel } from '../../../store/aiAgentThreadStreamSlice';
import { useAiAgentStoreDispatch } from '../../../store/hooks';
import { ToolCallPaper } from './ToolCallPaper';

type StreamingReasoning = {
    reasoningId: string;
    parts: string[];
};

type AiReasoningProps = {
    reasoning: AiAgentReasoning[] | StreamingReasoning[] | undefined;
    type?: 'persisted' | 'streaming';
    threadUuid: string;
    reasoningPanelOpen?: boolean;
};

export const AiReasoning: FC<AiReasoningProps> = ({
    reasoning,
    type = 'persisted',
    threadUuid,
    reasoningPanelOpen = false,
}) => {
    const mdStyle = useMdEditorStyle();
    const dispatch = useAiAgentStoreDispatch();

    const handleToggle = (opened: boolean) => {
        dispatch(toggleReasoningPanel({ threadUuid, opened }));
    };

    if (!reasoning || reasoning.length === 0) return null;

    const nonEmptyReasoning = reasoning.filter((r) => {
        if (type === 'persisted') {
            return (r as AiAgentReasoning).text !== '';
        }
        return (r as StreamingReasoning).parts.some((part) => part !== '');
    });

    if (nonEmptyReasoning.length === 0) return null;

    const isControlled = type === 'streaming';

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
        <ToolCallPaper
            {...(isControlled && {
                opened: reasoningPanelOpen,
                onToggle: handleToggle,
            })}
            defaultOpened={false}
            variant="dashed"
            icon={IconBrain}
            title="Reasoning"
        >
            <MDEditor.Markdown
                rehypeRewrite={rehypeRemoveHeaderLinks}
                source={allReasoningText}
                style={{
                    ...mdStyle,
                    padding: '0.5rem 0',
                    fontSize: '0.875rem',
                    color: 'var(--mantine-color-gray-7)',
                }}
                components={mdEditorComponents}
            />
        </ToolCallPaper>
    );
};
