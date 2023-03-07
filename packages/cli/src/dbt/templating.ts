import * as nunjucks from 'nunjucks';

// jinja filters
const nunjucksEnv = new nunjucks.Environment();
nunjucksEnv.addFilter('as_number', (str) => parseFloat(str));

// jinja global functions
const nunjucksContext = {
    env_var: (key: string) => process.env[key],
    var: (key: string) =>
        JSON.parse(process.argv[process.argv.indexOf('--vars') + 1])[key],
};

export const renderProfilesYml = (
    raw: string,
    context?: Record<string, any>,
) => {
    const template = nunjucks.compile(raw, nunjucksEnv);
    const rendered = template.render({
        ...nunjucksContext,
        ...(context || {}),
    });
    return rendered;
};
