import {
    ApiError,
    ApiResponse,
    LightdashRequestMethodHeader,
    RequestMethod,
} from '@lightdash/common';

const apiPrefix = '/api/v1';

const headers = {
    'Content-Type': 'application/json',
    [LightdashRequestMethodHeader]: RequestMethod.WEB_APP,
};

const handleError = (err: any): ApiError => {
    if (err.error?.statusCode && err.error?.name) return err;
    return {
        status: 'error',
        error: {
            name: 'NetworkError',
            statusCode: 500,
            message: `Could not connect to Lightdash server. The server may have crashed or be running on an incorrect host and port configuration.`,
            data: err,
        },
    };
};

type LightdashApiProps = {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    url: string;
    body: BodyInit | null | undefined;
};
export const lightdashApi = async <T extends ApiResponse['results']>({
    method,
    url,
    body,
}: LightdashApiProps): Promise<T> =>
    fetch(`${apiPrefix}${url}`, { method, headers, body })
        .then((r) => {
            if (!r.ok)
                return r.json().then((d) => {
                    throw d;
                });
            return r;
        })
        .then((r) => r.json())
        .then((d: ApiResponse | ApiError) => {
            switch (d.status) {
                case 'ok':
                    return d.results as T;
                case 'error':
                    // eslint-disable-next-line @typescript-eslint/no-throw-literal
                    throw d;
                default:
                    // eslint-disable-next-line @typescript-eslint/no-throw-literal
                    throw d;
            }
        })
        .catch((err) => {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw handleError(err);
        });
