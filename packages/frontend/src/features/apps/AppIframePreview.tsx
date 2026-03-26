import { type FC } from 'react';

type Props = {
    src: string;
};

/**
 * Renders a sandboxed app preview iframe.
 *
 * The iframe does NOT have `allow-same-origin`, so it cannot access
 * the parent's cookies. All data queries go through a postMessage
 * bridge (see useAppSdkBridge).
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
