# Admin-Managed Allowed Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow org admins to manage CORS and iframe embedding domains through the UI, with backwards compatibility for env var configuration.

**Architecture:** New `organization_allowed_domains` DB table + EE service/model/controller + frontend settings panel. CORS middleware and Helmet CSP are made dynamic to merge env var domains with DB domains at runtime. All gated behind `CommercialFeatureFlags.Embedding`.

**Tech Stack:** Knex migration, Express/TSOA controller, React + Mantine v8 + TanStack Query frontend panel.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/common/src/ee/allowedDomains.ts` | Create | Shared types (`AllowedDomain`, `AllowedDomainType`, `CreateAllowedDomain`) |
| `packages/common/src/ee/index.ts` | Modify | Re-export from `allowedDomains.ts` |
| `packages/backend/src/database/migrations/YYYYMMDDHHMMSS_create_organization_allowed_domains.ts` | Create | DB migration |
| `packages/backend/src/database/entities/organizationAllowedDomains.ts` | Create | Table name constant + row type |
| `packages/backend/src/ee/models/OrganizationAllowedDomainsModel.ts` | Create | CRUD on `organization_allowed_domains` table |
| `packages/backend/src/ee/services/OrganizationAllowedDomainsService.ts` | Create | Business logic, validation, feature flag check |
| `packages/backend/src/ee/controllers/organizationAllowedDomainsController.ts` | Create | TSOA endpoints: GET, POST, DELETE |
| `packages/backend/src/services/ServiceRepository.ts` | Modify | Add `organizationAllowedDomainsService` to manifest + getter |
| `packages/backend/src/models/ModelRepository.ts` | Modify | Add `organizationAllowedDomainsModel` to manifest + getter |
| `packages/backend/src/ee/index.ts` | Modify | Register service + model providers |
| `packages/backend/src/App.ts` | Modify | Make CORS + CSP dynamic using DB domains |
| `packages/frontend/src/ee/features/embed/SettingsAllowedDomains/index.tsx` | Create | Settings panel component |
| `packages/frontend/src/ee/features/embed/SettingsAllowedDomains/useOrganizationAllowedDomains.ts` | Create | TanStack Query hooks |
| `packages/frontend/src/pages/Settings.tsx` | Modify | Add route + nav link |

---

### Task 1: Common Types

**Files:**
- Create: `packages/common/src/ee/allowedDomains.ts`
- Modify: `packages/common/src/ee/index.ts`

- [ ] **Step 1: Create the shared types file**

Create `packages/common/src/ee/allowedDomains.ts`:

```typescript
export type AllowedDomainType = 'sdk' | 'embed';

export type AllowedDomain = {
    organizationAllowedDomainUuid: string;
    domain: string;
    type: AllowedDomainType;
    createdAt: Date;
    createdByUserUuid: string | null;
};

export type CreateAllowedDomain = {
    domain: string;
    type: AllowedDomainType;
};

export type ApiOrganizationAllowedDomainsResponse = {
    status: 'ok';
    results: AllowedDomain[];
};

