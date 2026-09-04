import {
    DeleteObjectsCommand,
    PutObjectCommand,
    S3Client,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    buildDataAppTemplateManifest,
    DATA_APP_TEMPLATE_GUARDRAILS_PATH,
    DATA_APP_TEMPLATE_MANIFEST_PATH,
    DataAppTemplatePackageError,
    FeatureFlags,
    ForbiddenError,
    getDataAppTemplateKind,
    MAX_DATA_APP_TEMPLATE_FILE_BYTES,
    MAX_DATA_APP_TEMPLATE_FILES,
    MAX_DATA_APP_TEMPLATE_GUARDRAILS_CHARS,
    MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES,
    MAX_DATA_APP_TEMPLATES_PER_ORG,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    parseDataAppTemplateManifest,
    validateDataAppTemplateEntryPath,
    type Account,
    type DataAppCodeFile,
    type DataAppTemplateImportResult,
    type DataAppTemplateSummary,
    type SaveAppAsTemplateRequest,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { extract as tarExtract } from 'tar-stream';
import { v4 as uuidv4 } from 'uuid';
import { resolveS3Credentials } from '../../../clients/Aws/S3BaseClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../../services/BaseService';
import { type DataAppTemplateModel } from '../../models/DataAppTemplateModel';
import { readS3ObjectAsBuffer } from '../AppGenerateService/s3Utils';

type DataAppTemplateServiceArguments = {
    lightdashConfig: LightdashConfig;
    dataAppTemplateModel: DataAppTemplateModel;
    featureFlagModel: FeatureFlagModel;
};

export type DataAppTemplateSourceFile = {
    filename: string;
    contents: string;
};

const templateS3Prefix = (organizationUuid: string, templateUuid: string) =>
    `data-app-templates/${organizationUuid}/${templateUuid}/`;

const templateS3Key = (
    organizationUuid: string,
    templateUuid: string,
    filename: string,
) => `${templateS3Prefix(organizationUuid, templateUuid)}${filename}`;

const bufferReadableWithLimit = async (
    readable: Readable,
    maxBytes: number,
): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of readable) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBytes) {
            throw new ParameterError(
                `Template package must be at most ${maxBytes} bytes`,
            );
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
};

type PackageFile = { filename: string; body: Buffer };

/**
 * Unpacks a template package: only authored files (src/**, AGENTS.md) are
 * accepted, sizes and counts are capped, and the manifest must be present.
 */
export const parseDataAppTemplatePackage = (
    archive: Buffer,
): Promise<PackageFile[]> =>
    new Promise((resolve, reject) => {
        const files: PackageFile[] = [];
        const seen = new Set<string>();
        const extractor = tarExtract();
        extractor.on('entry', (header, stream, next) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => {
                try {
                    if (header.type === 'file') {
                        const filename = validateDataAppTemplateEntryPath(
                            header.name,
                        );
                        if (seen.has(filename)) {
                            throw new DataAppTemplatePackageError(
                                `Template package names ${filename} twice`,
                            );
                        }
                        seen.add(filename);
                        const body = Buffer.concat(chunks);
                        if (body.length > MAX_DATA_APP_TEMPLATE_FILE_BYTES) {
                            throw new DataAppTemplatePackageError(
                                `${filename} exceeds ${MAX_DATA_APP_TEMPLATE_FILE_BYTES} bytes`,
                            );
                        }
                        files.push({ filename, body });
                        if (files.length > MAX_DATA_APP_TEMPLATE_FILES) {
                            throw new DataAppTemplatePackageError(
                                `Template package has more than ${MAX_DATA_APP_TEMPLATE_FILES} files`,
                            );
                        }
                    }
                    next();
                } catch (e) {
                    reject(e);
                }
            });
            stream.resume();
        });
        extractor.on('error', reject);
        extractor.on('finish', () => resolve(files));
        extractor.end(archive);
    });

