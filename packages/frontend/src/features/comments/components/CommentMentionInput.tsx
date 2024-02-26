window.global ||= window;
import Editor from '@draft-js-plugins/editor';
import createMentionPlugin, {
    defaultSuggestionsFilter,
    MentionData,
} from '@draft-js-plugins/mention';
import { MantineTheme, Text, useMantineTheme } from '@mantine/core';
import { EditorProps, EditorState } from 'draft-js';
import { FC, useCallback, useMemo, useRef, useState } from 'react';
import styled, { css } from 'styled-components';

import '@draft-js-plugins/mention/lib/plugin.css';
import 'draft-js/dist/Draft.css';

const EditorContainer = styled.div`
    ${({ theme }: { theme: MantineTheme }) => css`
        font-size: ${theme.fontSizes.xs};
        box-sizing: border-box;
        border: 1px solid ${theme.colors.gray[3]};
        cursor: text;
        padding: 4px;
        border-radius: ${theme.radius.sm};
        max-height: 100px;
        overflow-y: scroll;

        &:global(.public-DraftEditor-content) {
            min-height: 16px;
        }

        & {
            [role='listbox'] {
                box-shadow: ${theme.shadows.sm};
                border-radius: ${theme.radius.sm};
                font-size: ${theme.fontSizes.xs};
                font-weight: 500;
                padding: 4px;
            }
        }
    `}
`;

type Props = {
    mentions: MentionData[];
    editorState: EditorState;
    setEditorState: (editorState: EditorState) => void;
} & Pick<EditorProps, 'placeholder'>;

export const CommentMentionInput: FC<Props> = ({
    editorState,
    setEditorState,
    mentions,
    placeholder,
}) => {
    const theme = useMantineTheme();
    const ref = useRef<Editor>(null);

    const [open, setOpen] = useState(false);
    const [suggestions, setSuggestions] = useState(mentions);

    const { MentionSuggestions, plugins } = useMemo(() => {
        const mentionPlugin = createMentionPlugin({
            mentionPrefix: '@',
            mentionComponent: (mentionProps) => (
                <Text
                    span
                    data-offset-key={mentionProps.entityKey}
                    style={{
                        color: theme.colors.blue[6],
                        fontWeight: 500,
                        fontSize: theme.fontSizes.xs,
                    }}
                >
                    {mentionProps.children}
                </Text>
            ),
        });

        return {
            plugins: [mentionPlugin],
            MentionSuggestions: mentionPlugin.MentionSuggestions,
        };
    }, [theme.colors.blue, theme.fontSizes.xs]);

    const onOpenChange = useCallback((_open: boolean) => {
        setOpen(_open);
    }, []);
    const onSearchChange = useCallback(
        ({ value }: { value: string }) => {
            setSuggestions(defaultSuggestionsFilter(value, mentions));
        },
        [mentions],
    );

    return (
        <EditorContainer
            theme={theme}
            onClick={() => {
                ref.current!.focus();
            }}
        >
            <Editor
                editorKey={'editor'}
                editorState={editorState}
                onChange={setEditorState}
                plugins={plugins}
                ref={ref}
                placeholder={placeholder}
            />
            <MentionSuggestions
                open={open}
                onOpenChange={onOpenChange}
                suggestions={suggestions}
                onSearchChange={onSearchChange}
            />
        </EditorContainer>
    );
};
