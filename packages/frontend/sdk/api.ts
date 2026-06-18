import type { ApiContentResponse } from '@lightdash/common';

export type LightdashSdkContentType =
    | 'chart'
    | 'dashboard'
    | 'space'
    | 'data_app';

export type LightdashSdkApiAuth =
    | {
          type: 'apiKey';
          apiKey: string;
      }
    | {
          type: 'embedToken';
          token: string;
      }
    | {
          type: 'headers';
          headers: Record<string, string>;
      };

export type LightdashApiClientConfig = {
    instanceUrl: string;
    projectUuid?: string;
    auth?: LightdashSdkApiAuth;
    fetch?: typeof fetch;
};

export type LightdashApiRequestOptions = {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    auth?: LightdashSdkApiAuth;
    signal?: AbortSignal;
};

export type ListContentOptions = {
    projectUuids?: string[];
    spaceUuids?: string[];
    parentSpaceUuid?: string;
    contentTypes?: LightdashSdkContentType[];
    page?: number;
    pageSize?: number;
    search?: string;
    sortBy?: 'name' | 'space_name' | 'last_updated_at';
    sortDirection?: 'asc' | 'desc';
};

export type LightdashContentResults = ApiContentResponse['results'];
export type LightdashContentItem = LightdashContentResults['data'][number];

export class LightdashSdkApiError extends Error {
    statusCode: number | null;

    payload: unknown;

    constructor(message: string, statusCode: number | null, payload: unknown) {
        super(message);
        this.name = 'LightdashSdkApiError';
        this.statusCode = statusCode;
        this.payload = payload;
    }
}

const EMBED_TOKEN_HEADER = 'lightdash-embed-token';

const normalizeBaseUrl = (instanceUrl: string) => instanceUrl.replace(/\/$/, '');

const authHeaders = (auth: LightdashSdkApiAuth | undefined) => {
    if (!auth) return {};

    switch (auth.type) {
        case 'apiKey':
            return { Authorization: `ApiKey ${auth.apiKey}` };
        case 'embedToken':
            return { [EMBED_TOKEN_HEADER]: auth.token };
        case 'headers':
            return auth.headers;
        default:
            return {};
    }
};

const createQueryString = (params: Record<string, unknown>) => {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            value.forEach((item) => query.append(key, String(item)));
        } else if (value !== undefined && value !== null && value !== '') {
            query.append(key, String(value));
        }
    });

    return query.toString();
};

const readJson = async (response: Response) => {
    const text = await response.text();

    try {
        return text ? JSON.parse(text) : {};
    } catch {
        throw new LightdashSdkApiError(
            'Lightdash returned invalid JSON',
            response.status,
            text,
        );
    }
};

const getErrorMessage = (payload: unknown, status: number) => {
    if (typeof payload === 'object' && payload !== null) {
        if (
            'error' in payload &&
            typeof payload.error === 'object' &&
            payload.error !== null &&
            'message' in payload.error &&
            typeof payload.error.message === 'string'
        ) {
            return payload.error.message;
        }

        if ('message' in payload && typeof payload.message === 'string') {
            return payload.message;
        }
    }

    return `Lightdash API returned ${status}`;
};

export const createLightdashApiClient = (config: LightdashApiClientConfig) => {
    const fetcher = config.fetch ?? fetch;
    const baseUrl = normalizeBaseUrl(config.instanceUrl);

    const request = async <T>(options: LightdashApiRequestOptions) => {
        const response = await fetcher(`${baseUrl}${options.path}`, {
            method: options.method ?? 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders(options.auth ?? config.auth),
            },
            body:
                options.body === undefined
                    ? undefined
                    : JSON.stringify(options.body),
            signal: options.signal,
        });
        const payload = await readJson(response);

        if (!response.ok) {
            throw new LightdashSdkApiError(
                getErrorMessage(payload, response.status),
                response.status,
                payload,
            );
        }

        if (
            typeof payload === 'object' &&
            payload !== null &&
            'status' in payload &&
            payload.status === 'ok' &&
            'results' in payload
        ) {
            return payload.results as T;
        }

        return payload as T;
    };

    const listContent = async (options: ListContentOptions = {}) => {
        const params = createQueryString({
            ...options,
            projectUuids:
                options.projectUuids ??
                (config.projectUuid ? [config.projectUuid] : undefined),
        });

        return request<ApiContentResponse['results']>({
            path: `/api/v2/content?${params}`,
        });
    };

    return {
        request,
        listContent,
    };
};

export type LightdashApiClient = ReturnType<typeof createLightdashApiClient>;
