import { Box } from '@mantine/core';
import { emojify } from 'node-emoji';
import { createElement, type CSSProperties, type ReactNode } from 'react';
import { CodeBlockSlot, LinkSlot } from './WordsSlots';

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

const convertChildren = (parent: ParentNode, inCode: boolean): ReactNode[] =>
    Array.from(parent.childNodes, (child, index) =>
        convertNode(child, index, inCode),
    );

function convertNode(node: Node, key: number, inCode: boolean): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue ?? '';
        return inCode ? text : withEmoji(text);
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
            <Box key={key} data-markdown="table-wrapper">
                <Box>{element}</Box>
            </Box>
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
