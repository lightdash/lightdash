#!/usr/bin/env npx tsx
/**
 * Stamps a new tag onto an existing E2B template build without rebuilding.
 *
 * Used by the data-app-template GitHub workflow at release time when no
 * template/SDK files changed since the previous release — instead of burning
 * E2B build minutes for a no-op rebuild, we just point the new version's tag
 * at the build that `:latest` (or another source tag) already references.
 *
 * Inputs (env):
 *   E2B_API_KEY               — required
 *   E2B_TEMPLATE_NAME         — required (e.g. lightdash-data-app)
 *   E2B_TEMPLATE_TAG          — required, the new tag to stamp (e.g. 0.2870.0)
 *   E2B_TEMPLATE_SOURCE_TAG   — required, the source build identifier (e.g. latest)
 *   E2B_TEMPLATE_EXTRA_TAGS   — optional, comma-separated additional tags
 */
import { Template } from 'e2b';

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing required env var: ${name}`);
        process.exit(1);
    }
    return value;
};

const apiKey = requireEnv('E2B_API_KEY');
const templateName = requireEnv('E2B_TEMPLATE_NAME');
const newTag = requireEnv('E2B_TEMPLATE_TAG');
const sourceTag = requireEnv('E2B_TEMPLATE_SOURCE_TAG');
const extraTags = (process.env.E2B_TEMPLATE_EXTRA_TAGS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

const target = `${templateName}:${sourceTag}`;
const tagsToAssign = [newTag, ...extraTags];

console.log(`Assigning [${tagsToAssign.join(', ')}] to build ${target}...`);
await Template.assignTags(target, tagsToAssign, { apiKey });
console.log('Done.');
