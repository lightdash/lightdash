import type { APIRequestContext, Response } from 'playwright/test';
import { z } from 'zod';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type ApiReply = {
    where: string;
    status: number;
    text: string;
    json: { parsed: true; value: unknown } | { parsed: false };
};

// Empty replies (DELETE) omit `results`; the caller's schema decides whether
// that is acceptable.
const okEnvelope = z.object({
    status: z.literal('ok'),
    results: z.unknown().optional(),
});

const parseJson = (text: string): ApiReply['json'] => {
    try {
        return { parsed: true, value: JSON.parse(text) };
    } catch {
        return { parsed: false };
    }
};

const excerpt = (text: string) =>
    text.length > 4000 ? `${text.slice(0, 4000)}…` : text;

/** A browser response as an ApiReply, for asserting what the UI received. */
export const replyOfResponse = async (
    response: Response,
): Promise<ApiReply> => {
    const text = await response.text();
    const { pathname } = new URL(response.url());
    return {
        where: `${response.request().method()} ${pathname} -> HTTP ${response.status()}`,
        status: response.status(),
        text,
        json: parseJson(text),
    };
};

/**
 * Validates a reply's `{ status: 'ok', results }` envelope and its `results`
 * against the schema the test states: the schema is the assertion.
 */
export const resultsOf = <T extends z.ZodType>(
    reply: ApiReply,
    results: T,
): z.output<T> => {
    const envelope = okEnvelope.safeParse(
        reply.json.parsed ? reply.json.value : undefined,
    );
    if (!envelope.success) {
        throw new Error(
            `${reply.where}: not an ok envelope\n${excerpt(reply.text)}`,
        );
    }
    const parsed = results.safeParse(envelope.data.results);
    if (!parsed.success) {
        throw new Error(
            `${reply.where}: results do not match the schema\n${z.prettifyError(parsed.error)}\n${excerpt(reply.text)}`,
        );
    }
    return parsed.data;
};

/** Lightdash API over a logged-in request context. */
export const createApi = (request: APIRequestContext) => {
    const send = async (
        method: HttpMethod,
        path: string,
        body?: unknown,
    ): Promise<ApiReply> => {
        const response = await request.fetch(path, { method, data: body });
        const text = await response.text();
        return {
            where: `${method} ${path} -> HTTP ${response.status()}`,
            status: response.status(),
            text,
            json: parseJson(text),
        };
    };

    // Typed calls accept any 2xx; use `send` + `resultsOf` to assert a code.
    const call = async <T extends z.ZodType>(
        method: HttpMethod,
        path: string,
        body: unknown,
        results: T,
    ): Promise<z.output<T>> => {
        const reply = await send(method, path, body);
        if (reply.status < 200 || reply.status >= 300) {
            throw new Error(`${reply.where}\n${excerpt(reply.text)}`);
        }
        return resultsOf(reply, results);
    };

    return {
        request,
        send,
        get: <T extends z.ZodType>(path: string, results: T) =>
            call('GET', path, undefined, results),
        post: <T extends z.ZodType>(path: string, body: unknown, results: T) =>
            call('POST', path, body, results),
        patch: <T extends z.ZodType>(path: string, body: unknown, results: T) =>
            call('PATCH', path, body, results),
        put: <T extends z.ZodType>(path: string, body: unknown, results: T) =>
            call('PUT', path, body, results),
        delete: (path: string) => call('DELETE', path, undefined, z.unknown()),
    };
};

export type LightdashApi = ReturnType<typeof createApi>;
