import { useEffect, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
    getMcpAppExplorerCommandHandler,
    getMcpAppParentOrigin,
    postToMcpAppParent,
} from './mcpAppFrame';
import {
    isExternalHttpUrl,
    parseFrameRequest,
    resolveSameOriginPath,
} from './mcpAppFrameProtocol';

const PAGE_REPORT_DELAY_MS = 300;

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

const ActiveMcpAppFrameBridge: FC<{ parentOrigin: string }> = ({
    parentOrigin,
}) => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.mcpAppFrame = 'true';
        root.style.setProperty('--navbar-height', '0px');
        root.style.setProperty('--banner-height', '0px');
    }, []);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            postToMcpAppParent({
                type: 'lightdash:frame:page',
                url: window.location.href,
                title: document.title,
            });
        }, PAGE_REPORT_DELAY_MS);
        return () => window.clearTimeout(timeout);
    }, [location.pathname, location.search]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.source !== window.parent) return;
            if (event.origin !== parentOrigin) return;
            const request = parseFrameRequest(event.data);
            if (!request) return;
            const reply = (ok: boolean, result?: unknown, error?: string) =>
                postToMcpAppParent({
                    type: 'lightdash:frame:result',
                    id: request.id,
                    ok,
                    result,
                    error,
                });

            if (request.command === 'navigate') {
                const path = resolveSameOriginPath(
                    request.args.path,
                    window.location.origin,
                );
                if (path === null) {
                    reply(false, undefined, 'The path is not on this site');
                    return;
                }
                void navigate(path);
                reply(true, { path });
                return;
            }

            const handler = getMcpAppExplorerCommandHandler();
            if (!handler) {
                reply(
                    false,
                    undefined,
                    'No Explore is open. Open an Explore or chart first.',
                );
                return;
            }
            handler(request).then(
                (result) => reply(true, result),
                (error: unknown) =>
                    reply(false, undefined, getErrorMessage(error)),
            );
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [navigate, parentOrigin]);

    useEffect(() => {
        const openOutside = (url: string) => {
            if (isExternalHttpUrl(url)) {
                postToMcpAppParent({ type: 'lightdash:frame:openLink', url });
            }
        };
        const onClick = (event: MouseEvent) => {
            if (!(event.target instanceof Element)) return;
            const anchor = event.target.closest('a[target="_blank"]');
            if (!(anchor instanceof HTMLAnchorElement) || !anchor.href) return;
            event.preventDefault();
            openOutside(anchor.href);
        };
        const originalOpen = window.open;
        window.open = (url?: string | URL) => {
            if (url !== undefined) {
                openOutside(new URL(url, window.location.href).href);
            }
            return null;
        };
        document.addEventListener('click', onClick, true);
        return () => {
            document.removeEventListener('click', onClick, true);
            window.open = originalOpen;
        };
    }, []);

    return null;
};

const McpAppFrameBridge: FC = () => {
    const parentOrigin = getMcpAppParentOrigin();
    return parentOrigin ? (
        <ActiveMcpAppFrameBridge parentOrigin={parentOrigin} />
    ) : null;
};

export default McpAppFrameBridge;
