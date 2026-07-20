import { ContentType } from '@lightdash/common';
import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { Markdown } from 'tiptap-markdown';
import { describe, expect, it } from 'vitest';
import { createMentionMarkdownExtension } from './contentMentionMarkdown';

const PROJECT = 'proj-1';

const buildMarkdown = (mentionAttrs: Record<string, unknown>): string => {
    const editor = new Editor({
        extensions: [
            Document,
            Paragraph,
            Text,
            Markdown.configure({ html: false }),
            createMentionMarkdownExtension(PROJECT),
        ],
        content: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'See ' },
                        { type: 'contentMention', attrs: mentionAttrs },
                    ],
                },
            ],
        },
    });
    const { markdown } = editor.storage as {
        markdown: { getMarkdown: () => string };
    };
    return markdown.getMarkdown();
};

describe('createMentionMarkdownExtension', () => {
    it('serializes a dashboard mention to a markdown link', () => {
        expect(
            buildMarkdown({
                contentType: ContentType.DASHBOARD,
                uuid: 'dash-1',
                label: 'Revenue',
            }),
        ).toBe('See [Revenue](/projects/proj-1/dashboards/dash-1/view)');
    });

    it('serializes a chart mention to the saved-chart link', () => {
        expect(
            buildMarkdown({
                contentType: ContentType.CHART,
                uuid: 'chart-1',
                label: 'Signups',
            }),
        ).toBe('See [Signups](/projects/proj-1/saved/chart-1/view)');
    });
});
