import { useRef, type FC } from 'react';
import { useAppSdkBridge } from './hooks/useAppSdkBridge';

type Props = {
    src: string;
    projectUuid: string;
};

/**
 * Renders a sandboxed app preview iframe with a postMessage bridge.
 *
 * The iframe has `sandbox="allow-scripts"` (no `allow-same-origin`),
 * so it cannot access the parent's cookies. All data queries from the
 * SDK inside the iframe go through the postMessage bridge, where the
 * parent executes them using its own authenticated session.
 */
const AppIframePreview: FC<Props> = ({ src, projectUuid }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { handleIframeLoad } = useAppSdkBridge(projectUuid, iframeRef);

    return (
        <iframe
            ref={iframeRef}
            src={src}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="App preview"
            sandbox="allow-scripts"
            allow=""
            onLoad={handleIframeLoad}
        />
    );
};

export default AppIframePreview;