export class DataAppTemplateService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly dataAppTemplateModel: DataAppTemplateModel;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor({
        lightdashConfig,
        dataAppTemplateModel,
        featureFlagModel,
    }: DataAppTemplateServiceArguments) {
        super({ serviceName: 'DataAppTemplateService' });
        this.lightdashConfig = lightdashConfig;
        this.dataAppTemplateModel = dataAppTemplateModel;
        this.featureFlagModel = featureFlagModel;
    }

    /**
     * The UI is flag-gated; the API must be too, or packages could be
     * stored for orgs the feature is not rolled out to.
     */
    private async assertTemplatesEnabled(account: Account): Promise<void> {
        assertRegisteredAccount(account);
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.EnableDataAppTemplates,
        });
        if (!enabled) {
            throw new ForbiddenError('Data app templates are not enabled');
        }
    }

    private accountContext(account: Account): {
        organizationUuid: string;
        userUuid: string;
    } {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        return {
            organizationUuid: account.organization.organizationUuid,
            userUuid: account.user.userUuid,
        };
    }

    /** create:DataAppTemplate — publishing a template the org does not have yet. */
    private assertCanCreate(account: Account, organizationUuid: string) {
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'create',
                subject('DataAppTemplate', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to publish data app templates',
            );
        }
    }

    /**
     * manage:DataAppTemplate(@self) — replacing or deleting an existing
     * template. The subject carries the uploader so the @self rule can
     * match; the org-wide rule ignores it.
     */
    private assertCanManageTemplate(
        account: Account,
        template: DataAppTemplateSummary,
    ) {
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('DataAppTemplate', {
                    organizationUuid: template.organizationUuid,
                    createdByUserUuid: template.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                `Insufficient permissions to change data app template "${template.slug}"`,
            );
        }
    }

    /**
     * Browsing is part of building from a template
     * (create:DataAppFromTemplate); template authors and curators can
     * browse too, so they can see what they published.
     */
    private assertCanBrowse(account: Account): { organizationUuid: string } {
        const { organizationUuid } = this.accountContext(account);
        const ability = this.createAuditedAbility(account);
        const canBrowse =
            ability.can(
                'create',
                subject('DataAppFromTemplate', { organizationUuid }),
            ) ||
            ability.can(
                'create',
                subject('DataAppTemplate', { organizationUuid }),
            ) ||
            ability.can(
                'manage',
                subject('DataAppTemplate', { organizationUuid }),
            );
        if (!canBrowse) {
            throw new ForbiddenError(
                'Insufficient permissions to view data app templates',
            );
        }
        return { organizationUuid };
    }

    /**
     * Mirrors OrganizationDesignService.getS3Client — templates live in the
     * same app-runtime bucket data apps use, under their own prefix, so
     * self-hosted instances need no extra configuration.
     */
    private getS3Client(): { client: S3Client; bucket: string } {
        const s3Config = this.lightdashConfig.appRuntime.s3;
        if (!s3Config) {
            throw new MissingConfigError(
                'S3 is not configured for app runtime',
            );
        }
        const config: S3ClientConfig = {
            region: s3Config.region,
            endpoint: s3Config.endpoint || undefined,
            forcePathStyle: s3Config.forcePathStyle ?? false,
        };
        const credentials = resolveS3Credentials(s3Config);
        if (credentials) {
            config.credentials = credentials;
        }
        return { client: new S3Client(config), bucket: s3Config.bucket };
    }

    async importPackage(
        account: Account,
        input: { body: Readable; contentLength: number },
    ): Promise<DataAppTemplateImportResult> {
        this.accountContext(account);
        await this.assertTemplatesEnabled(account);
        if (
            input.contentLength <= 0 ||
            input.contentLength > MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES
        ) {
            throw new ParameterError(
                `Template package must be between 1 and ${MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES} bytes`,
            );
        }
        const archive = await bufferReadableWithLimit(
            input.body,
            MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES,
        );
        if (archive.length === 0) {
            throw new ParameterError('Template package body is empty');
        }

        let files: PackageFile[];
        try {
            files = await parseDataAppTemplatePackage(archive);
        } catch (e) {
            if (e instanceof DataAppTemplatePackageError) {
                throw new ParameterError(e.message);
            }
            throw e;
        }
        return this.importFiles(account, files);
    }

    /**
     * Save-as-template from the UI: the app's current source (as returned
     * by the app code read) becomes the package. Only the src tree travels;
     * an existing manifest keeps its bindings while the request owns the
     * identity block and questions; guardrails become AGENTS.md.
     */
    async importFromApp(
        account: Account,
        request: SaveAppAsTemplateRequest,
        appFiles: DataAppCodeFile[],
    ): Promise<DataAppTemplateImportResult> {
        const guardrails = request.guardrails?.trim() ?? '';
        if (guardrails.length > MAX_DATA_APP_TEMPLATE_GUARDRAILS_CHARS) {
            throw new ParameterError(
                `Guardrails must be at most ${MAX_DATA_APP_TEMPLATE_GUARDRAILS_CHARS} characters`,
            );
        }
        // Scaffold, config and dependency files never belong in a package;
        // the server rebuilds against its own template. Only the src tree
        // travels, and an existing manifest is merged rather than copied.
        const sourceFiles = appFiles
            .map((file) => ({
                filename: file.path.replace(/^\.\//, ''),
                body: Buffer.from(file.contentBase64, 'base64'),
            }))
            .filter((file) => file.filename.startsWith('src/'));
        const existingManifest = sourceFiles
            .find((file) => file.filename === DATA_APP_TEMPLATE_MANIFEST_PATH)
            ?.body.toString('utf-8');
        const files: PackageFile[] = sourceFiles.filter(
            (file) => file.filename !== DATA_APP_TEMPLATE_MANIFEST_PATH,
        );
        if (files.length === 0) {
            throw new ParameterError(
                'The app has no source files to save as a template',
            );
        }
        let manifest: string;
        try {
            manifest = buildDataAppTemplateManifest({
                existing: existingManifest,
                template: request.template,
                questions: request.questions ?? [],
            });
        } catch (e) {
            if (e instanceof DataAppTemplatePackageError) {
                throw new ParameterError(e.message);
            }
            throw e;
        }
        files.push({
            filename: DATA_APP_TEMPLATE_MANIFEST_PATH,
            body: Buffer.from(manifest, 'utf-8'),
        });
        if (guardrails.length > 0) {
            files.push({
                filename: DATA_APP_TEMPLATE_GUARDRAILS_PATH,
                body: Buffer.from(`${guardrails}\n`, 'utf-8'),
            });
        }
        return this.importFiles(account, files);
    }

    /**
     * Shared publish path for a set of validated package files: manifest
     * parse, permissions, caps, storage writes, record upsert.
     */
    private async importFiles(
        account: Account,
        input: PackageFile[],
    ): Promise<DataAppTemplateImportResult> {
        const { organizationUuid, userUuid } = this.accountContext(account);
        await this.assertTemplatesEnabled(account);
        let files: PackageFile[];
        try {
            files = input
                .map((file) => ({
                    filename: validateDataAppTemplateEntryPath(file.filename),
                    body: file.body,
                }))
                .sort((a, b) => a.filename.localeCompare(b.filename));
        } catch (e) {
            if (e instanceof DataAppTemplatePackageError) {
                throw new ParameterError(e.message);
            }
            throw e;
        }
        if (files.length > MAX_DATA_APP_TEMPLATE_FILES) {
            throw new ParameterError(
                `Template package has more than ${MAX_DATA_APP_TEMPLATE_FILES} files`,
            );
        }
        const oversized = files.find(
            (file) => file.body.length > MAX_DATA_APP_TEMPLATE_FILE_BYTES,
        );
        if (oversized) {
            throw new ParameterError(
                `${oversized.filename} exceeds ${MAX_DATA_APP_TEMPLATE_FILE_BYTES} bytes`,
            );
        }

        const manifestFile = files.find(
            (file) => file.filename === DATA_APP_TEMPLATE_MANIFEST_PATH,
        );
        if (!manifestFile) {
            throw new ParameterError(
                `Template package must contain ${DATA_APP_TEMPLATE_MANIFEST_PATH}`,
            );
        }
        // An instructions-only template has nothing to build from without
        // AGENTS.md; a seeded one can omit it (the source is the template).
        // The file must carry text: a blank AGENTS.md would pass an
        // existence check and free-generate from a header-only prompt.
        const guardrailsFile = files.find(
            (file) => file.filename === DATA_APP_TEMPLATE_GUARDRAILS_PATH,
        );
        if (
            getDataAppTemplateKind(files.map((file) => file.filename)) ===
                'instructions' &&
            (guardrailsFile?.body.toString('utf-8').trim() ?? '').length === 0
        ) {
            throw new ParameterError(
                `A template without source files must include ${DATA_APP_TEMPLATE_GUARDRAILS_PATH} with the instructions to build from`,
            );
        }
        let manifest;
        try {
            manifest = parseDataAppTemplateManifest(
                manifestFile.body.toString('utf-8'),
            );
        } catch (e) {
            if (e instanceof DataAppTemplatePackageError) {
                throw new ParameterError(e.message);
            }
            throw e;
        }

        const existing = await this.dataAppTemplateModel.findBySlug(
            organizationUuid,
            manifest.template.id,
        );
        if (existing) {
            this.assertCanManageTemplate(account, existing);
        } else {
            this.assertCanCreate(account, organizationUuid);
            const count =
                await this.dataAppTemplateModel.countByOrganization(
                    organizationUuid,
                );
            if (count >= MAX_DATA_APP_TEMPLATES_PER_ORG) {
                throw new ParameterError(
                    `An organization can hold at most ${MAX_DATA_APP_TEMPLATES_PER_ORG} data app templates; delete one before publishing another`,
                );
            }
        }
        const templateUuid = existing?.templateUuid ?? uuidv4();
        const previousFiles = existing
            ? await this.dataAppTemplateModel.listFiles(existing.templateUuid)
            : [];

        // Write the bytes before swapping metadata, so a failure mid-upload
        // leaves the record pointing at its previous file list. Files that
        // share a name with the previous package are overwritten in place;
        // a versioned prefix would make re-uploads fully atomic (follow-up).
        const { client, bucket } = this.getS3Client();
        /* eslint-disable no-await-in-loop */
        for (const file of files) {
            await client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: templateS3Key(
                        organizationUuid,
                        templateUuid,
                        file.filename,
                    ),
                    Body: file.body,
                    ContentType: file.filename.endsWith('.json')
                        ? 'application/json'
                        : 'text/plain; charset=utf-8',
                }),
            );
        }
        /* eslint-enable no-await-in-loop */

        const { summary, created } = await this.dataAppTemplateModel.upsert(
            {
                organizationUuid,
                slug: manifest.template.id,
                name: manifest.template.name,
                description: manifest.template.description,
                category: manifest.template.category,
                questions: manifest.questions ?? [],
                files: files.map((file) => ({
                    filename: file.filename,
                    sizeBytes: file.body.length,
                })),
                createdByUserUuid: userUuid,
            },
            templateUuid,
        );

        // Drop objects the new package no longer contains.
        const keep = new Set(files.map((file) => file.filename));
        const stale = previousFiles.filter((file) => !keep.has(file.filename));
        if (stale.length > 0) {
            await client.send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: {
                        Objects: stale.map((file) => ({
                            Key: templateS3Key(
                                organizationUuid,
                                templateUuid,
                                file.filename,
                            ),
                        })),
                    },
                }),
            );
        }

        this.logger.info(
            `Data app template ${manifest.template.id} ${created ? 'created' : 'updated'} for organization ${organizationUuid} (${files.length} files)`,
        );
        return { ...summary, action: created ? 'created' : 'updated' };
    }

    async list(account: Account): Promise<DataAppTemplateSummary[]> {
        await this.assertTemplatesEnabled(account);
        const { organizationUuid } = this.assertCanBrowse(account);
        return this.dataAppTemplateModel.listByOrganization(organizationUuid);
    }

    async get(account: Account, slug: string): Promise<DataAppTemplateSummary> {
        await this.assertTemplatesEnabled(account);
        const { organizationUuid } = this.assertCanBrowse(account);
        const template = await this.dataAppTemplateModel.findBySlug(
            organizationUuid,
            slug,
        );
        if (!template) {
            throw new NotFoundError(`Data app template "${slug}" not found`);
        }
        return template;
    }

    async delete(account: Account, slug: string): Promise<void> {
        const { organizationUuid } = this.accountContext(account);
        await this.assertTemplatesEnabled(account);
        const template = await this.dataAppTemplateModel.findBySlug(
            organizationUuid,
            slug,
        );
        if (!template) {
            throw new NotFoundError(`Data app template "${slug}" not found`);
        }
        this.assertCanManageTemplate(account, template);
        const files = await this.dataAppTemplateModel.listFiles(
            template.templateUuid,
        );
        await this.dataAppTemplateModel.delete(organizationUuid, slug);
        if (files.length > 0) {
            const { client, bucket } = this.getS3Client();
            await client.send(
                new DeleteObjectsCommand({
                    Bucket: bucket,
                    Delete: {
                        Objects: files.map((file) => ({
                            Key: templateS3Key(
                                organizationUuid,
                                template.templateUuid,
                                file.filename,
                            ),
                        })),
                    },
                }),
            );
        }
    }

    /**
     * Account-less lookup for the generate path, which has already checked
     * the caller's create:DataAppFromTemplate grant.
     */
    async findForBuild(
        organizationUuid: string,
        slug: string,
    ): Promise<DataAppTemplateSummary | undefined> {
        return this.dataAppTemplateModel.findBySlug(organizationUuid, slug);
    }

    /**
     * The template's summary and AGENTS.md alone, for builds that do not
     * seed (iterations, instructions-only templates): one row lookup and at
     * most one storage read instead of the whole package. Undefined when the
     * template has been deleted, so the caller can degrade instead of
     * failing every later version of the apps built from it.
     */
    async getGuardrails(
        organizationUuid: string,
        slug: string,
    ): Promise<
        | { template: DataAppTemplateSummary; guardrails: string | null }
        | undefined
    > {
        const template = await this.dataAppTemplateModel.findBySlug(
            organizationUuid,
            slug,
        );
        if (!template) {
            return undefined;
        }
        const rows = await this.dataAppTemplateModel.listFiles(
            template.templateUuid,
        );
        if (
            !rows.some(
                (row) => row.filename === DATA_APP_TEMPLATE_GUARDRAILS_PATH,
            )
        ) {
            return { template, guardrails: null };
        }
        const { client, bucket } = this.getS3Client();
        const buffer = await readS3ObjectAsBuffer(
            client,
            bucket,
            templateS3Key(
                organizationUuid,
                template.templateUuid,
                DATA_APP_TEMPLATE_GUARDRAILS_PATH,
            ),
        );
        return { template, guardrails: buffer.toString('utf-8') };
    }

    /**
     * The template's authored files, ready to seed into a sandbox: the
     * storage-backed counterpart of the generated starter-source modules.
     */
    async getSourceFiles(
        organizationUuid: string,
        slug: string,
    ): Promise<{
        template: DataAppTemplateSummary;
        files: DataAppTemplateSourceFile[];
        guardrails: string | null;
    }> {
        const template = await this.dataAppTemplateModel.findBySlug(
            organizationUuid,
            slug,
        );
        if (!template) {
            throw new NotFoundError(`Data app template "${slug}" not found`);
        }
        const rows = await this.dataAppTemplateModel.listFiles(
            template.templateUuid,
        );
        const { client, bucket } = this.getS3Client();
        const files: DataAppTemplateSourceFile[] = [];
        /* eslint-disable no-await-in-loop */
        for (const row of rows) {
            const buffer = await readS3ObjectAsBuffer(
                client,
                bucket,
                templateS3Key(
                    organizationUuid,
                    template.templateUuid,
                    row.filename,
                ),
            );
            files.push({
                filename: row.filename,
                contents: buffer.toString('utf-8'),
            });
        }
        /* eslint-enable no-await-in-loop */
        const guardrails =
            files.find((f) => f.filename === DATA_APP_TEMPLATE_GUARDRAILS_PATH)
                ?.contents ?? null;
        return { template, files, guardrails };
    }
}
