import * as fs from 'fs';
import * as path from 'path';
import type { GraphData } from '../types';

const TEMPLATE_DIR = __dirname;

export function generateHtml(data: GraphData): string {
    const { controllers, routers, services, models, clients, totalEdges } = data.stats;
    const json = JSON.stringify(data);

    const htmlTemplate = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf-8');
    const css = fs.readFileSync(path.join(TEMPLATE_DIR, 'styles.css'), 'utf-8');
    const js = fs.readFileSync(path.join(TEMPLATE_DIR, 'graph.js'), 'utf-8');

    const legendHtml = `<span class="stat stat-c"><b>${controllers}</b> controllers</span>
  <span class="stat stat-r"><b>${routers}</b> routers</span>
  <span class="stat stat-s"><b>${services}</b> services</span>
  <span class="stat stat-m"><b>${models}</b> models</span>
  <span class="stat stat-k"><b>${clients}</b> clients</span>
  <span class="stat"><b>${totalEdges}</b> edges</span>`;

    const scriptWithData = js.replace('/*__DATA__*/null', json);

    return htmlTemplate
        .replace('<!-- STYLES -->', css)
        .replace('<!-- LEGEND -->', legendHtml)
        .replace('<!-- SCRIPT -->', scriptWithData);
}
