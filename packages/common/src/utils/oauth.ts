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

// OAuth authorization page template
const OAUTH_AUTHORIZE_TEMPLATE = `
<html>
    <head>
        <title>Authorize Application</title>
        <style>
            {{{styles}}}
            .container, .container p, .container strong, .container form { text-align: center; }
            .container p { margin-left: auto; margin-right: auto; }
            .oauth-desc { margin-bottom: 18px; color: #374151; font-size: 12px; }
            .oauth-btn-row { display: flex; justify-content: center; gap: 12px; margin-top: 18px; }
            .oauth-btn {
                padding: 8px 24px;
                border: none;
                border-radius: 4px;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                transition: background 0.15s;
            }
            .oauth-btn.approve {
                background: #00B26F;
                color: #fff;
            }
            .oauth-btn.approve:hover {
                background: #00975E;
            }
            .oauth-btn.deny {
                background: #E03131;
                color: #fff;
            }
            .oauth-btn.deny:hover {
                background: #B32525;
            }
        </style>
    </head>
    <body>
        <div class="stack">
            <form class="container" method="POST" action="{{action}}">
                <h1>Authorize Application</h1>
                <p class="oauth-desc">
                    You are about to grant access to your Lightdash account using OAuth.<br/>
                    This is a secure way to let trusted applications access your account without sharing your password.<br/>
                    Approving will allow the client below to perform actions on your behalf, according to the requested permissions.
                </p>
                <p>Client: <b>{{client_id}}</b></p>
                <p>Scope: <b>{{scope}}</b></p>
                
                {{#each hiddenInputs}}
                <input type="hidden" name="{{name}}" value="{{value}}" />
                {{/each}}
                
                <p>Authenticate as user: <b>{{user.firstName}} {{user.lastName}}</b></p>
                <p>on organization: <b>{{user.organizationName}}</b></p>

                <div class="oauth-btn-row">
                    <button type="submit" name="approve" value="true" class="oauth-btn approve">Approve</button>
                    <button type="submit" name="approve" value="false" class="oauth-btn deny">Deny</button>
                </div>
            </form>
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

// OAuth redirect page template
const OAUTH_REDIRECT_TEMPLATE = `
<html>
    <head>
        <title>Redirecting...</title>
        <style>
            {{{styles}}}
            .spinner {
                width: 32px;
                height: 32px;
                margin: 0 auto 16px auto;
                border: 3px solid #e9ecef;
                border-top: 3px solid #00B26F;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .redirect-link {
                color: #00B26F;
                text-decoration: none;
                font-weight: 600;
            }
            .redirect-link:hover {
                text-decoration: underline;
            }
        </style>
        <script>
            setTimeout(function() {
                window.location.href = "{{{redirectUrl}}}";
            }, 2000);
        </script>
    </head>
    <body>
        <div class="stack">
            <div class="container">
                <div class="spinner"></div>
                <h1>Redirecting...</h1>
                <p>{{message}}</p>
                <p>If you are not redirected automatically, <a href="{{{redirectUrl}}}" class="redirect-link">click here</a>.</p>
            </div>
        </div>
    </body>
</html>
`;

// Compile the templates once with proper type safety
const compiledResponseTemplate = compile(OAUTH_RESPONSE_TEMPLATE);
const compiledAuthorizeTemplate = compile(OAUTH_AUTHORIZE_TEMPLATE);
const compiledRedirectTemplate = compile(OAUTH_REDIRECT_TEMPLATE);

export type OAuthResponseStatus = 'success' | 'error';
export type OAuthIconType = keyof typeof OAUTH_ICONS;

// Types for OAuth authorization page
export interface OAuthHiddenInput {
    name: string;
    value: string;
}

export interface OAuthUser {
    firstName: string;
    lastName: string;
    organizationName: string;
}

export interface OAuthAuthorizeParams {
    action: string;
    client_id: string;
    scope: string;
    user: OAuthUser;
    hiddenInputs: OAuthHiddenInput[];
}

export interface OAuthRedirectParams {
    redirectUrl: string;
    message: string;
}

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
    compiledResponseTemplate({
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

/**
 * Generates an OAuth authorization page HTML using Handlebars templating
 * This prevents XSS issues by auto-escaping all user content
 */
export const generateOAuthAuthorizePage = (
    params: OAuthAuthorizeParams,
): string =>
    compiledAuthorizeTemplate({
        styles: oauthPageStyles,
        ...params,
    });

/**
 * Generates an OAuth redirect page HTML using JavaScript redirect
 * This prevents CSP errors by using JavaScript-based redirection instead of HTTP redirects
 */
export const generateOAuthRedirectPage = (
    params: OAuthRedirectParams,
): string =>
    compiledRedirectTemplate({
        styles: oauthPageStyles,
        ...params,
    });
