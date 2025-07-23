import { compile } from 'handlebars';

export const oauthPageStyles = `
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Open Sans', 'Helvetica Neue', sans-serif;
        background-color: #f8fafc;
        margin: 0;
        padding: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        line-height: 1.4;
    }
    .container {
        background: white;
        border-radius: 4px;
        border: 1px solid #e9ecef;
        box-shadow: 0px 1px 2px 0px rgba(10, 13, 18, 0.05);
        padding: 24px;
        max-width: 400px;
        width: 90%;
        text-align: center;
    }
    h1 {
        color: #111418;
        margin: 0 0 16px 0;
        font-size: 20px;
        font-weight: 600;
        text-align: center;
    }
    p {
        color: #6c757d;
        margin: 0 0 12px 0;
        line-height: 1.4;
        font-size: 14px;
    }
    .success h1 {
        color: #10b981;
    }
    .error h1 {
        color: #ef4444;
    }
    .icon {
        width: 32px;
        height: 32px;
        margin: 0 auto 16px auto;
        display: block;
    }
    .success .icon {
        color: #10b981;
    }
    .error .icon {
        color: #ef4444;
    }
    .stack {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }
`;

// OAuth response HTML template
const OAUTH_RESPONSE_TEMPLATE = `
<html>
    <head>
        <style>{{{styles}}}</style>
    </head>
    <body>
        <div class="stack">
            <div class="container {{status}}">
                <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {{{icon}}}
                </svg>
                <h1>{{title}}</h1>
                {{#each messages}}
                <p>{{this}}</p>
                {{/each}}
            </div>
        </div>
    </body>
</html>
`;

// SVG icons for different response types
const OAUTH_ICONS = {
    success:
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    error: '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    sessionExpired:
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
} as const;

// Compile the template once with proper type safety
const compiledTemplate = compile(OAUTH_RESPONSE_TEMPLATE);

export type OAuthResponseStatus = 'success' | 'error';
export type OAuthIconType = keyof typeof OAUTH_ICONS;

/**
 * Generates an OAuth response HTML page using Handlebars templating
 * This prevents XSS issues by auto-escaping content while still allowing safe HTML in icons and styles
 */
export const generateOAuthResponseHtml = (
    status: OAuthResponseStatus,
    title: string,
    messages: string[],
    iconType: OAuthIconType = status === 'success' ? 'success' : 'error',
): string =>
    compiledTemplate({
        styles: oauthPageStyles,
        status,
        title,
        messages,
        icon: OAUTH_ICONS[iconType],
    });

/**
 * Generates a success OAuth response
 */
export const generateOAuthSuccessResponse = (
    title: string = 'Authentication Successful!',
    messages: string[] = [
        'You have been successfully authenticated with Lightdash.',
        'You can close this window and return to the CLI.',
    ],
): string => generateOAuthResponseHtml('success', title, messages, 'success');

/**
 * Generates an error OAuth response
 */
export const generateOAuthErrorResponse = (
    title: string,
    messages: string[],
    iconType: OAuthIconType = 'error',
): string =>
    generateOAuthResponseHtml(
        'error',
        title,
        [...messages, 'You can close this window and try again.'],
        iconType,
    );
