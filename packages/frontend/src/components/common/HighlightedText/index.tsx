import React, { FC } from 'react';

function escapeRegExpChars(text: string) {
    //eslint-disable-next-line
    return text.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1');
}

type Props = {
    text: string;
    query: string;
    highlightElement: FC;
};

const HighlightedText: FC<Props> = ({ text, query, highlightElement }) => {
    const Highlight = highlightElement;
    let lastIndex = 0;
    const words = query
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .map(escapeRegExpChars);
    if (words.length === 0) {
        return <>text</>;
    }
    const regexp = new RegExp(words.join('|'), 'gi');
    const tokens: React.ReactNode[] = [];
    while (true) {
        const match = regexp.exec(text);
        if (!match) {
            break;
        }
        const length = match[0].length;
        const before = text.slice(lastIndex, regexp.lastIndex - length);
        if (before.length > 0) {
            tokens.push(before);
        }
        lastIndex = regexp.lastIndex;
        tokens.push(<Highlight key={lastIndex}>{match[0]}</Highlight>);
    }
    const rest = text.slice(lastIndex);
    if (rest.length > 0) {
        tokens.push(rest);
    }
    return <>tokens</>;
};

export default HighlightedText;
