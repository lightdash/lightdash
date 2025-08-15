export function xmlBuilder(
    tag: string,
    props: Record<string, string | number | boolean> | null,
    ...children: (string | null | undefined)[]
): string {
    const attributes = props
        ? Object.entries(props)
              .map(([key, value]) => `${key}="${value}"`)
              .join(' ')
        : '';

    const attributeString = attributes ? ` ${attributes}` : '';
    const filteredChildren = children
        .flat()
        .filter((child) => child != null) as string[];

    if (filteredChildren.length === 0) {
        return `<${tag}${attributeString}/>`;
    }

    const childrenString = filteredChildren.join('');
    return `<${tag}${attributeString}>${childrenString}</${tag}>`;
}

// JSX namespace declaration for TypeScript
declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: Record<
                string,
                string | number | boolean
            > | null;
        }
    }
}
