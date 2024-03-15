import { type FC } from 'react';

type Props = {
    source: string;
};

const ReactMarkdownPreview: FC<Props> = ({ source }) => {
    return <>{source}</>;
};

export default ReactMarkdownPreview;
