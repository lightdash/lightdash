import { emojify } from 'node-emoji';
import {
    createElement,
    Fragment,
    type CSSProperties,
    type ReactNode,
} from 'react';
import {
    TOKEN_END,
    TOKEN_REGEX,
    TOKEN_START,
    type InlineTagToken,
} from './wordsContext';
import {
    CodeBlockSlot,
    InlineTagSlot,
    LinkSlot,
    RawTokenText,
} from './WordsSlots';

const FENCED_CODE_REGEX = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g;
const ATTRIBUTE_REGEX = /([a-zA-Z_:][-\w:.]*)="([^"]*)"/g;

const LINE_BREAK_REGEX = /<br\s*\/?>/gi;

/**
 * Words omits raw HTML, so `<br>` and known inline tags outside code fences
 * become private-use tokens that render as React.
 */
export const extractInlineTags = (
    source: string,
    tagNames: string[],
): { source: string; tokens: InlineTagToken[] } => {
    const tagRegex =
        tagNames.length > 0
            ? new RegExp(
                  `<(${tagNames.join('|')})((?:\\s+[a-zA-Z_:][-\\w:.]*="[^"]*")*)\\s*(?:\\/>|>\\s*<\\/\\1\\s*>)`,
                  'g',
              )
            : null;
    const tokens: InlineTagToken[] = [];
    const tokenFor = (token: InlineTagToken) => {
        tokens.push(token);
        return `${TOKEN_START}${tokens.length - 1}${TOKEN_END}`;
    };
    const replaceTags = (prose: string) => {
        const withBreaks = prose.replace(LINE_BREAK_REGEX, (raw) =>
            tokenFor({ name: 'br', attributes: {}, raw }),
        );
        return tagRegex
            ? withBreaks.replace(
                  tagRegex,
                  (raw, name: string, attributeText: string) =>
                      tokenFor({
                          name,
                          attributes: Object.fromEntries(
                              Array.from(
                                  attributeText.matchAll(ATTRIBUTE_REGEX),
                                  (m) => [m[1], m[2]],
                              ),
                          ),
                          raw,
                      }),
              )
            : withBreaks;
    };

    let result = '';
    let cursor = 0;
    for (const match of source.matchAll(FENCED_CODE_REGEX)) {
        result += replaceTags(source.slice(cursor, match.index)) + match[0];
        cursor = match.index + match[0].length;
    }
    result += replaceTags(source.slice(cursor));
    return { source: result, tokens };
};

const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input']);
const BOOLEAN_ATTRIBUTES = new Set(['checked', 'disabled', 'readonly']);
const REACT_ATTRIBUTE_NAMES: Record<string, string> = {
    class: 'className',
    readonly: 'readOnly',
};

const parseStyle = (style: string): CSSProperties =>
    Object.fromEntries(
        style
            .split(';')
            .map((declaration) => declaration.split(':'))
            .filter(([property, value]) => property?.trim() && value)
            .map(([property, value]) => [
                property
                    .trim()
                    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
                value.trim(),
            ]),
    );

const toReactProps = (element: Element): Record<string, unknown> => {
    const props: Record<string, unknown> = {};
    for (const { name, value } of Array.from(element.attributes)) {
        if (name === 'style') props.style = parseStyle(value);
        else if (BOOLEAN_ATTRIBUTES.has(name))
            props[REACT_ATTRIBUTE_NAMES[name] ?? name] = true;
        else props[REACT_ATTRIBUTE_NAMES[name] ?? name] = value;
    }
    return props;
};

const attributesOf = (element: Element): Record<string, string> =>
    Object.fromEntries(
        Array.from(element.attributes, ({ name, value }) => [
            REACT_ATTRIBUTE_NAMES[name] ?? name,
            value,
        ]),
    );

const withEmoji = (text: string) => (text.includes(':') ? emojify(text) : text);

const proseText = (text: string, key: number): ReactNode => {
    if (!text.includes(TOKEN_START)) return withEmoji(text);
    const parts: ReactNode[] = [];
    let cursor = 0;
    for (const match of text.matchAll(TOKEN_REGEX)) {
        if (match.index > cursor)
            parts.push(withEmoji(text.slice(cursor, match.index)));
        parts.push(
            <InlineTagSlot
                key={`${key}-${match.index}`}
                index={Number(match[1])}
            />,
        );
        cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parts.push(withEmoji(text.slice(cursor)));
    return <Fragment key={key}>{parts}</Fragment>;
};

const convertChildren = (parent: ParentNode, inCode: boolean): ReactNode[] =>
    Array.from(parent.childNodes, (child, index) =>
        convertNode(child, index, inCode),
    );

function convertNode(node: Node, key: number, inCode: boolean): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue ?? '';
        if (!inCode) return proseText(text, key);
        return text.includes(TOKEN_START) ? (
            <RawTokenText key={key} text={text} />
        ) : (
            text
        );
    }
    if (!(node instanceof Element)) return null;

    const tag = node.localName;
    const isCode = inCode || tag === 'code' || tag === 'pre';

    if (tag === 'a') {
        return (
            <LinkSlot
                key={key}
                attributes={attributesOf(node)}
                text={node.textContent ?? ''}
            >
                {convertChildren(node, isCode)}
            </LinkSlot>
        );
    }

    const element = createElement(
        tag,
        { ...toReactProps(node), key },
        ...(VOID_ELEMENTS.has(tag) ? [] : convertChildren(node, isCode)),
    );

    if (tag === 'table') {
        return (
            <div key={key} data-markdown="table-wrapper">
                <div>{element}</div>
            </div>
        );
    }
    if (node.getAttribute('data-markdown') === 'code-block') {
        return (
            <CodeBlockSlot
                key={key}
                language={node.getAttribute('data-language') ?? ''}
                code={node.querySelector('pre code')?.textContent ?? ''}
                isIncomplete={node.getAttribute('data-incomplete') === 'true'}
                fallback={element}
            />
        );
    }
    return element;
}

const CARET_HOSTS = new Set([
    'p',
    'li',
    'td',
    'th',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
]);

/** Puts the caret at the end of the last text block, as Words' own DOM renderer does. */
const appendCaret = (fragment: DocumentFragment) => {
    let host: Element | null = null;
    for (
        let element = fragment.lastElementChild;
        element;
        element = element.lastElementChild
    ) {
        if (CARET_HOSTS.has(element.localName)) host = element;
        if (element.localName === 'pre') break;
    }
    const caret = document.createElement('span');
    caret.setAttribute('data-markdown', 'caret');
    caret.setAttribute('aria-hidden', 'true');
    (host ?? fragment).append(caret);
};

export const wordsHtmlToReact = (
    html: string,
    { withCaret }: { withCaret: boolean },
): ReactNode[] => {
    const template = document.createElement('template');
    template.innerHTML = html;
    if (withCaret) appendCaret(template.content);
    return convertChildren(template.content, false);
};
