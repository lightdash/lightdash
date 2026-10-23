import {
    getPeerDbtSourcesEnabled,
    hasPeerDbtSourcesOperation,
    withPeerDbtSourcesOperation,
} from './peerDbtSourcesOperation';

describe('peer dbt source operation', () => {
    it('defaults off outside an operation', () => {
        expect(hasPeerDbtSourcesOperation()).toBe(false);
        expect(getPeerDbtSourcesEnabled()).toBe(false);
    });

    it.each([true, false])(
        'keeps the outer snapshot when enabled is %s',
        async (enabled) => {
            await withPeerDbtSourcesOperation(enabled, async () => {
                expect(hasPeerDbtSourcesOperation()).toBe(true);
                await Promise.resolve();
                await withPeerDbtSourcesOperation(!enabled, async () => {
                    await Promise.resolve();
                    expect(getPeerDbtSourcesEnabled()).toBe(enabled);
                });
                expect(getPeerDbtSourcesEnabled()).toBe(enabled);
            });
            expect(hasPeerDbtSourcesOperation()).toBe(false);
        },
    );

    it('isolates concurrent operations and clears failed scopes', async () => {
        let release!: () => void;
        const paused = new Promise<void>((resolve) => {
            release = resolve;
        });
        const enabled = withPeerDbtSourcesOperation(true, async () => {
            await paused;
            expect(getPeerDbtSourcesEnabled()).toBe(true);
            throw new Error('operation failed');
        });
        await withPeerDbtSourcesOperation(false, async () => {
            expect(getPeerDbtSourcesEnabled()).toBe(false);
            release();
            await expect(enabled).rejects.toThrow('operation failed');
            expect(getPeerDbtSourcesEnabled()).toBe(false);
        });
        expect(hasPeerDbtSourcesOperation()).toBe(false);
    });
});
