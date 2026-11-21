/**
 * Reads the live integration registry and renders hydra pages.
 *
 *   hydra.sh specs [connector]   print integrations as JSON (all, or one)
 *   hydra.sh view                write ~/.hydra/view.html for every integration
 *   hydra.sh render <page.json>  write ~/.hydra/<mode>-<slug>.html from an
 *                                assess or test page an agent wrote
 */
import { ApiConnectorType } from '@lightdash/common';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getLiveIntegration } from '../../../packages/backend/src/services/QuerySourceService/live/registry';
import { getLiveAuthScore } from '../../../packages/backend/src/services/QuerySourceService/live/spec/auth';
import { crossToolUseCases } from '../../../packages/backend/src/services/QuerySourceService/live/spec/crossToolUseCases';
import type { LiveIntegrationSpec } from '../../../packages/backend/src/services/QuerySourceService/live/spec/types';

type PageIntegration = Pick<
    LiveIntegrationSpec,
    'level' | 'auth' | 'paging' | 'rateLimiting' | 'useCases'
> & {
    name: string;
    label: string;
    /** assess: the go/no-go in a sentence or two. */
    verdict?: string;
    /** assess: the explores the integration would offer, from what the API returns natively. */
    explores?: {
        name: string;
        label: string;
        description?: string;
        dimensions: { name: string; description?: string }[];
        metrics: { name: string; description?: string }[];
    }[];
    /** test: what each tried case did, by use case id. */
    results?: Record<string, { outcome: string; note?: string }>;
};

type Page = {
    mode: 'view' | 'assess' | 'test';
    title: string;
    integrations: PageIntegration[];
};

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(homedir(), '.hydra');

const toPageIntegration = (connector: ApiConnectorType): PageIntegration => {
    const { label, level, auth, paging, rateLimiting, useCases } =
        getLiveIntegration(connector);
    return {
        name: connector,
        label,
        level,
        auth,
        paging,
        rateLimiting,
        useCases,
    };
};

const render = (page: Page, file: string) => {
    const withScores = {
        ...page,
        generatedAt: new Date().toISOString(),
        integrations: page.integrations.map((integration) => ({
            ...integration,
            authScore: getLiveAuthScore(integration),
        })),
    };
    const template = readFileSync(join(HERE, 'template.html'), 'utf8');
    const json = JSON.stringify(withScores).replace(/</g, '\\u003c');
    mkdirSync(OUT, { recursive: true });
    const path = join(OUT, file);
    writeFileSync(path, template.replace('__HYDRA_DATA__', json));
    console.log(path);
};

const slug = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

const [command, arg] = process.argv.slice(2);
const connectors = Object.values(ApiConnectorType);

if (command === 'specs') {
    const list = arg ? [arg as ApiConnectorType] : connectors;
    const unknown = list.filter((c) => !connectors.includes(c));
    if (unknown.length > 0) {
        throw new Error(
            `Unknown integration ${unknown.join(', ')}; one of ${connectors.join(', ')}`,
        );
    }
    console.log(
        JSON.stringify(
            {
                integrations: list.map(toPageIntegration),
                ...(arg ? {} : { crossTool: crossToolUseCases }),
            },
            null,
            2,
        ),
    );
} else if (command === 'view') {
    render(
        {
            mode: 'view',
            title: 'Live integrations',
            integrations: connectors.map(toPageIntegration),
        },
        'view.html',
    );
} else if (command === 'render' && arg) {
    const page = JSON.parse(readFileSync(arg, 'utf8')) as Page;
    if (page.mode !== 'assess' && page.mode !== 'test') {
        throw new Error('render takes an assess or test page');
    }
    render(
        page,
        `${page.mode}-${slug(page.integrations[0]?.name ?? page.title)}.html`,
    );
} else {
    console.error(
        'Usage: hydra.sh specs [connector] | view | render <page.json>',
    );
    process.exit(1);
}
