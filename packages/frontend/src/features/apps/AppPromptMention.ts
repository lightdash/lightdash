/**
 * Element-reference mention node for the data-app prompt composer. References
 * picked from the iframe inspector render as inline pills but serialize back
 * to the bracketed wire format (`[h1 "FORMULA 1" @src/App.jsx:14]`) so the
 * agent receives the same text it always has.
 */

import Mention from '@tiptap/extension-mention';
import { type Editor, type JSONContent } from '@tiptap/react';
import classes from './AppPromptMention.module.css';

export type ElementRef = {
    /** Rendered HTML tag (e.g. `h1`, `div`, `button`). */
    tag: string;
    /** Visible text content of the clicked element, possibly truncated. */
    text: string;
    /** Build-time source location `path:line`. Empty when unavailable. */
    loc: string;
};

const ELEMENT_REF_NAME = 'elementRef';

function refToWireString({ tag, text, loc }: ElementRef): string {
    const head = text ? `${tag} "${text}"` : tag;
    return loc ? `[${head} @${loc}]` : `[${head}]`;
}

function pillInner(tag: string, text: string): string {
    return text ? `<${tag}> ${text}` : `<${tag}>`;
}

export const ElementMention = Mention.extend({
    name: ELEMENT_REF_NAME,
    // Pills behave as a single character — backspace deletes the whole pill.
    atom: true,
    addAttributes() {
        return {
            tag: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-tag') ?? '',
                renderHTML: (attrs) =>
                    attrs.tag ? { 'data-tag': attrs.tag } : {},
            },
            text: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-text') ?? '',
                renderHTML: (attrs) =>
                    attrs.text ? { 'data-text': attrs.text } : {},
            },
            loc: {
                default: '',
                parseHTML: (el) => el.getAttribute('data-loc') ?? '',
                renderHTML: (attrs) =>
                    attrs.loc ? { 'data-loc': attrs.loc } : {},
            },
        };
    },
    // The base Mention Backspace handler replaces the pill with its suggestion
    // char (`@`); we have no autocomplete, so delete the pill outright.
    addKeyboardShortcuts() {
        return {
            Backspace: () =>
                this.editor.commands.command(({ tr, state }) => {
                    const { selection } = state;
                    const { empty, anchor } = selection;
                    if (!empty || anchor <= 0) return false;
                    let deleted = false;
                    state.doc.nodesBetween(
                        Math.max(0, anchor - 1),
                        anchor,
                        (node, pos) => {
                            if (node.type.name === this.name) {
                                tr.delete(pos, pos + node.nodeSize);
                                deleted = true;
                                return false;
                            }
                        },
                    );
                    return deleted;
                }),
        };
    },
    // Explicit NodeView so the contenteditable surface gets the pill DOM we
    // want — the CSS-module class wasn't reliably landing through renderHTML.
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('span');
            dom.className = classes.elementPill;
            dom.contentEditable = 'false';
            dom.textContent = pillInner(
                (node.attrs.tag as string) || '',
                (node.attrs.text as string) || '',
            );
            if (node.attrs.tag) {
                dom.setAttribute('data-tag', node.attrs.tag as string);
            }
            if (node.attrs.text) {
                dom.setAttribute('data-text', node.attrs.text as string);
            }
            if (node.attrs.loc) {
                dom.setAttribute('data-loc', node.attrs.loc as string);
                dom.setAttribute('title', `Source: ${node.attrs.loc}`);
            }
            return { dom };
        };
    },
}).configure({
    // What `editor.getText()` returns — the wire format the agent sees.
    renderText: ({ node }) =>
        refToWireString({
            tag: node.attrs.tag ?? '',
            text: node.attrs.text ?? '',
            loc: node.attrs.loc ?? '',
        }),
    // Used for getHTML()/copy — match the NodeView output.
    renderHTML: ({ node }) => [
        'span',
        { class: classes.elementPill, contenteditable: 'false' },
        pillInner(
            (node.attrs.tag as string) || '',
            (node.attrs.text as string) || '',
        ),
    ],
});

/**
 * Content to insert for a picked element. Each reference starts on its own
 * line so multiple picks stack into a list; the trailing space keeps typed
 * text off the pill.
 */
export function buildElementRefInsert(
    editor: Editor,
    elementRef: ElementRef,
): JSONContent[] {
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(0, from, '\n', '\n');
    const needsBreak = before.length > 0 && !before.endsWith('\n');
    return [
        ...(needsBreak ? [{ type: 'hardBreak' }] : []),
        {
            type: ELEMENT_REF_NAME,
            attrs: {
                tag: elementRef.tag,
                text: elementRef.text,
                loc: elementRef.loc,
            },
        },
        { type: 'text', text: ' ' },
    ];
}