export type ApiOrganizationAllowedDomainResponse = {
    status: 'ok';
    results: AllowedDomain;
};
```

- [ ] **Step 2: Re-export from ee/index.ts**

Add to `packages/common/src/ee/index.ts`:

```typescript
export * from './allowedDomains';
```

- [ ] **Step 3: Verify common package compiles**

Run: `pnpm -F common typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/common/src/ee/allowedDomains.ts packages/common/src/ee/index.ts
git commit -m "feat: add shared types for organization allowed domains"
```

---

### Task 2: Database Migration + Entity

**Files:**
- Create: `packages/backend/src/database/migrations/YYYYMMDDHHMMSS_create_organization_allowed_domains.ts`
- Create: `packages/backend/src/database/entities/organizationAllowedDomains.ts`

- [ ] **Step 1: Create the migration**

Run: `pnpm -F backend create-migration create_organization_allowed_domains`

Then write the generated file:

```typescript
import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.createTable('organization_allowed_domains', (table) => {
        table
            .uuid('organization_allowed_domain_uuid')
            .primary()
            .defaultTo(knex.raw('uuid_generate_v4()'));
        table
            .integer('organization_id')
            .notNullable()
            .references('organization_id')
            .inTable('organizations')
            .onDelete('CASCADE');
        table.text('domain').notNullable();
        table
            .text('type')
            .notNullable()
            .defaultTo('embed');
        table
            .timestamp('created_at', { useTz: false })
            .notNullable()
            .defaultTo(knex.fn.now());
        table.uuid('created_by_user_uuid').references('user_uuid').inTable('users').onDelete('SET NULL');
        table.unique(['organization_id', 'domain']);
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.dropTableIfExists('organization_allowed_domains');
};
```

- [ ] **Step 2: Create the entity file**

Create `packages/backend/src/database/entities/organizationAllowedDomains.ts`:

```typescript
import { type Knex } from 'knex';

export const OrganizationAllowedDomainsTableName = 'organization_allowed_domains';

export type DbOrganizationAllowedDomain = {
    organization_allowed_domain_uuid: string;
    organization_id: number;
    domain: string;
    type: 'sdk' | 'embed';
    created_at: Date;
    created_by_user_uuid: string | null;
};

export type CreateDbOrganizationAllowedDomain = Pick<
    DbOrganizationAllowedDomain,
    'organization_id' | 'domain' | 'type' | 'created_by_user_uuid'
>;
```

- [ ] **Step 3: Run the migration**

Run: `pnpm -F backend migrate`
Expected: Migration runs successfully

- [ ] **Step 4: Verify table was created**

Run: `psql -c "\d organization_allowed_domains"`
Expected: Shows the table schema with all columns

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/database/migrations/*create_organization_allowed_domains* packages/backend/src/database/entities/organizationAllowedDomains.ts
git commit -m "feat: add organization_allowed_domains table"
```

---

### Task 3: EE Model

**Files:**
- Create: `packages/backend/src/ee/models/OrganizationAllowedDomainsModel.ts`
- Modify: `packages/backend/src/models/ModelRepository.ts`

- [ ] **Step 1: Create the model**

Create `packages/backend/src/ee/models/OrganizationAllowedDomainsModel.ts`:

```typescript
import {
    AllowedDomain,
    ConflictError,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    CreateDbOrganizationAllowedDomain,
    OrganizationAllowedDomainsTableName,
} from '../../database/entities/organizationAllowedDomains';

type Dependencies = {
    database: Knex;
};

export class OrganizationAllowedDomainsModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async getAllByOrganizationId(
        organizationId: number,
    ): Promise<AllowedDomain[]> {
        const rows = await this.database(OrganizationAllowedDomainsTableName)
            .where('organization_id', organizationId)
            .orderBy('created_at', 'asc');

        return rows.map((row) => ({
            organizationAllowedDomainUuid:
                row.organization_allowed_domain_uuid,
            domain: row.domain,
            type: row.type,
            createdAt: row.created_at,
            createdByUserUuid: row.created_by_user_uuid,
        }));
    }

    async getAllDomains(): Promise<AllowedDomain[]> {
        const rows = await this.database(OrganizationAllowedDomainsTableName)
            .orderBy('created_at', 'asc');

        return rows.map((row) => ({
            organizationAllowedDomainUuid:
                row.organization_allowed_domain_uuid,
            domain: row.domain,
            type: row.type,
            createdAt: row.created_at,
            createdByUserUuid: row.created_by_user_uuid,
        }));
    }

    async create(
        data: CreateDbOrganizationAllowedDomain,
    ): Promise<AllowedDomain> {
        const [row] = await this.database(OrganizationAllowedDomainsTableName)
            .insert(data)
            .returning('*');

        return {
            organizationAllowedDomainUuid:
                row.organization_allowed_domain_uuid,
            domain: row.domain,
            type: row.type,
            createdAt: row.created_at,
            createdByUserUuid: row.created_by_user_uuid,
        };
    }

    async delete(
        organizationId: number,
        domainUuid: string,
    ): Promise<void> {
        const deleted = await this.database(
            OrganizationAllowedDomainsTableName,
        )
            .where('organization_id', organizationId)
            .where('organization_allowed_domain_uuid', domainUuid)
            .delete();

        if (deleted === 0) {
            throw new NotFoundError('Allowed domain not found');
        }
    }
}
```

- [ ] **Step 2: Register in ModelRepository**

In `packages/backend/src/models/ModelRepository.ts`:

1. Add to the `ModelManifest` interface (in the `unknown` EE section around line 128-133):
```typescript
organizationAllowedDomainsModel: unknown;
```

2. Add a getter method (near the other EE model getters around line 675-680):
```typescript
public getOrganizationAllowedDomainsModel<ModelImplT>(): ModelImplT {
    return this.getModel('organizationAllowedDomainsModel');
}
```

- [ ] **Step 3: Register in ee/index.ts modelProviders**

In `packages/backend/src/ee/index.ts`, add to the `modelProviders` object (around line 410-425):

```typescript
import { OrganizationAllowedDomainsModel } from './models/OrganizationAllowedDomainsModel';
```

And in the `modelProviders` section:
```typescript
organizationAllowedDomainsModel: ({ database }) =>
    new OrganizationAllowedDomainsModel({ database }),
```

- [ ] **Step 4: Verify backend typechecks**

Run: `pnpm -F backend typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ee/models/OrganizationAllowedDomainsModel.ts packages/backend/src/models/ModelRepository.ts packages/backend/src/ee/index.ts
git commit -m "feat: add OrganizationAllowedDomainsModel"
```

---

### Task 4: EE Service

**Files:**
- Create: `packages/backend/src/ee/services/OrganizationAllowedDomainsService.ts`
- Modify: `packages/backend/src/services/ServiceRepository.ts`
- Modify: `packages/backend/src/ee/index.ts`

- [ ] **Step 1: Create the service**

Create `packages/backend/src/ee/services/OrganizationAllowedDomainsService.ts`:

```typescript
import {
    AllowedDomain,
    CommercialFeatureFlags,
    ConflictError,
    CreateAllowedDomain,
    ForbiddenError,
    ParameterError,
    SessionUser,
    type AllowedDomainType,
} from '@lightdash/common';
import { BaseService } from '../../services/BaseService';
import { OrganizationModel } from '../../models/OrganizationModel';
import { OrganizationAllowedDomainsModel } from '../models/OrganizationAllowedDomainsModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel';
import { CommercialFeatureFlagModel } from '../models/CommercialFeatureFlagModel';

type Dependencies = {
    organizationAllowedDomainsModel: OrganizationAllowedDomainsModel;
    organizationModel: OrganizationModel;
    commercialFeatureFlagModel: CommercialFeatureFlagModel;
};

/**
 * Validates a domain string for use as a CORS origin / CSP frame-ancestor.
 * Accepts:
 *   - https://example.com
 *   - https://example.com:3000
 *   - *.example.com (subdomain wildcard, must have 2+ domain levels)
 *   - http://localhost, http://localhost:3000
 * Rejects:
 *   - bare *, *.com, paths, trailing slashes, query strings
 */
function validateDomain(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');

    // Subdomain wildcard pattern: *.example.com
    const wildcardMatch = trimmed.match(
        /^\*\.([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)$/,
    );
    if (wildcardMatch) {
        return `*.${wildcardMatch[1].toLowerCase()}`;
    }

    // Reject bare wildcard
    if (trimmed === '*' || trimmed.startsWith('*.') && trimmed.split('.').length < 3) {
        throw new ParameterError(
            'Wildcard domains must have at least a second-level domain (e.g. *.example.com)',
        );
    }

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new ParameterError(
            `Invalid domain format. Expected a valid origin like https://example.com`,
        );
    }

    // Protocol check
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost)) {
        throw new ParameterError(
            'Domain must use https:// (http:// is only allowed for localhost)',
        );
    }

    // Reject paths and query strings
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new ParameterError(
            'Domain must be an origin only (no path, query string, or hash)',
        );
    }

    return url.origin;
}

