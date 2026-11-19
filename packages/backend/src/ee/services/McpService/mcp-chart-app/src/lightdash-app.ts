import {
    App,
    applyDocumentTheme,
    applyHostStyleVariables,
    type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

const SIGN_IN_TOOL = 'get_lightdash_app_sign_in_url';
const PARENT_ORIGIN_PARAM = 'mcpAppParent';
const INLINE_HEIGHT = 640;
const COMMAND_TIMEOUT_MS = 15_000;

const frame = document.getElementById('lightdash-frame') as HTMLIFrameElement;
const status = document.getElementById('status') as HTMLDivElement;
const statusText = document.getElementById(
    'status-text',
) as HTMLParagraphElement;
const openButton = document.getElementById('open-btn') as HTMLButtonElement;

type LightdashPage = { url: string; title: string | null };
type ExploreState = {
    tableName: string;
    dimensions: string[];
    metrics: string[];
    filterCount: number;
    chartType: string;
    rowCount: number | null;
    isRunning: boolean;
};
type PendingCommand = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
};

let pageUrl: string | null = null;
let signedInOrigin: string | null = null;
let currentPage: LightdashPage | null = null;
let currentExplore: ExploreState | null = null;
const pendingCommands = new Map<string, PendingCommand>();

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

function isHttpUrl(url: string): boolean {
    try {
        const { protocol } = new URL(url);
        return protocol === 'https:' || protocol === 'http:';
    } catch {
        return false;
    }
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

function withParentOrigin(url: string): string {
    const { origin } = window.location;
    if (!origin || origin === 'null') return url;
    const target = new URL(url);
    target.searchParams.set(PARENT_ORIGIN_PARAM, origin);
    return target.href;
}

function describeExplore(explore: ExploreState): string {
    const fields = [...explore.dimensions, ...explore.metrics];
    const rows =
        explore.rowCount === null
            ? 'no results yet'
            : `${explore.rowCount} rows`;
    return `Explore ${explore.tableName}: fields ${fields.length > 0 ? fields.join(', ') : 'none'}; ${explore.filterCount} filter(s); chart type ${explore.chartType}; ${explore.isRunning ? 'query running' : rows}.`;
}

function describeContext(): string {
    if (!currentPage) return 'The Lightdash view is not open yet.';
    const page = currentPage.title
        ? `${currentPage.title} (${currentPage.url})`
        : currentPage.url;
    const explore = currentExplore ? ` ${describeExplore(currentExplore)}` : '';
    return `The user has this Lightdash page open beside the conversation: ${page}.${explore}`;
}

function reportContext(): void {
    void app.updateModelContext({
        content: [{ type: 'text', text: describeContext() }],
        structuredContent: {
            lightdashPage: currentPage,
            lightdashExplore: currentExplore,
        },
    });
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

function sendCommand(
    command: string,
    args: Record<string, unknown> = {},
): Promise<unknown> {
    const target = frame.contentWindow;
    if (signedInOrigin === null || !target) {
        return Promise.reject(
            new Error('Lightdash is not open yet. Call open_lightdash first.'),
        );
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingCommands.delete(id);
            reject(
                new Error(
                    'Lightdash did not respond. It may still be loading.',
                ),
            );
        }, COMMAND_TIMEOUT_MS);
        pendingCommands.set(id, { resolve, reject, timeout });
        target.postMessage(
            { type: 'lightdash:frame:command', id, command, args },
            signedInOrigin as string,
        );
    });
}

async function showPage(url: string): Promise<void> {
    pageUrl = url;
    try {
        await sendCommand('navigate', { path: url });
    } catch {
        frame.src = withParentOrigin(url);
    }
}

async function openPage(url: string): Promise<void> {
    const { origin } = new URL(url);
    pageUrl = url;
    if (!canFrame(origin)) {
        frame.hidden = true;
        showStatus(
            'Lightdash can’t open inside this app yet. Open it in a new tab instead.',
            true,
        );
        return;
    }
    if (signedInOrigin === origin) {
        await showPage(url);
        return;
    }
    frame.hidden = true;
    showStatus('Opening Lightdash…', false);
    const signInUrl = await getSignInUrl(withParentOrigin(url)).catch(
        () => null,
    );
    if (pageUrl !== url) return;
    if (signInUrl === null) {
        showStatus('Lightdash could not sign you in here.', true);
        return;
    }
    frame.src = signInUrl;
    signedInOrigin = origin;
    currentPage = { url, title: null };
    reportContext();
}

frame.addEventListener('load', () => {
    if (!frame.src) return;
    status.hidden = true;
    frame.hidden = false;
});

openButton.addEventListener('click', () => {
    if (pageUrl) void app.openLink({ url: pageUrl });
});

