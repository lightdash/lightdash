import { type AiAgentReasoning } from '@lightdash/common';
import { Accordion } from '@mantine-8/core';
import { IconBrain } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { type FC } from 'react';
import {
    mdEditorComponents,
    rehypeRemoveHeaderLinks,
    useMdEditorStyle,
} from '../../../../../../utils/markdownUtils';
import { ToolCallPaper } from './ToolCallPaper';

type AiReasoningProps = {
    reasoning: AiAgentReasoning[] | undefined;
};

export const AiReasoning: FC<AiReasoningProps> = ({ reasoning }) => {
    const mdStyle = useMdEditorStyle();

    if (!reasoning || reasoning.length === 0) return null;

    return (
        <ToolCallPaper
            defaultOpened={false}
            variant="dashed"
            icon={IconBrain}
            title="Reasoning"
        >
            <Accordion
                pt="xs"
                variant="contained"
                chevronPosition="left"
                styles={{
                    label: {
                        paddingTop: '0.5rem',
                        paddingBottom: '0.5rem',
                    },
                    chevron: {
                        marginLeft: '0.5rem',
                        marginRight: '0.5rem',
                    },
                }}
            >
                {reasoning.map((r) => {
                    const lines = r.text.split('\n');
                    const firstLine = lines[0];
                    const restOfContent = lines.slice(1).join('\n').trim();

                    return (
                        <Accordion.Item key={r.uuid} value={r.uuid}>
                            <Accordion.Control>
                                <MDEditor.Markdown
                                    rehypeRewrite={rehypeRemoveHeaderLinks}
                                    source={firstLine}
                                    style={{
                                        ...mdStyle,
                                        fontSize: '0.75rem',
                                        color: 'var(--mantine-color-gray-7)',
                                    }}
                                    components={mdEditorComponents}
                                />
                            </Accordion.Control>
                            {restOfContent && (
                                <Accordion.Panel>
                                    <MDEditor.Markdown
                                        rehypeRewrite={rehypeRemoveHeaderLinks}
                                        source={restOfContent}
                                        style={{
                                            ...mdStyle,
                                            fontSize: '0.75rem',
                                            color: 'var(--mantine-color-gray-7)',
                                        }}
                                        components={mdEditorComponents}
                                    />
                                </Accordion.Panel>
                            )}
                        </Accordion.Item>
                    );
                })}
            </Accordion>
        </ToolCallPaper>
    );
};
