import {
    getErrorMessage,
    JWT_HEADER_NAME,
    type ApiError,
} from '@lightdash/common';
import { EMBED_KEY, type InMemoryEmbed } from '../ee/providers/Embed/types';
import { getFromInMemoryStorage } from './inMemoryStorage';

// To be reused across all hooks that need to fetch SQL query results
export const getResultsFromStream = async <T>(url: string | undefined) => {
    try {
        if (!url) {
            throw new Error('No URL provided');
        }
        // Embed iframes need the JWT on every same-origin fetch — there is no
        // session cookie. Mirror lightdashApi's header-injection so streamed
        // result reads aren't rejected with 401. Only attach the token when
        // the URL is a same-origin relative path: a protocol-relative URL
        // (`//evil.example.com/x`) or an absolute URL pointing elsewhere
        // would leak the JWT to a third-party origin.
        const isSameOriginPath = url.startsWith('/') && !url.startsWith('//');
        const embed = getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY);
        const headers: Record<string, string> = {
            Accept: 'application/json',
        };
        if (embed?.token && isSameOriginPath) {
            headers[JWT_HEADER_NAME] = embed.token;
        }
        const response = await fetch(url, {
            method: 'GET',
            headers,
        });
        const rb = response.body;
        const reader = rb?.getReader();

        const stream = new ReadableStream({
            start(controller) {
                function push() {
                    void reader?.read().then(({ done, value }) => {
                        if (done) {
                            // Close the stream
                            controller.close();
                            return;
                        }
                        // Enqueue the next data chunk into our target stream
                        controller.enqueue(value);

                        push();
                    });
                }

                push();
            },
        });

        const responseStream = new Response(stream, {
            headers: { 'Content-Type': 'application/json' },
        });
        const result = await responseStream.text();

        // Split the JSON strings by newline
        const jsonStrings = result
            .trim()
            .split('\n')
            .filter((s) => s !== '');
        const jsonObjects: T[] = jsonStrings
            .map((jsonString) => {
                try {
                    if (!jsonString) {
                        return null;
                    }
                    return JSON.parse(jsonString);
                } catch (e) {
                    throw new Error('Error parsing JSON');
                }
            })
            .filter((obj) => obj !== null);

        return jsonObjects;
    } catch (e) {
        // convert error to ApiError
        throw <ApiError>{
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 500,
                message: getErrorMessage(e),
                data: {},
            },
        };
    }
};
