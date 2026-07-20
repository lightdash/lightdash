import { ContentType } from '@lightdash/common';
import { Editor, type Content } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Link from '@tiptap/extension-link';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Markdown } from 'tiptap-markdown';
import { describe, expect, it } from 'vitest';
import {
    createMentionMarkdownExtension,
    hydrateContentMentions,
} from './contentMentionMarkdown';

const PROJECT = 'proj-1';

const buildEditor = (content: Content) =>
    new Editor({
        extensions: [
            Document,
            Paragraph,
            Text,
            Link.configure({ autolink: false }),
            Markdown.configure({ html: false }),
            createMentionMarkdownExtension(PROJECT),
        ],
        content,
    });

const getMarkdown = (editor: Editor): string => {
    const { markdown } = editor.storage as {
        markdown: { getMarkdown: () => string };
    };
    return markdown.getMarkdown();
};

const mentionDoc = (attrs: Record<string, unknown>) => ({
    type: 'doc',
    content: [
        {
            type: 'paragraph',
            content: [
                { type: 'text', text: 'See ' },
                { type: 'contentMention', attrs },
            ],
        },
    ],
});

describe('createMentionMarkdownExtension — serialize', () => {
    it('serializes a dashboard mention to a markdown link', () => {
        expect(
            getMarkdown(
                buildEditor(
                    mentionDoc({
                        contentType: ContentType.DASHBOARD,
                        uuid: 'dash-1',
                        label: 'Revenue',
                    }),
                ),
            ),
        ).toBe('See [Revenue](/projects/proj-1/dashboards/dash-1/view)');
    });

    it('serializes a chart mention to the saved-chart link', () => {
        expect(
            getMarkdown(
                buildEditor(
                    mentionDoc({
                        contentType: ContentType.CHART,
                        uuid: 'chart-1',
                        label: 'Signups',
                    }),
                ),
            ),
        ).toBe('See [Signups](/projects/proj-1/saved/chart-1/view)');
    });

    it('escapes brackets in labels so bracketed names do not break the link', () => {
        expect(
            getMarkdown(
                buildEditor(
                    mentionDoc({
                        contentType: ContentType.CHART,
                        uuid: 'chart-1',
                        label: '[TC Test] Revenue',
                    }),
                ),
            ),
        ).toBe(
            'See [\\[TC Test\\] Revenue](/projects/proj-1/saved/chart-1/view)',
        );
    });
});

describe('hydrateContentMentions', () => {
    it('turns a mention-shaped markdown link back into a mention node', () => {
        const editor = buildEditor(
            'See [Revenue](/projects/proj-1/dashboards/dash-1/view)',
        );
        hydrateContentMentions(editor);
        const mentions: Array<Record<string, unknown>> = [];
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'contentMention') mentions.push(node.attrs);
        });
        expect(mentions).toHaveLength(1);
        expect(mentions[0]).toMatchObject({
            contentType: ContentType.DASHBOARD,
            uuid: 'dash-1',
            label: 'Revenue',
        });
    });

    it('leaves ordinary links untouched', () => {
        const editor = buildEditor('See [docs](https://example.com)');
        hydrateContentMentions(editor);
        let mentionCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'contentMention') mentionCount += 1;
        });
        expect(mentionCount).toBe(0);
    });
});
