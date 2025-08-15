// src/controllers/connectorsController.ts
import { Controller, Route, Tags, Post, Path, Body } from '@tsoa/runtime';
import type express from 'express';
import crypto from 'crypto';
import { Request } from '@tsoa/runtime'
import { ApiSuccessEmpty } from '@lightdash/common';

type StartBody = { projectUuid: string; shop_url?: string };
type StartResp = { startUrl: string };

// hardcode callback paths here for now
const CALLBACKS = {
  shopify: '/api/v1/auth/shopify/callback',
  ga: '/api/v1/auth/google-analytics/callback',
} as const;

// derive site url without needing env wiring
const getSiteUrl = (req: express.Request) => {
  const env = process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  return `${proto}://${req.get('host')}`;
};

@Route('/api/v1/connectors')
@Tags('Connectors')
export class ConnectorsController extends Controller {
  @Post('{key}/start')
  public async start(
    @Path() key: 'shopify' | 'ga',
    @Body() body: StartBody,
    @Request() req: express.Request,
    @Request() res: express.Response,
  ): Promise<ApiSuccessEmpty> {
    const siteUrl = getSiteUrl(req);
    const state = crypto.randomBytes(16).toString('hex'); // no DB; simple

    if (key === 'shopify') {
      // REAL Shopify authorize endpoint is on the shop domain:
      // https://{shop}/admin/oauth/authorize
      const clientId = process.env.SHOPIFY_API_KEY!;
      const scopes = process.env.SHOPIFY_SCOPES!; // e.g. "read_orders,read_products"
      if (!body.shop_url) throw new Error('shop_url required for Shopify');
      const redirectUri = `${siteUrl}${CALLBACKS.shopify}`;

      const url = new URL(`https://${body.shop_url}/admin/oauth/authorize`);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('scope', scopes);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      // Optional: per-user tokens:
      // url.searchParams.append('grant_options[]', 'per-user');

      return { status: 'ok', results: { startUrl: url.toString() } };
    }

    if (key === 'ga') {
      // REAL Google OAuth 2.0 endpoint:
      // https://accounts.google.com/o/oauth2/v2/auth
      const clientId = process.env.GA_CLIENT_ID!;
     // const scopes = process.env.GA_OAUTH_SCOPES!; // e.g. "https://www.googleapis.com/auth/analytics.readonly"
      const redirectUri = `${siteUrl}${CALLBACKS.ga}`;
      const scopes = 'https://www.googleapis.com/auth/analytics.readonly';

      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', scopes);
      url.searchParams.set('access_type', 'offline'); // get refresh_token
      url.searchParams.set('prompt', 'consent');      // ensure refresh_token at least once
      url.searchParams.set('state', state);

      return { status: 'ok', results: { startUrl: url.toString() } };
    }

    throw new Error('Unknown connector');
  }
}
