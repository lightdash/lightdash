import { Editor, type Content } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Image from '@tiptap/extension-image';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { serializeAnnouncementMarkdown } from './serializeAnnouncementMarkdown';

const buildEditor = (content: Content) =>
    new Editor({
        extensions: [Document, Paragraph, Text, Image],
        content,
    });

describe('serializeAnnouncementMarkdown — images', () => {
    it('serializes an image node to markdown image syntax', () => {
        const editor = buildEditor({
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        {
                            type: 'image',
                            attrs: {
                                src: 'https://app.lightdash.com/api/v1/file/abc',
                                alt: 'before.png',
                            },
                        },
                    ],
                },
            ],
        });

        const markdown = serializeAnnouncementMarkdown(editor, 'project-1');

        expect(markdown).toBe(
            '![before.png](https://app.lightdash.com/api/v1/file/abc)',
        );
    });

    it('does not escape the image markdown syntax itself', () => {
        const editor = buildEditor({
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'Before! ' },
                        {
                            type: 'image',
                            attrs: { src: 'https://example.com/a.png', alt: '' },
                        },
                    ],
                },
            ],
        });

        const markdown = serializeAnnouncementMarkdown(editor, 'project-1');

        // The literal "!" in the surrounding text is escaped, but the
        // image's own "![...]()" markup is not.
        expect(markdown).toBe('Before\\! ![](https://example.com/a.png)');
    });
});
