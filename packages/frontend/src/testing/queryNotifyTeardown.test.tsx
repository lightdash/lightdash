import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

const Probe = () => {
    useQuery({
        queryKey: ['teardown'],
        queryFn: () => 'ok',
    });
    return null;
};

describe('query notifications after jsdom teardown', () => {
    const restore: Array<() => void> = [];

    afterEach(() => {
        restore.splice(0).forEach((fn) => fn());
    });

    it('does not apply a notification once window is gone', async () => {
        const rejections: unknown[] = [];
        const onRejection = (reason: unknown) => {
            rejections.push(reason);
        };
        process.on('unhandledRejection', onRejection);
        restore.push(() => process.off('unhandledRejection', onRejection));

        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        render(
            <QueryClientProvider client={client}>
                <Probe />
            </QueryClientProvider>,
        );
        client.setQueryData(['teardown'], 'later');

        const descriptor = Object.getOwnPropertyDescriptor(
            globalThis,
            'window',
        );
        delete (globalThis as { window?: Window }).window;
        restore.push(() => {
            Object.defineProperty(globalThis, 'window', descriptor!);
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(rejections).toEqual([]);
    });
});
