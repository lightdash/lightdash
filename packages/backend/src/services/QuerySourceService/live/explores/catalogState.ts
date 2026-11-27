import { z } from 'zod';
import { type LiveObjectCatalog } from '../types';

/**
 * A source's two catalogs. The discovered one is what the integration
 * reported at the last Refresh, replaced each time; the configured one is
 * what admins chose (custom objects turned on and their explore names, and
 * the explore and field edits), which Refresh never touches. Its keys map
 * one to one onto a Lightdash YAML model: `objects.<id>.name` is the model
 * name, explore edits its label, description and `ai_hint`, field edits its
 * columns.
 *
 * Explores are built from both: built-in explores from the integration's
 * code, with discovered fields, and one explore per custom object an admin
 * turned on, under the name it got then.
 */
export type LiveSourceCatalog = LiveObjectCatalog & {
    /** ISO timestamp of the Refresh that read it. */
    refreshedAt: string;
};

export const catalogEntrySchema = z.object({
    id: z.string().min(1),
    label: z.string(),
    builtIn: z.boolean(),
    recordIdField: z.string().optional(),
    defaultDateField: z.string().optional(),
    fields: z.array(
        z.object({
            id: z.string().min(1),
            label: z.string(),
            vendorType: z.string(),
            description: z.string().optional(),
            internal: z.boolean().optional(),
        }),
    ),
});

export const liveSourceCatalogSchema = z.object({
    refreshedAt: z.string(),
    entries: z.array(catalogEntrySchema),
});

export const liveConfiguredObjectsSchema = z.record(
    z.string(),
    z.object({ name: z.string().min(1) }),
);
