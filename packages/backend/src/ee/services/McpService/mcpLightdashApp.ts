import { createHash } from 'crypto';
import { z } from 'zod';

export const MCP_LIGHTDASH_APP_RESOURCE_URI = 'ui://lightdash/app-v2.html';

export const mcpOpenLightdashTool = {
    name: 'open_lightdash',
    title: 'Open Lightdash',
    description:
        'Open the Lightdash app beside the conversation so the user and you can work in it together. Pass a Lightdash URL from another tool (an Explore, chart or dashboard link) to open that page, or omit it to open the Lightdash home page.',
    inputSchema: z.object({
        url: z
            .string()
            .optional()
            .describe(
                'A Lightdash URL or path on this Lightdash site, for example an exploreUrl from run_metric_query.',
            ),
    }),
    outputSchema: z.object({
        result: z.object({
            url: z.string().describe('The Lightdash page that is open.'),
        }),
    }),
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    },
};

export const mcpLightdashAppSignInTool = {
    name: 'get_lightdash_app_sign_in_url',
    title: 'Get Lightdash app sign-in URL',
    description:
        'Used by the Lightdash view to sign the user in to the page it shows. Do not call it directly.',
    inputSchema: z.object({
        url: z.string().describe('The Lightdash page to open after sign-in.'),
    }),
    outputSchema: z.object({
        signInUrl: z.string(),
    }),
    annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
    },
};

export const resolveLightdashAppUrl = (
    url: string | undefined,
    siteUrl: string,
): string | null => {
    const site = new URL(siteUrl);
    if (url === undefined || url.trim() === '') {
        return new URL('/', site).href;
    }
    let target: URL;
    try {
        target = new URL(url, site);
    } catch {
        return null;
    }
    return target.origin === site.origin ? target.href : null;
};

export const buildLightdashAppSignInUrl = ({
    siteUrl,
    token,
    url,
}: {
    siteUrl: string;
    token: string;
    url: string;
}): string => {
    const signIn = new URL('/api/v1/mcp-app/sign-in', siteUrl);
    signIn.searchParams.set('token', token);
    signIn.searchParams.set('redirect', url);
    return signIn.href;
};

export const getClaudeSandboxDomain = (mcpServerUrl: string): string =>
    `${createHash('sha256').update(mcpServerUrl).digest('hex').slice(0, 32)}.claudemcpcontent.com`;
