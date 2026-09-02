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
    DATA_APP_TEMPLATE_GUARDRAILS_PATH,
    DATA_APP_TEMPLATE_MANIFEST_PATH,
    DataAppTemplatePackageError,
    ForbiddenError,
    MAX_DATA_APP_TEMPLATE_FILE_BYTES,
    MAX_DATA_APP_TEMPLATE_FILES,
    MAX_DATA_APP_TEMPLATE_PACKAGE_BYTES,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    parseDataAppTemplateManifest,
    validateDataAppTemplateEntryPath,
    type Account,
    type DataAppTemplateImportResult,
    type DataAppTemplateSummary,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { extract as tarExtract } from 'tar-stream';
import { v4 as uuidv4 } from 'uuid';
import { resolveS3Credentials } from '../../../clients/Aws/S3BaseClient';
import { type LightdashConfig } from '../../../config/parseConfig';
import { BaseService } from '../../../services/BaseService';
import { type DataAppTemplateModel } from '../../models/DataAppTemplateModel';
import { readS3ObjectAsBuffer } from '../AppGenerateService/s3Utils';

type DataAppTemplateServiceArguments = {
    lightdashConfig: LightdashConfig;
    dataAppTemplateModel: DataAppTemplateModel;
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

    constructor({
        lightdashConfig,
        dataAppTemplateModel,
    }: DataAppTemplateServiceArguments) {
        super({ serviceName: 'DataAppTemplateService' });
        this.lightdashConfig = lightdashConfig;
        this.dataAppTemplateModel = dataAppTemplateModel;
    }

    private assertCanManage(account: Account): {
        organizationUuid: string;
        userUuid: string;
    } {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        // Permission placeholder (flagged for review): templates are org
        // content packages with the same audience as themes-as-code, so they
        // borrow the OrganizationDesign subject. A dedicated DataAppTemplate
        // subject needs matching scopes + role-parity entries — follow-up.
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('OrganizationDesign', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to manage data app templates',
            );
        }
        return { organizationUuid, userUuid: account.user.userUuid };
    }

    private assertCanView(account: Account): { organizationUuid: string } {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'view',
                subject('OrganizationDesign', { organizationUuid }),
            )
        ) {
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
        const { organizationUuid, userUuid } = this.assertCanManage(account);
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
        files.sort((a, b) => a.filename.localeCompare(b.filename));

        const manifestFile = files.find(
            (file) => file.filename === DATA_APP_TEMPLATE_MANIFEST_PATH,
        );
        if (!manifestFile) {
            throw new ParameterError(
                `Template package must contain ${DATA_APP_TEMPLATE_MANIFEST_PATH}`,
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
        const { organizationUuid } = this.assertCanView(account);
        return this.dataAppTemplateModel.listByOrganization(organizationUuid);
    }

    async get(account: Account, slug: string): Promise<DataAppTemplateSummary> {
        const { organizationUuid } = this.assertCanView(account);
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
        const { organizationUuid } = this.assertCanManage(account);
        const template = await this.dataAppTemplateModel.findBySlug(
            organizationUuid,
            slug,
        );
        if (!template) {
            throw new NotFoundError(`Data app template "${slug}" not found`);
        }
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
