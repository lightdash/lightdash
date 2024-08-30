import { renderProfilesYml } from './templating';

describe('Templating', () => {
    const { env, argv } = process;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...env };
        process.argv = { ...argv };
    });

    afterEach(() => {
        process.env = env;
        process.argv = argv;
    });

    describe('renderProfilesYml', () => {
        describe('env_var()', () => {
            test('should not escape values', () => {
                process.env.SPAN = '<span>';
                expect(renderProfilesYml("{{ env_var('SPAN') }}")).toBe(
                    '<span>',
                );
                process.env.WINDOWS_PATH = 'C:\\example';
                expect(renderProfilesYml("{{ env_var('WINDOWS_PATH') }}")).toBe(
                    'C:\\example',
                );
            });
            test('should convert env_var functions and return env var values', () => {
                process.env.DBT_USER = 'test';
                expect(renderProfilesYml("{{ env_var('DBT_USER') }}")).toBe(
                    'test',
                );
                process.env.DBT_ENV_SECRET_HOST_DOMAIN = 'domain';
                process.env.DBT_ENV_SECRET_HOST_PATH = 'host_path';
                expect(
                    renderProfilesYml(
                        "www.{{ env_var('DBT_ENV_SECRET_HOST_DOMAIN') }}.com/{{ env_var('DBT_ENV_SECRET_HOST_PATH') }}",
                    ),
                ).toBe('www.domain.com/host_path');
            });
            test('should convert env_var function with number conversion', () => {
                process.env.REDSHIFT_PORT = '2000';
                expect(
                    renderProfilesYml(
                        "{{ env_var('REDSHIFT_PORT') | as_number}}",
                    ),
                ).toBe('2000');
            });
            test('should convert env_var function and fallback to default value', () => {
                expect(
                    renderProfilesYml(
                        "{{ env_var('DBT_USER', 'default_value') }}",
                    ),
                ).toBe('default_value');
            });
            test('should convert env_var function and fallback to default value using keyword default', () => {
                expect(
                    renderProfilesYml(
                        "{{ env_var('DBT_USER', default='default_value') }}",
                    ),
                ).toBe('default_value');
            });
        });
        describe('var()', () => {
            test('should convert var functions and return env var values', () => {
                process.argv = [
                    '--vars',
                    '{"domain": "domain", "host_path": "host_path"}',
                ];
                expect(
                    renderProfilesYml(
                        "www.{{ var('domain') }}.com/{{ var('host_path') }}",
                    ),
                ).toBe('www.domain.com/host_path');
            });
        });
    });
});
