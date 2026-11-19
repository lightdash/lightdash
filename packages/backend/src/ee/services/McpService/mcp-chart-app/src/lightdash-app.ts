import {
    App,
    applyDocumentTheme,
    applyHostStyleVariables,
    type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

const SIGN_IN_TOOL = 'get_lightdash_app_sign_in_url';
const INLINE_HEIGHT = 640;

const frame = document.getElementById('lightdash-frame') as HTMLIFrameElement;
const status = document.getElementById('status') as HTMLDivElement;
const statusText = document.getElementById(
    'status-text',
) as HTMLParagraphElement;
const openButton = document.getElementById('open-btn') as HTMLButtonElement;

let pageUrl: string | null = null;
let signedInOrigin: string | null = null;
let currentPage: { url: string; title: string | null } | null = null;

const app = new App(
    { name: 'Lightdash', version: '1.0.0' },
    {
        availableDisplayModes: ['inline', 'fullscreen'],
        tools: { listChanged: true },
    },
    { autoResize: false },
);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function showStatus(text: string, canOpen: boolean): void {
    statusText.textContent = text;
    openButton.hidden = !canOpen;
    status.hidden = false;
}

function originMatches(pattern: string, origin: string): boolean {
    if (pattern === origin) return true;
    const wildcard = pattern.match(/^https:\/\/\*\.(.+)$/);
    if (!wildcard) return false;
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith(`.${wildcard[1]}`);
}

function canFrame(origin: string): boolean {
    const allowed = app.getHostCapabilities()?.sandbox?.csp?.frameDomains;
    if (allowed === undefined) return true;
    return allowed.some((pattern) => originMatches(pattern, origin));
}

function getPageUrl(result: unknown): string | null {
    if (!isRecord(result) || !isRecord(result.structuredContent)) return null;
    const { result: payload } = result.structuredContent;
    return isRecord(payload) && typeof payload.url === 'string'
        ? payload.url
        : null;
}

async function getSignInUrl(url: string): Promise<string | null> {
    const result = await app.callServerTool({
        name: SIGN_IN_TOOL,
        arguments: { url },
    });
    if (result.isError || !isRecord(result.structuredContent)) return null;
    const { signInUrl } = result.structuredContent;
    return typeof signInUrl === 'string' ? signInUrl : null;
}

function reportPage(url: string, title: string | null): void {
    currentPage = { url, title };
    void app.updateModelContext({
        content: [
            {
                type: 'text',
                text: `The user has this Lightdash page open beside the conversation: ${title ? `${title} (${url})` : url}`,
            },
        ],
        structuredContent: { lightdashPage: currentPage },
    });
}

function navigateFrame(url: string): void {
    pageUrl = url;
    frame.src = url;
    reportPage(url, null);
}

async function openPage(url: string): Promise<void> {
    if (signedInOrigin === new URL(url).origin) {
        navigateFrame(url);
        return;
    }
    pageUrl = url;
    frame.hidden = true;
    const reported = app.getHostCapabilities()?.sandbox?.csp?.frameDomains;
    const allowed = canFrame(new URL(url).origin);
    showStatus(
        `${allowed ? 'Opening Lightdash…' : 'Claude did not allow Lightdash to load here.'} Sites Claude allows: ${reported === undefined ? 'not reported' : JSON.stringify(reported)}`,
        !allowed,
    );
    const signInUrl = await getSignInUrl(url).catch(() => null);
    if (pageUrl !== url) return;
    if (signInUrl === null) {
        showStatus('Lightdash could not sign you in here.', true);
        return;
    }
    frame.src = signInUrl;
    signedInOrigin = new URL(url).origin;
    reportPage(url, null);
}

window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (signedInOrigin === null || event.origin !== signedInOrigin) return;
    const { data } = event;
    if (!isRecord(data) || data.type !== 'lightdash:page') return;
    if (typeof data.url !== 'string') return;
    reportPage(data.url, typeof data.title === 'string' ? data.title : null);
});

function textResult(text: string, isError = false) {
    return { content: [{ type: 'text' as const, text }], isError };
}

app.onlisttools = async () => ({
    tools: [
        {
            name: 'show_lightdash_page',
            title: 'Show Lightdash page',
            description:
                'Show a Lightdash page (an Explore, chart, dashboard or space URL on this Lightdash site) in the Lightdash view the user has open.',
            inputSchema: {
                type: 'object' as const,
                properties: {
                    url: {
                        type: 'string',
                        description: 'A URL or path on the Lightdash site.',
                    },
                },
                required: ['url'],
            },
        },
        {
            name: 'get_lightdash_page',
            title: 'Get open Lightdash page',
            description:
                'Return the Lightdash page the user has open in the Lightdash view.',
            inputSchema: { type: 'object' as const },
        },
    ],
});

app.oncalltool = async ({ name, arguments: args }) => {
    if (name === 'get_lightdash_page') {
        return currentPage
            ? {
                  ...textResult(
                      `Open page: ${currentPage.title ? `${currentPage.title} (${currentPage.url})` : currentPage.url}`,
                  ),
                  structuredContent: { lightdashPage: currentPage },
              }
            : textResult('No Lightdash page is open yet.');
    }
    if (name === 'show_lightdash_page') {
        if (signedInOrigin === null) {
            return textResult(
                'Lightdash is not open yet. Call open_lightdash first.',
                true,
            );
        }
        const requested = isRecord(args) ? args.url : undefined;
        if (typeof requested !== 'string') {
            return textResult('Pass the page as url, a string.', true);
        }
        let target: URL;
        try {
            target = new URL(requested, signedInOrigin);
        } catch {
            return textResult(`${requested} is not a URL.`, true);
        }
        if (target.origin !== signedInOrigin) {
            return textResult(
                `The Lightdash view shows only pages on ${signedInOrigin}.`,
                true,
            );
        }
        navigateFrame(target.href);
        return textResult(`Showing ${target.href} in the Lightdash view.`);
    }
    return textResult(`Unknown tool ${name}.`, true);
};

frame.addEventListener('load', () => {
    if (!frame.src) return;
    status.hidden = true;
    frame.hidden = false;
});

openButton.addEventListener('click', () => {
    if (pageUrl) void app.openLink({ url: pageUrl });
});

function applyHostContext(ctx: Partial<McpUiHostContext>): void {
    if (ctx.theme) applyDocumentTheme(ctx.theme);
    if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
    if (ctx.displayMode) {
        document.documentElement.dataset.displayMode = ctx.displayMode;
        if (ctx.displayMode === 'inline') {
            void app.sendSizeChanged({
                width: Math.ceil(window.innerWidth),
                height: INLINE_HEIGHT,
            });
        }
    }
    if (ctx.safeAreaInsets) {
        const root = document.documentElement.style;
        root.setProperty('--safe-area-top', `${ctx.safeAreaInsets.top}px`);
        root.setProperty('--safe-area-right', `${ctx.safeAreaInsets.right}px`);
        root.setProperty(
            '--safe-area-bottom',
            `${ctx.safeAreaInsets.bottom}px`,
        );
        root.setProperty('--safe-area-left', `${ctx.safeAreaInsets.left}px`);
    }
}

app.ontoolresult = (result) => {
    const url = getPageUrl(result);
    if (url === null) {
        showStatus('Lightdash did not return a page to open.', false);
        return;
    }
    void openPage(url);
};

app.onhostcontextchanged = applyHostContext;

void app.connect().then(() => {
    const ctx = app.getHostContext();
    applyHostContext(ctx ?? { displayMode: 'inline' });
});
