import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

const parser = unified().use(remarkParse).use(remarkGfm);
const richTextNodes = new Set([
    'root',
    'paragraph',
    'text',
    'heading',
    'strong',
    'emphasis',
    'delete',
    'inlineCode',
    'code',
    'blockquote',
    'list',
    'listItem',
    'thematicBreak',
    'link',
    'break',
]);

export const supportsRichTextEditing = (markdown: string) => {
    let supported = true;
    visit(parser.parse(markdown), (node) => {
        if (
            !richTextNodes.has(node.type) ||
            ('checked' in node && node.checked != null) ||
            ('meta' in node && node.meta != null)
        ) {
            supported = false;
        }
    });
    return supported;
};
