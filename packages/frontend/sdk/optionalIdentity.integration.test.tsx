import { act, cleanup, render } from '@testing-library/react';
import nock from 'nock';
import { afterEach, expect, it, vi } from 'vitest';
import { Chart } from './index';

vi.mock('../src/components/MonacoEditor', () => ({
    default: () => null,
    Editor: () => null,
    useMonaco: () => null,
}));

const requests: string[] = [];
const recordRequest = (request: { method: string; path: string }) => {
    requests.push(`${request.method} ${request.path.split('?')[0]}`);
};

afterEach(() => {
    cleanup();
    nock.emitter.removeListener('no match', recordRequest);
    nock.cleanAll();
    requests.length = 0;
});

it('mounts the public Chart with unresolved credentials without optional discovery', async () => {
    nock.emitter.on('no match', recordRequest);
    const onError = vi.fn();
    const pending = new Promise<string>(() => {});
    const view = render(
        <Chart
            instanceUrl="http://test.lightdash"
            token={pending}
            isEditMode
            onError={onError}
        />,
    );
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(requests).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(view.container).toBeEmptyDOMElement();
    view.unmount();
});
