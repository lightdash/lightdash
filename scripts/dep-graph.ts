#!/usr/bin/env npx tsx
/**
 * Generates an interactive dependency graph of the Lightdash backend.
 *
 * Parses actual runtime DI wiring from:
 *   - ServiceRepository.ts  (service -> model/client/service injections)
 *   - Controller files       (controller -> service calls)
 *
 * Usage:
 *   npx tsx scripts/dep-graph.ts              # domain-clustered layout with summaries (cached)
 *   npx tsx scripts/dep-graph.ts --json       # outputs raw JSON to stdout
 *   npx tsx scripts/dep-graph.ts --out dir    # writes HTML to dir/
 *   npx tsx scripts/dep-graph.ts --refresh    # re-classify domains & regenerate summaries even if cache is fresh
 *   npx tsx scripts/dep-graph.ts --sentry     # include Sentry production traffic data (requires SENTRY_AUTH_TOKEN)
 *   npx tsx scripts/dep-graph.ts --publish    # publish to GitHub Pages (charliedowler/lightdash-dep-graph)
 */

import { main } from './dep-graph/main';

main();