export class OrganizationAllowedDomainsService extends BaseService {
    private readonly organizationAllowedDomainsModel: OrganizationAllowedDomainsModel;

    private readonly organizationModel: OrganizationModel;

    private readonly commercialFeatureFlagModel: CommercialFeatureFlagModel;

    constructor(dependencies: Dependencies) {
        super();
        this.organizationAllowedDomainsModel =
            dependencies.organizationAllowedDomainsModel;
        this.organizationModel = dependencies.organizationModel;
        this.commercialFeatureFlagModel =
            dependencies.commercialFeatureFlagModel;
    }

    private async checkFeatureEnabled(user: SessionUser): Promise<void> {
        const organization = await this.organizationModel.get(
            user.organizationUuid!,
        );
        if (!organization) {
            throw new ForbiddenError('Organization not found');
        }

        const flag = await this.commercialFeatureFlagModel.get({
            user: {
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid!,
                organizationName: organization.name,
            },
            featureFlagId: CommercialFeatureFlags.Embedding,
        });

        if (!flag.enabled) {
            throw new ForbiddenError('Feature not enabled');
        }
    }

    async getAllowedDomains(user: SessionUser): Promise<AllowedDomain[]> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        await this.checkFeatureEnabled(user);

        const org = await this.organizationModel.get(organizationUuid);
        return this.organizationAllowedDomainsModel.getAllByOrganizationId(
            org.organizationId,
        );
    }

    async addAllowedDomain(
        user: SessionUser,
        body: CreateAllowedDomain,
    ): Promise<AllowedDomain> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        await this.checkFeatureEnabled(user);

        const validatedDomain = validateDomain(body.domain);

        const org = await this.organizationModel.get(organizationUuid);

        // Check for duplicates (DB constraint will also catch this, but nicer error)
        const existing =
            await this.organizationAllowedDomainsModel.getAllByOrganizationId(
                org.organizationId,
            );
        if (existing.some((d) => d.domain === validatedDomain)) {
            throw new ConflictError(
                `Domain ${validatedDomain} is already in the allowed list`,
            );
        }

        return this.organizationAllowedDomainsModel.create({
            organization_id: org.organizationId,
            domain: validatedDomain,
            type: body.type,
            created_by_user_uuid: user.userUuid,
        });
    }

    async deleteAllowedDomain(
        user: SessionUser,
        domainUuid: string,
    ): Promise<void> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        await this.checkFeatureEnabled(user);

        const org = await this.organizationModel.get(organizationUuid);
        await this.organizationAllowedDomainsModel.delete(
            org.organizationId,
            domainUuid,
        );
    }

    /**
     * Returns all domains across all orgs. Used by CORS/CSP middleware
     * which fires before auth (no org context available).
     */
    async getAllDomainsForMiddleware(): Promise<AllowedDomain[]> {
        return this.organizationAllowedDomainsModel.getAllDomains();
    }
}
```

- [ ] **Step 2: Register in ServiceRepository**

In `packages/backend/src/services/ServiceRepository.ts`:

1. Add to `ServiceManifest` interface (in the `unknown` EE section around line 122-133):
```typescript
organizationAllowedDomainsService: unknown;
```

2. Add a getter method (near the other EE getters around line 1123-1144):
```typescript
public getOrganizationAllowedDomainsService<
    OrganizationAllowedDomainsServiceImplT,
