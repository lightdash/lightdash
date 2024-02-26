import Editor from '@draft-js-plugins/editor';
import createMentionPlugin from '@draft-js-plugins/mention';
import '@draft-js-plugins/mention/lib/plugin.css';
import { Comment } from '@lightdash/common';
import { Text, useMantineTheme } from '@mantine/core';
import {
    CompositeDecorator,
    convertFromRaw,
    DraftDecorator,
    EditorState,
} from 'draft-js';
import { flattenDeep } from 'lodash';
import { useMemo } from 'react';

export const CommentTextWithMentions = ({ text }: Pick<Comment, 'text'>) => {
    const theme = useMantineTheme();

    const plugins = useMemo(() => {
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

        return [mentionPlugin];
    }, [theme.colors.blue, theme.fontSizes.xs]);

    const decorators = flattenDeep(
        plugins // Reference: https://github.com/draft-js-plugins/draft-js-plugins/issues/1095#issuecomment-711464903
            .map((plugin) => plugin.decorators)
            .filter(
                (decorator): decorator is NonNullable<typeof decorator> =>
                    decorator !== undefined,
            ),
    ).filter(
        (decorator): decorator is DraftDecorator =>
            'component' in decorator &&
            decorator.component !== undefined &&
            'strategy' in decorator &&
            decorator.strategy !== undefined,
    );

    const decorator = new CompositeDecorator(
        decorators.filter((_, index) => index !== 1),
    );
    return (
        <Editor
            readOnly
            plugins={plugins}
            editorState={EditorState.createWithContent(
                convertFromRaw(JSON.parse(text)),
                decorator,
            )}
            // NOTE: Keep this onChange prop as it is required by the Editor component to mount
            onChange={() => {}}
        />
    );
};
