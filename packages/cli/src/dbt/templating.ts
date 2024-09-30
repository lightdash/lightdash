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

export const renderProfilesYml = (
    raw: string,
    context?: Record<string, unknown>,
) => {
    const template = nunjucks.compile(raw, nunjucksEnv);
    const rendered = template.render({
        ...nunjucksContext,
        ...(context || {}),
    });
    // Fix multiline privatekey strings
    // Prevents error: Error: error:1E08010C:DECODER routines::unsupported
    const privateKeyRegex =
        /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g;
    return rendered.replace(privateKeyRegex, (match) =>
        match.replace(/\n/g, '\\n'),
    );
};
