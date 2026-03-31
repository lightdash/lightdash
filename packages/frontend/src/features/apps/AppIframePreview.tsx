import { useRef, type FC } from 'react';
import { useAppSdkBridge } from './hooks/useAppSdkBridge';

type Props = {
    src: string;
    /**
     * The origin of the preview domain (e.g. "https://apps.example.com").
     * Used to restrict postMessage to/from the iframe.
     */
    previewOrigin: string;
};

/**
 * Renders a sandboxed app preview iframe with a postMessage fetch proxy.
 *
 * The iframe has `sandbox="allow-scripts"` (no `allow-same-origin`),
 * so it cannot access the parent's cookies. The SDK inside the iframe
 * routes all API calls through postMessage, and this component's bridge
 * executes them using the current user's session.
 */
const AppIframePreview: FC<Props> = ({ src, previewOrigin }) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { handleIframeLoad } = useAppSdkBridge(iframeRef, previewOrigin);

    return (
        <iframe
            ref={iframeRef}
            src={src}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="App preview"
            sandbox="allow-scripts allow-same-origin"
            allow=""
            onLoad={handleIframeLoad}
        />
    );
};

export default AppIframePreview;