>(): OrganizationAllowedDomainsServiceImplT {
    return this.getService('organizationAllowedDomainsService');
}
```

- [ ] **Step 3: Register in ee/index.ts serviceProviders**

In `packages/backend/src/ee/index.ts`, add to the `serviceProviders` object:

Import at top:
```typescript
import { OrganizationAllowedDomainsService } from './services/OrganizationAllowedDomainsService';
```

In `serviceProviders` (e.g. after `organizationWarehouseCredentialsService` around line 203-209):
```typescript
organizationAllowedDomainsService: ({ models, context }) =>
    new OrganizationAllowedDomainsService({
        organizationAllowedDomainsModel:
            models.getOrganizationAllowedDomainsModel(),
        organizationModel: models.getOrganizationModel(),
        commercialFeatureFlagModel:
            models.getFeatureFlagModel() as CommercialFeatureFlagModel,
    }),
```

- [ ] **Step 4: Verify backend typechecks**

Run: `pnpm -F backend typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/ee/services/OrganizationAllowedDomainsService.ts packages/backend/src/services/ServiceRepository.ts packages/backend/src/ee/index.ts
git commit -m "feat: add OrganizationAllowedDomainsService"
```

---

### Task 5: EE Controller

**Files:**
- Create: `packages/backend/src/ee/controllers/organizationAllowedDomainsController.ts`

- [ ] **Step 1: Create the controller**

Create `packages/backend/src/ee/controllers/organizationAllowedDomainsController.ts`:

```typescript
import {
    ApiOrganizationAllowedDomainResponse,
    ApiOrganizationAllowedDomainsResponse,
    type ApiErrorPayload,
    type CreateAllowedDomain,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { assertSessionAuth } from '../../middlewares/assertSessionAuth';
import { OrganizationAllowedDomainsService } from '../services/OrganizationAllowedDomainsService';

@Route('/api/v1/org/allowedDomains')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Organizations')
export class OrganizationAllowedDomainsController extends BaseController {
    /**
     * List allowed domains for the current organization
     * @summary List allowed domains
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listOrganizationAllowedDomains')
    async listAllowedDomains(
        @Request() req: express.Request,
    ): Promise<ApiOrganizationAllowedDomainsResponse> {
        this.setStatus(200);
        assertSessionAuth(req.account);
        const service =
            this.services.getOrganizationAllowedDomainsService<OrganizationAllowedDomainsService>();
        return {
            status: 'ok',
            results: await service.getAllowedDomains(req.user!),
        };
    }

    /**
     * Add a new allowed domain for the current organization
     * @summary Add allowed domain
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('addOrganizationAllowedDomain')
    async addAllowedDomain(
        @Request() req: express.Request,
        @Body() body: CreateAllowedDomain,
    ): Promise<ApiOrganizationAllowedDomainResponse> {
        this.setStatus(201);
        assertSessionAuth(req.account);
        const service =
            this.services.getOrganizationAllowedDomainsService<OrganizationAllowedDomainsService>();
        return {
            status: 'ok',
            results: await service.addAllowedDomain(req.user!, body),
        };
    }

    /**
     * Remove an allowed domain from the current organization
     * @summary Delete allowed domain
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('204', 'Deleted')
    @Delete('/{domainUuid}')
    @OperationId('deleteOrganizationAllowedDomain')
    async deleteAllowedDomain(
        @Request() req: express.Request,
        @Path() domainUuid: string,
    ): Promise<void> {
        this.setStatus(204);
        assertSessionAuth(req.account);
        const service =
            this.services.getOrganizationAllowedDomainsService<OrganizationAllowedDomainsService>();
        await service.deleteAllowedDomain(req.user!, domainUuid);
    }
}
```

- [ ] **Step 2: Generate API routes**

Run: `pnpm generate-api`
Expected: Routes regenerated including the new controller

- [ ] **Step 3: Verify backend typechecks**

Run: `pnpm -F backend typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/ee/controllers/organizationAllowedDomainsController.ts packages/backend/src/generated/
git commit -m "feat: add organization allowed domains API endpoints"
```

---

### Task 6: Dynamic CORS + CSP Middleware

**Files:**
- Modify: `packages/backend/src/App.ts`

This is the backwards-compatibility glue. The CORS middleware and Helmet CSP config need to merge env var domains with DB domains at runtime.

- [ ] **Step 1: Add domain cache and helper to App class**

In `packages/backend/src/App.ts`, add a private field to the `App` class (around line 180):

```typescript
private allowedDomainsCache: {
    domains: AllowedDomain[];
    lastFetched: number;
} | null = null;

private static readonly DOMAIN_CACHE_TTL_MS = 60_000; // 60 seconds
```

Add the import at the top of the file:
```typescript
import { AllowedDomain } from '@lightdash/common';
import { OrganizationAllowedDomainsModel } from './ee/models/OrganizationAllowedDomainsModel';
```

Add a private method to load cached domains:

```typescript
private async getCachedAllowedDomains(): Promise<AllowedDomain[]> {
    const now = Date.now();
    if (
        this.allowedDomainsCache &&
        now - this.allowedDomainsCache.lastFetched < App.DOMAIN_CACHE_TTL_MS
    ) {
        return this.allowedDomainsCache.domains;
    }

    try {
        const model = this.models.getOrganizationAllowedDomainsModel<OrganizationAllowedDomainsModel>();
        const domains = await model.getAllDomains();
        this.allowedDomainsCache = { domains, lastFetched: now };
        return domains;
    } catch {
        // If the model is not available (non-EE), return empty
        return this.allowedDomainsCache?.domains ?? [];
    }
}
```

- [ ] **Step 2: Make CORS middleware dynamic**

Replace the existing CORS block in `initExpress` (lines 321-351) with a dynamic origin callback:

```typescript
// Cross-Origin Resource Sharing policy (CORS)
// WARNING: this middleware should be mounted before the helmet middleware
// (ideally at the top of the middleware stack)
const corsConfig = this.lightdashConfig.security.crossOriginResourceSharingPolicy;
if (corsConfig.enabled) {
    const staticOrigins: Array<string | RegExp> = [
        this.lightdashConfig.siteUrl,
    ];

    for (const allowedDomain of corsConfig.allowedDomains) {
        if (
            allowedDomain.startsWith('/') &&
            allowedDomain.endsWith('/')
        ) {
            staticOrigins.push(new RegExp(allowedDomain.slice(1, -1)));
        } else {
            staticOrigins.push(allowedDomain);
        }
    }

    expressApp.use(
        cors({
            methods: 'OPTIONS, GET, HEAD, PUT, PATCH, POST, DELETE',
            allowedHeaders: '*',
            credentials: false,
            origin: async (
                origin: string | undefined,
                callback: (err: Error | null, allow?: boolean) => void,
            ) => {
                if (!origin) {
                    callback(null, true);
                    return;
                }

                // Check static origins (env var)
                for (const allowed of staticOrigins) {
                    if (typeof allowed === 'string' && allowed === origin) {
                        callback(null, true);
                        return;
                    }
                    if (allowed instanceof RegExp && allowed.test(origin)) {
                        callback(null, true);
                        return;
                    }
                }

                // Check DB domains
                try {
                    const dbDomains = await this.getCachedAllowedDomains();
                    for (const dbDomain of dbDomains) {
                        if (dbDomain.domain === origin) {
                            callback(null, true);
                            return;
                        }
                        // Wildcard subdomain matching: *.example.com
                        if (dbDomain.domain.startsWith('*.')) {
                            const suffix = dbDomain.domain.slice(1); // .example.com
                            if (origin.includes('://') ) {
                                const originHost = new URL(origin).hostname;
                                if (originHost.endsWith(suffix.slice(1)) && originHost !== suffix.slice(1)) {
                                    callback(null, true);
                                    return;
                                }
                            }
                        }
                    }
                } catch {
                    // On DB error, fall through to deny
                }

                callback(null, false);
            },
        }),
    );
}
```

- [ ] **Step 3: Make CSP frame-ancestors dynamic**

Replace the static Helmet setup (lines 422-486) to use a per-request middleware for `frame-ancestors`. Before the existing `expressApp.use(helmet(helmetConfig))` line, add the dynamic CSP override:

After the main `expressApp.use(helmet(helmetConfig))` at line 486, add middleware that overrides `frame-ancestors` with DB domains:

```typescript
// Dynamic frame-ancestors from DB (supplements env var config)
expressApp.use(async (req, res, next) => {
    try {
        const dbDomains = await this.getCachedAllowedDomains();
        const embedDomains = dbDomains
            .filter((d) => d.type === 'embed')
            .map((d) => d.domain);

        if (embedDomains.length > 0) {
            // Get existing CSP header and append DB domains to frame-ancestors
            const existingCsp = res.getHeader('Content-Security-Policy');
            if (typeof existingCsp === 'string') {
                const updatedCsp = existingCsp.replace(
                    /frame-ancestors\s+([^;]+)/,
                    (match, existing) =>
                        `frame-ancestors ${existing} ${embedDomains.join(' ')}`,
                );
                res.setHeader('Content-Security-Policy', updatedCsp);
            }
        }
    } catch {
        // On error, keep the static CSP — don't break the response
    }
    next();
});
```

**Important:** Place this middleware AFTER `expressApp.use(helmet(helmetConfig))` and BEFORE `expressApp.use('/embed/*', helmet(helmetConfigForEmbeds))`.

- [ ] **Step 4: Verify backend typechecks**

Run: `pnpm -F backend typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/App.ts
git commit -m "feat: make CORS and CSP dynamic with DB-stored allowed domains"
```

---

### Task 7: Frontend Hooks

**Files:**
- Create: `packages/frontend/src/ee/features/embed/SettingsAllowedDomains/useOrganizationAllowedDomains.ts`

- [ ] **Step 1: Create the hooks file**

Create `packages/frontend/src/ee/features/embed/SettingsAllowedDomains/useOrganizationAllowedDomains.ts`:

```typescript
import {
    type AllowedDomain,
    type ApiError,
    type CreateAllowedDomain,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import { useToaster } from '../../../../hooks/toaster/useToaster';

const getAllowedDomains = async () =>
    lightdashApi<AllowedDomain[]>({
        url: `/org/allowedDomains`,
        method: 'GET',
        body: undefined,
    });

const addAllowedDomain = async (body: CreateAllowedDomain) =>
    lightdashApi<AllowedDomain>({
        url: `/org/allowedDomains`,
        method: 'POST',
        body: JSON.stringify(body),
    });

const deleteAllowedDomain = async (domainUuid: string) =>
    lightdashApi<undefined>({
        url: `/org/allowedDomains/${domainUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useOrganizationAllowedDomains = () =>
    useQuery<AllowedDomain[], ApiError>({
        queryKey: ['organization_allowed_domains'],
        queryFn: getAllowedDomains,
    });

export const useAddOrganizationAllowedDomain = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<AllowedDomain, ApiError, CreateAllowedDomain>(
        addAllowedDomain,
        {
            mutationKey: ['organization_allowed_domains_add'],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'organization_allowed_domains',
                ]);
                showToastSuccess({
                    title: 'Domain added successfully',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to add domain',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteOrganizationAllowedDomain = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<undefined, ApiError, string>(deleteAllowedDomain, {
        mutationKey: ['organization_allowed_domains_delete'],
        onSuccess: async () => {
            await queryClient.invalidateQueries([
                'organization_allowed_domains',
            ]);
            showToastSuccess({
                title: 'Domain removed',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove domain',
                apiError: error,
            });
        },
    });
};
```

- [ ] **Step 2: Verify frontend typechecks**

Run: `pnpm -F frontend typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/ee/features/embed/SettingsAllowedDomains/useOrganizationAllowedDomains.ts
git commit -m "feat: add frontend hooks for organization allowed domains"
```

---

### Task 8: Frontend Settings Panel

**Files:**
- Create: `packages/frontend/src/ee/features/embed/SettingsAllowedDomains/index.tsx`

- [ ] **Step 1: Create the settings panel component**

Create `packages/frontend/src/ee/features/embed/SettingsAllowedDomains/index.tsx`:

```tsx
import { type AllowedDomainType } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import {
    useAddOrganizationAllowedDomain,
    useDeleteOrganizationAllowedDomain,
    useOrganizationAllowedDomains,
} from './useOrganizationAllowedDomains';

const DOMAIN_TYPE_OPTIONS = [
    {
        value: 'embed',
        label: 'Iframe embed',
        description: 'Can embed Lightdash in an iframe from this domain',
    },
    {
        value: 'sdk',
        label: 'SDK access',
        description: 'Can make API requests from this domain',
    },
];

const AllowedDomainsPanel: FC = () => {
    const { data: domains, isLoading } = useOrganizationAllowedDomains();
    const addMutation = useAddOrganizationAllowedDomain();
    const deleteMutation = useDeleteOrganizationAllowedDomain();

    const form = useForm({
        initialValues: {
            domain: '',
            type: 'embed' as AllowedDomainType,
        },
        validate: {
            domain: (value) => {
                if (!value.trim()) return 'Domain is required';
                // Basic client-side validation; server does full validation
                if (
                    !value.startsWith('https://') &&
                    !value.startsWith('http://localhost') &&
                    !value.startsWith('*.')
                ) {
                    return 'Must start with https://, http://localhost, or *.';
                }
                return null;
            },
        },
    });

    const handleSubmit = form.onSubmit(async (values) => {
        await addMutation.mutateAsync({
            domain: values.domain.trim(),
            type: values.type,
        });
        form.reset();
    });

    if (isLoading) {
        return <Loader size="sm" />;
    }

    return (
        <Stack gap="md">
            {domains && domains.length > 0 ? (
                <Stack gap="xs">
                    {domains.map((domain) => (
                        <Group
                            key={domain.organizationAllowedDomainUuid}
                            justify="space-between"
                            wrap="nowrap"
                        >
                            <Group gap="sm" wrap="nowrap">
                                <Text size="sm" fw={500} truncate>
                                    {domain.domain}
                                </Text>
                                <Badge
                                    size="sm"
                                    variant="light"
                                    color={
                                        domain.type === 'embed'
                                            ? 'blue'
                                            : 'teal'
                                    }
                                >
                                    {domain.type === 'embed'
                                        ? 'Iframe embed'
                                        : 'SDK access'}
                                </Badge>
                            </Group>
                            <Tooltip label="Remove domain" position="left">
                                <ActionIcon
                                    variant="subtle"
                                    color="red"
                                    size="sm"
                                    loading={deleteMutation.isLoading}
                                    onClick={() =>
                                        deleteMutation.mutate(
                                            domain.organizationAllowedDomainUuid,
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconTrash} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    ))}
                </Stack>
            ) : (
                <Text size="sm" c="dimmed">
                    No custom domains configured. Domains from server
                    environment variables are always allowed.
                </Text>
            )}

            <form onSubmit={handleSubmit}>
                <Group gap="xs" align="flex-start" wrap="nowrap">
                    <TextInput
                        placeholder="https://app.example.com"
                        style={{ flex: 1 }}
                        {...form.getInputProps('domain')}
                    />
                    <Select
                        data={DOMAIN_TYPE_OPTIONS}
                        w={160}
                        {...form.getInputProps('type')}
                    />
                    <Button
                        type="submit"
                        loading={addMutation.isLoading}
                        leftSection={<MantineIcon icon={IconPlus} />}
                    >
                        Add
                    </Button>
                </Group>
            </form>
        </Stack>
    );
};

export default AllowedDomainsPanel;
```

- [ ] **Step 2: Verify frontend typechecks**

Run: `pnpm -F frontend typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/ee/features/embed/SettingsAllowedDomains/index.tsx
git commit -m "feat: add AllowedDomainsPanel settings component"
```

---

### Task 9: Wire Up Settings Route

**Files:**
- Modify: `packages/frontend/src/pages/Settings.tsx`

- [ ] **Step 1: Add import**

Add at the top of `packages/frontend/src/pages/Settings.tsx`, near the other lazy/dynamic imports:

```typescript
import AllowedEmbedDomainsPanel from '../ee/features/embed/SettingsAllowedDomains';
```

Note: Do NOT confuse this with the existing `AllowedDomainsPanel` (email domains) — this is for embed/SDK domains.

- [ ] **Step 2: Add route definition**

In the route-building section of Settings.tsx, find where embedding-related routes are conditionally pushed (search for `embeddingEnabled?.enabled`). Add a new org-level route near the other org routes (around lines 385-420 where `allowedRoutes.push` is used for org settings):

```typescript
if (
    user?.ability.can('manage', 'Organization') &&
    embeddingEnabled?.enabled
) {
    allowedRoutes.push({
        path: '/allowedEmbedDomains',
        element: (
            <SettingsGridCard>
                <div>
                    <Title order={4}>Allowed Domains</Title>
                    <Text c="ldGray.6" fz="xs">
                        Manage which external domains can access your
                        Lightdash instance via the SDK or iframe
                        embedding. Domains configured via server
                        environment variables are always allowed.
                    </Text>
                </div>
                <AllowedEmbedDomainsPanel />
            </SettingsGridCard>
        ),
    });
}
```

- [ ] **Step 3: Add nav link**

In the navigation section, find the "Organization settings" nav links (around lines 645-680). Add the nav link after the existing org settings links, gated by the same conditions:

```typescript
{user.ability.can('manage', 'Organization') &&
    embeddingEnabled?.enabled && (
        <RouterNavLink
            label="Allowed domains"
            exact
            to="/generalSettings/allowedEmbedDomains"
            leftSection={
                <MantineIcon icon={IconWorld} />
            }
        />
    )}
```

Add the `IconWorld` import at the top with the other Tabler icon imports:
```typescript
import { IconWorld } from '@tabler/icons-react';
```

- [ ] **Step 4: Verify frontend typechecks**

Run: `pnpm -F frontend typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/pages/Settings.tsx
git commit -m "feat: add Allowed Domains route to organization settings"
```

---

### Task 10: Lint + Final Typecheck

**Files:** None (validation only)

- [ ] **Step 1: Run lint on all changed packages**

```bash
pnpm -F common lint
pnpm -F backend lint
pnpm -F frontend lint
```

Fix any lint errors that come up.

- [ ] **Step 2: Run full typecheck**

```bash
pnpm -F common typecheck
pnpm -F backend typecheck
pnpm -F frontend typecheck
```

Fix any type errors.

- [ ] **Step 3: Run backend tests**

```bash
pnpm -F backend test:dev:nowatch
```

Expected: All existing tests pass, no regressions.

- [ ] **Step 4: Run common tests**

```bash
pnpm -F common test
```

Expected: All tests pass.

- [ ] **Step 5: Commit any lint/type fixes**

```bash
git add -u
git commit -m "fix: lint and type fixes for allowed domains feature"
```

---

### Task 11: Manual Testing

- [ ] **Step 1: Open the Settings page in the browser**

Navigate to `/generalSettings/allowedEmbedDomains`. Verify:
- The "Allowed Domains" nav link appears (only if embedding feature flag is enabled)
- The panel loads with empty state message

- [ ] **Step 2: Add a domain**

- Type `https://test.example.com` and select "Iframe embed", click Add
- Verify it appears in the list with the "Iframe embed" badge
- Verify a success toast appears

- [ ] **Step 3: Add a wildcard domain**

- Type `*.staging.example.com` and select "SDK access", click Add
- Verify it appears in the list with the "SDK access" badge

- [ ] **Step 4: Test validation**

- Try adding `http://not-localhost.com` — should show error
- Try adding the same domain again — should show conflict error
- Try adding just `*` — should show error

- [ ] **Step 5: Delete a domain**

- Click the trash icon on a domain
- Verify it disappears and a success toast appears

- [ ] **Step 6: Verify CORS works**

From a browser console on an allowed domain (or using curl with Origin header):

```bash
curl -H "Origin: https://test.example.com" -I http://localhost:8080/api/v1/health
```

Verify the `Access-Control-Allow-Origin` header is present in the response.
