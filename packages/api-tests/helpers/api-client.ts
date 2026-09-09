export const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000';

/**
 * Standard Lightdash API response shape: `{ status: 'ok', results: T }`.
 * Use as `admin.get<Body<MyType>>(url)` so `resp.body.results` is typed.
 */
export type Body<T> = { status: string; results: T };

type RequestOptions = {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    failOnStatusCode?: boolean;
};

type ApiResponse<T = unknown> = {
    ok: boolean;
    status: number;
    body: T;
};

// Errors raised before the request was sent, so any method is safe to retry.
// The preview ingress can refuse connections for a few seconds.
const CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
]);
const MAX_CONNECTION_ATTEMPTS = 6;

function isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const { cause } = error;
    return (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        typeof cause.code === 'string' &&
        CONNECTION_ERROR_CODES.has(cause.code)
    );
}

export async function fetchWithConnectionRetry(
    url: string,
    init?: RequestInit,
): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fetch(url, init);
        } catch (error) {
            if (
                !isConnectionError(error) ||
                attempt >= MAX_CONNECTION_ATTEMPTS
            ) {
                throw error;
            }
            await new Promise<void>((resolve) => {
                setTimeout(resolve, attempt * 1000);
            });
        }
    }
}

export class ApiClient {
    private cookies: Map<string, string> = new Map();

    private get cookieHeader(): string {
        return Array.from(this.cookies.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
    }

    private parseCookies(response: Response): void {
        const setCookieHeaders = response.headers.getSetCookie();
        setCookieHeaders.forEach((header) => {
            const [pair] = header.split(';');
            const eqIdx = pair.indexOf('=');
            if (eqIdx !== -1) {
                const name = pair.slice(0, eqIdx).trim();
                const value = pair.slice(eqIdx + 1).trim();
                this.cookies.set(name, value);
            }
        });
    }

    async request<T = unknown>(
        urlOrPath: string,
        options: RequestOptions = {},
    ): Promise<ApiResponse<T>> {
        const {
            method = 'GET',
            body,
            headers = {},
            failOnStatusCode = true,
        } = options;

        const url = urlOrPath.startsWith('http')
            ? urlOrPath
            : `${SITE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;

        const fetchHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...headers,
        };

        const cookie = this.cookieHeader;
        if (cookie) {
            fetchHeaders.Cookie = cookie;
        }

        const resp = await fetchWithConnectionRetry(url, {
            method,
            headers: fetchHeaders,
            body: body != null ? JSON.stringify(body) : undefined,
            redirect: 'manual',
        });

        this.parseCookies(resp);

        let respBody: T;
        const contentType = resp.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            respBody = (await resp.json()) as T;
        } else {
            respBody = (await resp.text()) as unknown as T;
        }

        if (failOnStatusCode && !resp.ok) {
            throw new Error(
                `Request ${method} ${url} failed with status ${resp.status}: ${JSON.stringify(respBody)}`,
            );
        }

        return {
            ok: resp.ok,
            status: resp.status,
            body: respBody,
        };
    }

    async get<T = unknown>(
        url: string,
        options?: Omit<RequestOptions, 'method'>,
    ): Promise<ApiResponse<T>> {
        return this.request<T>(url, { ...options, method: 'GET' });
    }

    async post<T = unknown>(
        url: string,
        body?: unknown,
        options?: Omit<RequestOptions, 'method' | 'body'>,
    ): Promise<ApiResponse<T>> {
        return this.request<T>(url, { ...options, method: 'POST', body });
    }

    async patch<T = unknown>(
        url: string,
        body?: unknown,
        options?: Omit<RequestOptions, 'method' | 'body'>,
    ): Promise<ApiResponse<T>> {
        return this.request<T>(url, { ...options, method: 'PATCH', body });
    }

    async put<T = unknown>(
        url: string,
        body?: unknown,
        options?: Omit<RequestOptions, 'method' | 'body'>,
    ): Promise<ApiResponse<T>> {
        return this.request<T>(url, { ...options, method: 'PUT', body });
    }

    async delete<T = unknown>(
        url: string,
        options?: Omit<RequestOptions, 'method'>,
    ): Promise<ApiResponse<T>> {
        return this.request<T>(url, { ...options, method: 'DELETE' });
    }
}
