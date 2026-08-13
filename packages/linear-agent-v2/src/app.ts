import { randomBytes } from 'node:crypto';
import { LinearClient } from '@linear/sdk';
import { Hono } from 'hono';
import { channel } from './channels/linear.ts';
import { exchangeToken, LINEAR_SCOPES, saveToken } from './linear/tokens.ts';
import { startSweeper } from './sandboxes/sweeper.ts';

startSweeper();

const app = new Hono();

const oauthStates = new Map<string, number>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function publicUrl(): string {
	return (process.env.PUBLIC_URL ?? 'http://localhost:8787').replace(/\/$/, '');
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

app.get('/health', (c) => c.json({ status: 'ok' }));

// One-time install: visit /oauth/authorize → approve in Linear → token stored.
app.get('/oauth/authorize', (c) => {
	const state = randomBytes(24).toString('hex');
	oauthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);
	const authorize = new URL('https://linear.app/oauth/authorize');
	authorize.search = new URLSearchParams({
		client_id: requireEnv('LINEAR_CLIENT_ID'),
		redirect_uri: `${publicUrl()}/oauth/callback`,
		response_type: 'code',
		scope: LINEAR_SCOPES,
		actor: 'app',
		state,
	}).toString();
	return c.redirect(authorize.toString());
});

app.get('/oauth/callback', async (c) => {
	const { code, state, error } = c.req.query();
	if (error) return c.text(`Linear returned an error: ${error}`, 400);
	const expiresAt = state ? oauthStates.get(state) : undefined;
	if (state) oauthStates.delete(state);
	if (!expiresAt || expiresAt < Date.now()) return c.text('Invalid or expired state', 400);
	if (!code) return c.text('Missing code', 400);

	const record = await exchangeToken({
		grant_type: 'authorization_code',
		client_id: requireEnv('LINEAR_CLIENT_ID'),
		client_secret: requireEnv('LINEAR_CLIENT_SECRET'),
		redirect_uri: `${publicUrl()}/oauth/callback`,
		code,
	});
	const organization = await new LinearClient({
		accessToken: record.accessToken,
	}).organization;
	saveToken(organization.id, record);
	return c.text(`Installed for ${organization.name} (${organization.id}). You can close this tab.`);
});

app.route('/channels/linear', channel.route());

export default app;
