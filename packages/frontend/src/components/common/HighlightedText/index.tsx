import React, { FC } from 'react';

type Props = {
    text: string;
    query: string;
    highlightElement: FC;
};

export const HighlightedText: FC<Props> = ({
    text = '',
    query = '',
    highlightElement,
}) => {
    const Highlight = highlightElement;
    if (!query.trim()) {
        return <span>{text}</span>;
    }
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);

    return (
        <span>
            {parts.filter(String).map((part, i) => {
                return regex.test(part) ? (
                    <Highlight key={i}>{part}</Highlight>
                ) : (
                    <span key={i}>{part}</span>
                );
            })}
        </span>
    );
};

export default HighlightedText;
