import { AnyType } from '@lightdash/common';

function buildXml(
    tag: string,
    props: Record<string, string | number | boolean | null | undefined> | null,
    children: (string | number | boolean | null | undefined)[],
    level: number,
): string {
    const indent = '  '.repeat(level);
    const nextIndent = '  '.repeat(level + 1);

    const attributes = props
        ? Object.entries(props)
              .map(([key, value]) => `${key}="${value}"`)
              .join(' ')
        : '';

    const attributeString = attributes ? ` ${attributes}` : '';

    const filteredChildren = children
        .flat()
        .filter((c) => c !== null && c !== undefined && c !== false)
        .map((c) => String(c))
        .filter((c) => c.trim().length > 0);

    if (filteredChildren.length === 0) {
        return `${indent}<${tag}${attributeString}/>`;
    }

    // detect if children themselves contain XML tags — if yes, indent them properly
    const hasNested = filteredChildren.some((c) => c.trim().startsWith('<'));

    const childrenString = hasNested
        ? // eslint-disable-next-line prefer-template
          '\n' +
          filteredChildren
              .map((c) =>
                  c.trim().startsWith('<')
                      ? c
                            .split('\n')
                            .map((line) => nextIndent + line)
                            .join('\n')
                      : nextIndent + c,
              )
              .join('\n') +
          '\n' +
          indent
        : filteredChildren.join('');

    return `${indent}<${tag}${attributeString}>${childrenString}</${tag}>`;
}

export function xmlBuilder(
    tag: string,
    props: Record<string, string | number | boolean | null | undefined> | null,
    ...children: (string | number | boolean | null | undefined)[]
): string {
    return buildXml(tag, props, children, 0);
}

// JSX namespace declaration for TypeScript
declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: Record<
                string,
                string | number | boolean | null | undefined
            > | null;
        }
        interface Element extends String {}
        interface ElementClass {
            render: AnyType;
        }
    }
}
