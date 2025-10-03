import * as nunjucks from 'nunjucks';

// jinja filters
const nunjucksEnv = new nunjucks.Environment(null, { autoescape: false });
nunjucksEnv.addFilter('as_number', (str) => parseFloat(str));

// jinja global functions
const nunjucksContext = {
    env_var: (key: string, options?: string | { default?: string }) => {
        let fallbackValue: string | undefined;
        if (typeof options === 'string') {
            fallbackValue = options;
        } else if (typeof options === 'object') {
            fallbackValue = options.default;
        }
        return process.env[key] ?? fallbackValue;
    },
    var: (key: string) =>
        JSON.parse(process.argv[process.argv.indexOf('--vars') + 1])[key],
};

/**
 * Render a dbt YAML file with Jinja templating (env_var, var, filters)
 * @param raw - Raw YAML content as string
 * @param context - Additional context variables to pass to the template
 * @returns Rendered YAML string with Jinja expressions resolved
 */
export const renderTemplatedYml = (
    raw: string,
    context?: Record<string, unknown>,
): string => {
    const template = nunjucks.compile(raw, nunjucksEnv);
    return template.render({
        ...nunjucksContext,
        ...(context || {}),
    });
};

/**
 * Render a profiles.yml file with Jinja templating and private key handling
 * @param raw - Raw profiles.yml content as string
 * @param context - Additional context variables to pass to the template
 * @returns Rendered profiles.yml string with Jinja expressions resolved and private keys escaped
 */
export const renderProfilesYml = (
    raw: string,
    context?: Record<string, unknown>,
): string => {
    const rendered = renderTemplatedYml(raw, context);
    // Fix multiline privatekey strings
    // Prevents error: Error: error:1E08010C:DECODER routines::unsupported
    const privateKeyRegex =
        /(-----BEGIN(?:\s+ENCRYPTED)?\s+PRIVATE KEY-----[\s\S]*?-----END(?:\s+ENCRYPTED)?\s+PRIVATE KEY-----)/g;
    return rendered.replace(privateKeyRegex, (match) =>
        match.replace(/\n/g, '\\n'),
    );
};
