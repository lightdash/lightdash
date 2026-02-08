import * as fs from 'fs';
import * as path from 'path';
import type { GraphData } from '../types';

const TEMPLATE_DIR = __dirname;

export function generateHtml(data: GraphData): string {
    const { controllers, routers, services, models, clients, schedulers, entities, adapters, middlewares, analytics, totalEdges } = data.stats;
    const json = JSON.stringify(data);

    const htmlTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, 'styles.css'), 'utf-8');
    const js = fs.readFileSync(path.join(TEMPLATE_DIR, 'graph.js'), 'utf-8');

    const extraStats = [
        schedulers > 0 ? `<span class="stat stat-sc"><b>${schedulers}</b> schedulers</span>` : '',
        entities > 0 ? `<span class="stat stat-en"><b>${entities}</b> entities</span>` : '',
        adapters > 0 ? `<span class="stat stat-ad"><b>${adapters}</b> adapters</span>` : '',
        middlewares > 0 ? `<span class="stat stat-mw"><b>${middlewares}</b> middlewares</span>` : '',
        analytics > 0 ? `<span class="stat stat-an"><b>${analytics}</b> analytics</span>` : '',
    ].filter(Boolean).join('\n  ');

    const legendHtml = `<span class="stat stat-c"><b>${controllers}</b> controllers</span>
  <span class="stat stat-r"><b>${routers}</b> routers</span>
  <span class="stat stat-s"><b>${services}</b> services</span>
  <span class="stat stat-m"><b>${models}</b> models</span>
  <span class="stat stat-k"><b>${clients}</b> clients</span>
  ${extraStats}
  <span class="stat"><b>${totalEdges}</b> edges</span>`;

    const scriptWithData = js.replace('/*__DATA__*/null', json);

    return htmlTemplate
        .replace('<!-- STYLES -->', css)
        .replace('<!-- LEGEND -->', legendHtml)
        .replace('<!-- SCRIPT -->', scriptWithData);
}
