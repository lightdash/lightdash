import { slotFixture } from './fixtures';
import { publicConnectionReport, publicTextIsSafe } from './statusResponse';

it.each([
    'https://example.com/?request=%70ersonal-key',
    'https://example.com/?request=%2570ersonal-key',
    'https://example.com/?request=personal%2dkey',
    'https://example.com/?request=personal%2Dkey',
    'https://example.com/?request=personal-\nkey',
    'https://example.com/?request=%FF%70ersonal-key',
    'prefix %2570ersonal-key suffix',
])('screens decoded and canonical text: %s', (text) => {
    expect(publicTextIsSafe(text, ['personal-key'])).toBe(false);
});
it('screens a proxy credential encoded with form query spaces', () => {
    expect(
        publicTextIsSafe('https://example.com/?request=Basic+proxy-secret', [
            'Basic proxy-secret',
        ]),
    ).toBe(false);
});
it('refuses encoding that does not reach a fixed point within the bound', () => {
    let value = '%70ersonal-key';
    for (let round = 0; round < 10; round += 1)
        value = encodeURIComponent(value);
    expect(publicTextIsSafe(value, ['personal-key'])).toBe(false);
});
it('preserves safe text and ignores absent secrets', () => {
    expect(
        publicTextIsSafe('Development 100% ready', [
            '',
            undefined,
            null,
            'personal-key',
        ]),
    ).toBe(true);
});
it('keeps a harmless deeply encoded project name in the report', () => {
    const slot = slotFixture();
    let name = '%';
    for (let round = 0; round < 9; round += 1) name = name.replace('%', '%25');
    slot.lastReported.approvedProjects = [
        {
            projectUuid: '66666666-6666-4666-8666-666666666666',
            name,
            approvedCapabilities: [],
        },
    ];
    expect(publicConnectionReport(slot).approvedProjects[0].name).toBe(name);
});

const encodeDeeply = (value: string, depth: number): string => {
    let result = [...value]
        .map((letter) => `%${letter.charCodeAt(0).toString(16)}`)
        .join('');
    for (let round = 1; round < depth; round += 1)
        result = encodeURIComponent(result);
    return result;
};
it.each([9, 40])('preserves harmless names at depth %s', (depth) => {
    const slot = slotFixture();
    const name = encodeDeeply('Harmless', depth);
    slot.lastReported.approvedProjects = [
        { projectUuid: 'project', name, approvedCapabilities: [] },
    ];
    expect(publicConnectionReport(slot).approvedProjects[0].name).toBe(name);
});
it.each(
    [1, 9, 40].flatMap((depth) =>
        ['private-access', 'private-refresh', 'personal-key', 'proxy-key'].map(
            (secret) => ({ depth, secret }),
        ),
    ),
)('hides $secret at depth $depth', ({ depth, secret }) => {
    const slot = slotFixture();
    slot.lastReported.approvedProjects = [
        {
            projectUuid: 'project',
            name: encodeDeeply(secret, depth),
            approvedCapabilities: [],
        },
    ];
    expect(
        publicConnectionReport(slot, ['personal-key', 'proxy-key'])
            .approvedProjects[0].name,
    ).toBeNull();
    expect(
        publicTextIsSafe(
            `https://example.com/?name=${encodeDeeply(secret, depth)}`,
            [secret],
        ),
    ).toBe(false);
});
it('refuses oversized input before decoding and bounds rounds by input length', () => {
    expect(publicTextIsSafe('x'.repeat(2049), [])).toBe(false);
    const slot = slotFixture();
    slot.lastReported.approvedProjects = [
        {
            projectUuid: 'project',
            name: 'x'.repeat(2049),
            approvedCapabilities: [],
        },
    ];
    expect(publicConnectionReport(slot).approvedProjects[0].name).toBeNull();
    const input = encodeDeeply('x', 1000);
    const decode = vi.spyOn(Buffer, 'from');
    expect(publicTextIsSafe(input, [])).toBe(true);
    expect(decode.mock.calls.length).toBeGreaterThan(8);
    expect(decode.mock.calls.length).toBeLessThanOrEqual(input.length);
    decode.mockRestore();
});
it('caps approval URLs before launch and screens secrets at any depth', async () => {
    const { capturePersonalBootstrap } = await import('./personalRecovery');
    const bootstrap = capturePersonalBootstrap({
        context: {
            apiKey: 'personal-key',
            proxyAuthorization: 'proxy-key',
            serverUrl: 'https://example.com',
        },
    });
    expect(
        bootstrap.publicTextIsSafe(
            `https://example.com/?request=${'x'.repeat(8192)}`,
        ),
    ).toBe(false);
    expect(
        bootstrap.publicTextIsSafe(
            `https://example.com/?request=${'x'.repeat(3000)}`,
        ),
    ).toBe(true);
    for (const depth of [1, 9, 40]) {
        for (const secret of [
            'personal-key',
            'proxy-key',
            'private-access',
            'private-refresh',
        ]) {
            expect(
                bootstrap.publicTextIsSafe(
                    `https://example.com/?request=${encodeDeeply(secret, depth)}`,
                    ['private-access', 'private-refresh'],
                ),
            ).toBe(false);
        }
    }
});

it('cleans names before screening so repeated writes keep the same report', () => {
    const slot = slotFixture();
    slot.lastReported.approvedProjects = [
        {
            projectUuid: 'project',
            name: 'private-\naccess',
            approvedCapabilities: [],
        },
    ];
    const report = publicConnectionReport(slot);
    expect(report.approvedProjects[0].name).toBeNull();
    expect(publicConnectionReport({ ...slot, lastReported: report })).toEqual(
        report,
    );
});
