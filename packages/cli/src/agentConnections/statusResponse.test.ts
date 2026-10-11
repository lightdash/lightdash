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
