#!/usr/bin/env npx tsx
import { Template } from 'e2b';

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
};

const apiKey = requireEnv('E2B_API_KEY');
const templateName = requireEnv('E2B_AGENT_ONBOARDING_TEMPLATE_NAME');
const newTag = requireEnv('E2B_AGENT_ONBOARDING_TEMPLATE_TAG');
const sourceTag = requireEnv('E2B_AGENT_ONBOARDING_TEMPLATE_SOURCE_TAG');
const extraTags = (process.env.E2B_AGENT_ONBOARDING_TEMPLATE_EXTRA_TAGS || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const target = `${templateName}:${sourceTag}`;
const tagsToAssign = [newTag, ...extraTags];

console.log(`Assigning [${tagsToAssign.join(', ')}] to build ${target}...`);
await Template.assignTags(target, tagsToAssign, { apiKey });
console.log('Done.');
