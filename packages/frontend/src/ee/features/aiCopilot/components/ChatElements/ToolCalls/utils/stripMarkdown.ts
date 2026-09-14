/**
 * Quick-and-dirty markdown stripper for inline single-line previews. Removes
 * code fences/inline code, links, images, headings, bold/italic, list and
 * blockquote markers, then collapses whitespace.
 */
export const stripMarkdown = (input: string): string =>
    input
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        // Intra-word underscores are not emphasis: keeps snake_case identifiers intact
        .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1$2')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
