import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Linear OAuth token store (actor=app installs), keyed by organization id.
 * Plaintext JSON on disk — PoC only; port of linear-agent/server.mjs semantics.
 */

const TOKENS_FILE = resolve('./data/tokens.json');
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export const LINEAR_SCOPES = 'read,write,app:assignable,app:mentionable';
export const TOKEN_URL = 'https://api.linear.app/oauth/token';

interface TokenRecord {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: number;
}

type TokenStore = Record<string, TokenRecord>;

function loadTokens(): TokenStore {
	try {
		return JSON.parse(readFileSync(TOKENS_FILE, 'utf8')) as TokenStore;
	} catch {
		return {};
	}
}

export function saveToken(organizationId: string, record: TokenRecord): void {
	const tokens = loadTokens();
	tokens[organizationId] = record;
	mkdirSync(dirname(TOKENS_FILE), { recursive: true, mode: 0o700 });
	const tmp = `${TOKENS_FILE}.tmp`;
	writeFileSync(tmp, JSON.stringify(tokens, null, 2), { mode: 0o600 });
	renameSync(tmp, TOKENS_FILE);
}

export function installedOrganizations(): string[] {
	return Object.keys(loadTokens());
}

interface OAuthTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
}

export async function exchangeToken(
	params: Record<string, string>,
): Promise<TokenRecord> {
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(params).toString(),
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) {
		throw new Error(`Linear token endpoint ${response.status}: ${await response.text()}`);
	}
	const body = (await response.json()) as OAuthTokenResponse;
	return {
		accessToken: body.access_token,
		refreshToken: body.refresh_token ?? null,
		expiresAt: Date.now() + body.expires_in * 1000,
	};
}

export async function accessTokenFor(organizationId: string): Promise<string> {
	const record = loadTokens()[organizationId];
	if (!record) {
		throw new Error(
			`No Linear installation for workspace ${organizationId} — visit /oauth/authorize`,
		);
	}
	if (Date.now() < record.expiresAt - REFRESH_MARGIN_MS) {
		return record.accessToken;
	}
	if (!record.refreshToken) {
		throw new Error(`Linear token for ${organizationId} expired and has no refresh token`);
	}
	const refreshed = await exchangeToken({
		grant_type: 'refresh_token',
		client_id: process.env.LINEAR_CLIENT_ID as string,
		client_secret: process.env.LINEAR_CLIENT_SECRET as string,
		refresh_token: record.refreshToken,
	});
	saveToken(organizationId, refreshed);
	return refreshed.accessToken;
}