window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (signedInOrigin === null || event.origin !== signedInOrigin) return;
    const { data } = event;
    if (!isRecord(data)) return;
    switch (data.type) {
        case 'lightdash:frame:page':
            if (typeof data.url !== 'string') return;
            pageUrl = data.url;
            currentPage = {
                url: data.url,
                title: typeof data.title === 'string' ? data.title : null,
            };
            reportContext();
            return;
        case 'lightdash:frame:explore':
            currentExplore = isRecord(data.explore)
                ? (data.explore as ExploreState)
                : null;
            reportContext();
            return;
        case 'lightdash:frame:openLink':
            if (typeof data.url === 'string' && isHttpUrl(data.url)) {
                void app.openLink({ url: data.url });
            }
            return;
        case 'lightdash:frame:result': {
            if (typeof data.id !== 'string') return;
            const pending = pendingCommands.get(data.id);
            if (!pending) return;
            pendingCommands.delete(data.id);
            clearTimeout(pending.timeout);
            if (data.ok === true) {
                pending.resolve(data.result);
            } else {
                pending.reject(
                    new Error(
                        typeof data.error === 'string'
                            ? data.error
                            : 'Lightdash could not do that.',
                    ),
                );
            }
            return;
        }
        default:
    }
});

const FIELD_ID_HINT =
    'Field ids look like <explore>_<field>, for example orders_status, as returned by grep_fields or get_metadata.';

type ViewTool = {
    name: string;
    title: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties?: Record<string, object>;
        required?: string[];
    };
};

const VIEW_TOOLS: ViewTool[] = [
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
            'Return the Lightdash page the user has open in the Lightdash view, and the Explore query if an Explore is open.',
        inputSchema: { type: 'object' as const },
    },
    {
        name: 'explore_add_field',
        title: 'Add field to the open Explore',
        description: `Add a dimension or metric to the Explore the user has open in the Lightdash view, and run the query. ${FIELD_ID_HINT}`,
        inputSchema: {
            type: 'object' as const,
            properties: { fieldId: { type: 'string' } },
            required: ['fieldId'],
        },
    },
    {
        name: 'explore_remove_field',
        title: 'Remove field from the open Explore',
        description: `Remove a dimension or metric from the Explore the user has open in the Lightdash view, and run the query. ${FIELD_ID_HINT}`,
        inputSchema: {
            type: 'object' as const,
            properties: { fieldId: { type: 'string' } },
            required: ['fieldId'],
        },
    },
    {
        name: 'explore_add_filter',
        title: 'Add filter to the open Explore',
        description: `Add a filter to the Explore the user has open in the Lightdash view, and run the query. ${FIELD_ID_HINT} Operators: equals, notEquals, include, doesNotInclude, startsWith, endsWith, lessThan, lessThanOrEqual, greaterThan, greaterThanOrEqual, isNull, notNull, inThePast, notInThePast, inTheNext, inTheCurrent, notInTheCurrent, inBetween, notInBetween.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                fieldId: { type: 'string' },
                operator: {
                    type: 'string',
                    description: 'Filter operator. Defaults to equals.',
                },
                values: {
                    type: 'array',
                    description:
                        'Filter values, for example ["completed"] or [7] for inThePast.',
                    items: {},
                },
            },
            required: ['fieldId'],
        },
    },
    {
        name: 'explore_set_chart_type',
        title: 'Change chart type in the open Explore',
        description:
            'Change the chart type of the Explore the user has open in the Lightdash view.',
        inputSchema: {
            type: 'object' as const,
            properties: {
                chartType: {
                    type: 'string',
                    enum: ['cartesian', 'table', 'big_number', 'pie', 'funnel'],
                },
            },
            required: ['chartType'],
        },
    },
    {
        name: 'explore_run_query',
        title: 'Run the open Explore query',
        description:
            'Run the query of the Explore the user has open in the Lightdash view.',
        inputSchema: { type: 'object' as const },
    },
];

const COMMANDS: Record<string, string> = {
    explore_add_field: 'addField',
    explore_remove_field: 'removeField',
    explore_add_filter: 'addFilter',
    explore_set_chart_type: 'setChartType',
    explore_run_query: 'runQuery',
};

function textResult(text: string, isError = false) {
    return { content: [{ type: 'text' as const, text }], isError };
}

app.onlisttools = async () => ({ tools: VIEW_TOOLS });

app.oncalltool = async ({ name, arguments: args }) => {
    const input = isRecord(args) ? args : {};
    try {
        if (name === 'get_lightdash_page') {
            return {
                ...textResult(describeContext()),
                structuredContent: {
                    lightdashPage: currentPage,
                    lightdashExplore: currentExplore,
                },
            };
        }
        if (name === 'show_lightdash_page') {
            if (signedInOrigin === null) {
                return textResult(
                    'Lightdash is not open yet. Call open_lightdash first.',
                    true,
                );
            }
            if (typeof input.url !== 'string') {
                return textResult('Pass the page as url, a string.', true);
            }
            const target = new URL(input.url, signedInOrigin);
            if (target.origin !== signedInOrigin) {
                return textResult(
                    `The Lightdash view shows only pages on ${signedInOrigin}.`,
                    true,
                );
            }
            await showPage(target.href);
            return textResult(`Showing ${target.href} in the Lightdash view.`);
        }
        const command = COMMANDS[name];
        if (!command) return textResult(`Unknown tool ${name}.`, true);
        const result = await sendCommand(command, input);
        return {
            ...textResult(`Done. ${describeContext()}`),
            structuredContent: { result },
        };
    } catch (error) {
        return textResult(
            error instanceof Error ? error.message : String(error),
            true,
        );
    }
};

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
