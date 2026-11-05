import * as yaml from 'js-yaml';
import { getConfig } from './config';

const mocks = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('fs', () => ({
    promises: { readFile: mocks.readFile, chmod: async () => {} },
}));
afterEach(() => vi.unstubAllEnvs());
it('does not print credential-file source excerpts when YAML parsing fails', async () => {
    mocks.readFile.mockResolvedValue(
        'context:\n  apiKey: malformed-config-secret: broken\n',
    );
    const error = await getConfig({ readOnly: true }).catch((e: Error) => e);
    expect(String(error)).not.toContain('malformed-config-secret');
    expect(error).toBeInstanceOf(yaml.YAMLException);
    expect(String(error)).toContain(
        'Could not parse CLI configuration at line 2, column 34. Check the syntax of config.yaml.',
    );
    expect(JSON.stringify(error)).not.toContain('malformed-config-secret');
});
