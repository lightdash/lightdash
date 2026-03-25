import { type FC } from 'react';

type Props = {
    src: string;
};

/**
 * Renders an app iframe. The iframe authenticates directly using
 * a token passed in the URL hash fragment.
 */
const AppIframePreview: FC<Props> = ({ src }) => {
    return (
        <iframe
            src={src}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="App preview"
            sandbox="allow-scripts allow-same-origin"
            allow=""
        />
    );
};

export default AppIframePreview;
