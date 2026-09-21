import { z } from 'zod';
import {
    collectionBlockSchema,
    ctaBlockSchema,
    homepageBlockSchema,
    quickActionsBlockSchema,
    resourcesBlockSchema,
} from '../../ee/homepage/schema';
import type {
    HomepageBlock,
    HomepageCollectionBlock,
    HomepageCollectionItemRef,
    HomepageCtaBlock,
    HomepageQuickAction,
    HomepageQuickActionsBlock,
    HomepageResourcesBlock,
} from '../../ee/homepage/types';
import { ParameterError } from '../errors';
import { ProjectMemberRole } from '../projectMemberRole';
import type {
    ApiContentAsCodeListResponse,
    ApiContentAsCodeUpsertResponse,
} from './base';
import { ContentAsCodeType } from './core';

export type HomepageActionAsCode =
    | Exclude<HomepageQuickAction, { type: 'dashboard' | 'space' }>
    | {
          type: 'dashboard';
          dashboardSlug: string;
          label: string;
          primary?: boolean;
      }
    | { type: 'space'; spaceSlug: string; label: string; primary?: boolean };

export type HomepageBlockAsCode =
    | Exclude<
          HomepageBlock,
          | HomepageCollectionBlock
          | HomepageResourcesBlock
          | HomepageQuickActionsBlock
          | HomepageCtaBlock
      >
    | {
          id: string;
          type: 'collection';
          config: Omit<HomepageCollectionBlock['config'], 'items'> & {
              items: {
                  contentType: HomepageCollectionItemRef['contentType'];
                  slug: string;
              }[];
          };
      }
    | {
          id: string;
          type: 'resources';
          config: Omit<HomepageResourcesBlock['config'], 'items'> & {
              items: (Omit<
                  HomepageResourcesBlock['config']['items'][number],
                  'appUuid'
              > & { appSlug?: string })[];
          };
      }
    | {
          id: string;
          type: 'quick-actions';
          config: { actions: HomepageActionAsCode[] };
      }
    | {
          id: string;
          type: 'cta';
          config: Omit<HomepageCtaBlock['config'], 'target'> & {
              target: HomepageActionAsCode | { type: 'link'; url: string };
          };
      };

export type HomepageAsCode = {
    contentType: ContentAsCodeType.HOMEPAGE;
    version: 1;
    /** Exact project-scoped name. Duplicate names cannot be exported/upserted. */
    name: string;
    config: {
        version: 1;
        rows: { id: string; blocks: HomepageBlockAsCode[] }[];
    };
    publication: {
        isDefault: boolean;
        groups: { name: string; priority: number }[];
        roles: ProjectMemberRole[];
    } | null;
};

export type ApiHomepageAsCodeListResponse = ApiContentAsCodeListResponse<{
    homepages: HomepageAsCode[];
    missingNames: string[];
}>;
export type ApiHomepageAsCodeUpsertResponse = ApiContentAsCodeUpsertResponse;

const reference = z.string().min(1);
const actionSchema = z.union([
    z.object({
        type: z.literal('dashboard'),
        dashboardSlug: reference,
        label: z.string(),
        primary: z.boolean().optional(),
    }),
    z.object({
        type: z.literal('space'),
        spaceSlug: reference,
        label: z.string(),
        primary: z.boolean().optional(),
    }),
    z.object({
        type: z.enum([
            'ask-ai',
            'run-query',
            'browse-dashboards',
            'browse-spaces',
            'my-space',
        ]),
        primary: z.boolean().optional(),
    }),
]);

const blockSchema = z.union([
    ...homepageBlockSchema.options.filter(
        (schema) =>
            !['collection', 'resources', 'quick-actions', 'cta'].includes(
                schema.shape.type.value,
            ),
    ),
    collectionBlockSchema.extend({
        config: collectionBlockSchema.shape.config.extend({
            items: z.array(
                z.object({
                    contentType:
                        collectionBlockSchema.shape.config.shape.items.element
                            .shape.contentType,
                    slug: reference,
                }),
            ),
        }),
    }),
    resourcesBlockSchema.extend({
        config: resourcesBlockSchema.shape.config.extend({
            items: z.array(
                resourcesBlockSchema.shape.config.shape.items.element
                    .omit({ appUuid: true })
                    .extend({ appSlug: reference.optional() }),
            ),
        }),
    }),
    quickActionsBlockSchema.extend({
        config: z.object({ actions: z.array(actionSchema) }),
    }),
    ctaBlockSchema.extend({
        config: ctaBlockSchema.shape.config.extend({
            target: z.union([
                actionSchema,
                z.object({ type: z.literal('link'), url: z.string() }),
            ]),
        }),
    }),
]);

const documentSchema = z.object({
    contentType: z.literal(ContentAsCodeType.HOMEPAGE),
    version: z.literal(1),
    name: reference,
    config: z.object({
        version: z.literal(1),
        rows: z.array(
            z.object({ id: z.string(), blocks: z.array(blockSchema).max(2) }),
        ),
    }),
    publication: z
        .object({
            isDefault: z.boolean(),
            groups: z.array(
                z.object({
                    name: reference,
                    priority: z.number().int().nonnegative(),
                }),
            ),
            roles: z.array(z.nativeEnum(ProjectMemberRole)),
        })
        .nullable(),
});

export const parseHomepageAsCode = (
    input: unknown,
    source: string,
): HomepageAsCode => {
    const result = documentSchema.safeParse(input);
    if (!result.success) {
        const issue = result.error.issues[0];
        throw new ParameterError(
            `Invalid homepage file "${source}" at ${issue.path.join('.')}: ${issue.message}`,
        );
    }
    return result.data as HomepageAsCode;
};
