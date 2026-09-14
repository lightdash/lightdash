import {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    NoSuchKey,
    NotFound,
    PutObjectCommand,
    S3Client,
    type GetObjectCommandOutput,
    type ObjectIdentifier,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    ApiOrganizationDesign,
    ApiOrganizationDesignFile,
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    checkThemeLimits,
    ForbiddenError,
    getOrganizationDesignFileExtension,
    getOrganizationDesignPackageContentType,
    getOrganizationDesignPackageFilePath,
    MAX_THEME_FILE_BYTES,
    MAX_THEME_PACKAGE_BYTES,
    MAX_THEME_TOTAL_BYTES,
    MissingConfigError,
    NotFoundError,
    ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
    ParameterError,
    PromotionAction,
    themeLimitMessage,
    validateOrganizationDesignFileContent,
    validateOrganizationDesignFileMetadata,
    type Account,
    type OrganizationDesignFileKind,
    type OrganizationDesignPackageImportResult,
    type OrganizationDesignPackageManifest,
    type UuidOrSlug,
} from '@lightdash/common';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Readable } from 'node:stream';
import { v4 as uuidv4 } from 'uuid';
import { resolveS3Credentials } from '../../clients/Aws/S3BaseClient';
import { LightdashConfig } from '../../config/parseConfig';
import {
    OrganizationDesignModel,
    type OrganizationDesignFileWrite,
} from '../../models/OrganizationDesignModel';
import { BaseService } from '../BaseService';
import {
    buildOrganizationDesignPackage,
    parseOrganizationDesignPackage,
    type OrganizationDesignPackageFile,
} from './OrganizationDesignPackage';
import {
    inspectAppleFont,
    restrictedAppleFontUploadMessage,
} from './restrictedAppleFonts';

type OrganizationDesignServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationDesignModel: OrganizationDesignModel;
};

/**
 * Sanitize-on-write for SVG uploads.
 *
 * SVG is XML rendered inline by browsers, so it can carry `<script>`,
 * `on*=` handlers, `<foreignObject>` payloads, and `xlink:href="javascript:..."`
 * — all live XSS vectors against any consumer that drops the file into
 * the DOM. Stage 2 copies design files straight into the data-app
 * sandbox source tree, but future consumers (embed branding, settings
 * previews, etc.) may render them in other origins. Sanitize once on
 * write so every downstream consumer gets a clean asset.
 *
 * The jsdom window is constructed lazily so this module imports cleanly
 * in any process that doesn't actually call the sanitizer (e.g. tests
 * for unrelated service methods).
 */
let svgPurifier: ReturnType<typeof createDOMPurify> | null = null;
const getSvgPurifier = (): ReturnType<typeof createDOMPurify> => {
    if (svgPurifier) return svgPurifier;
    const { window } = new JSDOM('');
    svgPurifier = createDOMPurify(window);
    return svgPurifier;
};

const sanitizeSvg = (svgText: string): string =>
    getSvgPurifier().sanitize(svgText, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });

const sanitizeOrganizationDesignFile = (
    body: Buffer,
    filename: string,
): Buffer => {
    if (getOrganizationDesignFileExtension(filename) !== '.svg') return body;
    const sanitizedBody = Buffer.from(
        sanitizeSvg(body.toString('utf8')),
        'utf8',
    );
    if (sanitizedBody.length === 0) {
        throw new ParameterError('SVG contains no safe content');
    }
    return sanitizedBody;
};

const validateOrganizationDesignFontPolicy = async ({
    body,
    filename,
    kind,
}: {
    body: Buffer;
    filename: string;
    kind: OrganizationDesignFileKind;
}): Promise<void> => {
    if (kind !== 'font') return;

    const inspection = await inspectAppleFont({ body, filename });
    if (inspection.status === 'restricted') {
        throw new ParameterError(
            restrictedAppleFontUploadMessage({
                filename,
                match: inspection.match,
            }),
        );
    }
};

export const getEffectiveOrganizationDesignFiles = (
    files: ApiOrganizationDesignFile[],
): Map<string, ApiOrganizationDesignFile> => {
    const effectiveFiles = new Map<string, ApiOrganizationDesignFile>();
    for (const file of files) {
        const packagePath = getOrganizationDesignPackageFilePath(
            file.kind,
            file.filename,
        );
        effectiveFiles.set(packagePath.toLowerCase(), file);
    }
    return effectiveFiles;
};

/**
 * Deterministic S3 key for a design file. The fileUuid prefix prevents
 * filename collisions across files in the same design and gives us a
 * stable handle for delete/replace flows.
 */
export const designS3Key = (
    organizationUuid: string,
    designUuid: string,
    fileUuid: string,
    filename: string,
): string =>
    `designs/${organizationUuid}/${designUuid}/${fileUuid}/${filename}`;

/**
 * Prefix that bounds all bytes for a single design — used for cascade
 * deletion on design.delete().
 */
const designS3Prefix = (organizationUuid: string, designUuid: string): string =>
    `designs/${organizationUuid}/${designUuid}/`;

// S3 DeleteObjects accepts at most 1000 keys per call. Themes are capped by
// total bytes, not file count, so a theme can legitimately exceed this.
const S3_DELETE_BATCH_SIZE = 1000;

const bufferReadableWithLimit = async (
    body: Readable,
    limit: number,
): Promise<Buffer> => {
    const chunks: Buffer[] = [];
    let total = 0;
    // eslint-disable-next-line no-restricted-syntax
    for await (const chunk of body) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > limit) {
            throw new ParameterError(`Request body exceeds ${limit} bytes`);
        }
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
};

export class OrganizationDesignService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationDesignModel: OrganizationDesignModel;

    constructor({
        lightdashConfig,
        organizationDesignModel,
    }: OrganizationDesignServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.organizationDesignModel = organizationDesignModel;
    }

    /**
     * Mirrors AppGenerateService.getS3Client — designs live in the same
     * app-runtime S3 bucket as data app sources.
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
        return {
            client: new S3Client(config),
            bucket: s3Config.bucket,
        };
    }

    private async packageMatchesExistingDesign({
        client,
        bucket,
        organizationUuid,
        design,
        manifest,
        files,
    }: {
        client: S3Client;
        bucket: string;
        organizationUuid: string;
        design: ApiOrganizationDesign;
        manifest: OrganizationDesignPackageManifest;
        files: OrganizationDesignPackageFile[];
    }): Promise<boolean> {
        if (
            design.slug !== manifest.slug ||
            design.name !== manifest.name ||
            design.description !== manifest.description ||
            design.extraInstructions !== manifest.extraInstructions
        ) {
            return false;
        }

        const existingFiles = getEffectiveOrganizationDesignFiles(design.files);
        if (design.files.length !== existingFiles.size) return false;
        if (existingFiles.size !== files.length) return false;

        /* eslint-disable no-await-in-loop */
        for (const file of files) {
            const packagePath = getOrganizationDesignPackageFilePath(
                file.kind,
                file.filename,
            );
            const existingFile = existingFiles.get(packagePath.toLowerCase());
            if (
                !existingFile ||
                existingFile.kind !== file.kind ||
                existingFile.filename !== file.filename ||
                getOrganizationDesignPackageContentType(
                    existingFile.filename,
                ) !== file.contentType ||
                existingFile.sizeBytes !== file.body.length
            ) {
                return false;
            }

            let response: GetObjectCommandOutput;
            try {
                response = await client.send(
                    new GetObjectCommand({
                        Bucket: bucket,
                        Key: designS3Key(
                            organizationUuid,
                            design.designUuid,
                            existingFile.fileUuid,
                            existingFile.filename,
                        ),
                    }),
                );
            } catch (error) {
                if (error instanceof NoSuchKey || error instanceof NotFound) {
                    return false;
                }
                throw error;
            }
            if (!response.Body) return false;
            const existingBody = Buffer.from(
                await response.Body.transformToByteArray(),
            );
            if (!existingBody.equals(file.body)) return false;
        }
        /* eslint-enable no-await-in-loop */
        return true;
    }

    private assertCanManage(account: Account): {
        organizationUuid: string;
        userUuid: string;
    } {
        assertRegisteredAccount(account);
        assertIsAccountWithOrg(account);
        const { organizationUuid } = account.organization;
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('OrganizationDesign', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to manage organization designs',
            );
        }
        return { organizationUuid, userUuid: account.user.userUuid };
    }

    private assertCanView(account: Account): {
        organizationUuid: string;
        userUuid: string;
    } {
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
                'Insufficient permissions to view organization designs',
            );
        }
        return { organizationUuid, userUuid: account.user.userUuid };
    }

    private async loadOwned(
        organizationUuid: string,
        designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiOrganizationDesign> {
        const design = await this.organizationDesignModel.findByIdOrSlug(
            organizationUuid,
            designUuidOrSlug,
        );
        if (!design) {
            throw new NotFoundError(`Design not found: ${designUuidOrSlug}`);
        }
        return design;
    }

    async listDesigns(account: Account): Promise<ApiOrganizationDesign[]> {
        const { organizationUuid } = this.assertCanView(account);
        return this.organizationDesignModel.listByOrganization(
            organizationUuid,
        );
    }

    async getDesign(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiOrganizationDesign> {
        const { organizationUuid } = this.assertCanView(account);
        return this.loadOwned(organizationUuid, designUuidOrSlug);
    }

    async createDesign(
        account: Account,
        body: { name: string; description?: string },
    ): Promise<ApiOrganizationDesign> {
        const { organizationUuid, userUuid } = this.assertCanManage(account);
        const name = body.name?.trim();
        if (!name) {
            throw new ParameterError('Design name is required');
        }
        return this.organizationDesignModel.create(organizationUuid, userUuid, {
            name,
            description: body.description?.trim() || null,
        });
    }

    async exportPackage(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
    ): Promise<{ body: Buffer; filename: string }> {
        const { organizationUuid } = this.assertCanManage(account);
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);
        const { client, bucket } = this.getS3Client();

        // Existing UI uploads historically allowed the same destination path
        // more than once. The sandbox applies those in created order, so the
        // last file is the effective one. Export only that effective file to
        // produce an importable package with unique paths.
        const effectiveFiles = getEffectiveOrganizationDesignFiles(
            design.files,
        );

        const packageFiles: OrganizationDesignPackageFile[] = [];
        let totalBytes = 0;
        /* eslint-disable no-await-in-loop */
        for (const file of effectiveFiles.values()) {
            const response = await client.send(
                new GetObjectCommand({
                    Bucket: bucket,
                    Key: designS3Key(
                        organizationUuid,
                        design.designUuid,
                        file.fileUuid,
                        file.filename,
                    ),
                }),
            );
            if (!response.Body) {
                throw new NotFoundError(
                    `Design file body missing from storage: ${file.fileUuid}`,
                );
            }
            const body = Buffer.from(
                await response.Body.transformToByteArray(),
            );
            if (body.length !== file.sizeBytes) {
                throw new Error(
                    `Stored theme file size does not match metadata: ${file.fileUuid}`,
                );
            }
            totalBytes += body.length;
            if (totalBytes > MAX_THEME_TOTAL_BYTES) {
                throw new ParameterError(
                    themeLimitMessage(
                        { bytes: totalBytes, limit: MAX_THEME_TOTAL_BYTES },
                        design.name,
                    ),
                );
            }
            packageFiles.push({
                kind: file.kind,
                filename: file.filename,
                contentType: file.contentType,
                body,
            });
        }
        /* eslint-enable no-await-in-loop */

        const manifest: OrganizationDesignPackageManifest = {
            codeVersion: ORGANIZATION_DESIGN_PACKAGE_CODE_VERSION,
            slug: design.slug,
            name: design.name,
            description: design.description,
            extraInstructions: design.extraInstructions,
        };
        const body = await buildOrganizationDesignPackage(
            manifest,
            packageFiles,
        );
        if (body.length > MAX_THEME_PACKAGE_BYTES) {
            throw new ParameterError(
                `Theme package exceeds ${MAX_THEME_PACKAGE_BYTES} bytes`,
            );
        }
        return { body, filename: `${design.slug}.tar` };
    }

    async importPackage(
        account: Account,
        input: { body: Readable; contentLength: number },
    ): Promise<OrganizationDesignPackageImportResult> {
        const { organizationUuid, userUuid } = this.assertCanManage(account);
        if (
            input.contentLength <= 0 ||
            input.contentLength > MAX_THEME_PACKAGE_BYTES
        ) {
            throw new ParameterError(
                `Theme package must be between 1 and ${MAX_THEME_PACKAGE_BYTES} bytes`,
            );
        }

        const archive = await bufferReadableWithLimit(
            input.body,
            MAX_THEME_PACKAGE_BYTES,
        );
        if (archive.length === 0) {
            throw new ParameterError('Theme package body is empty');
        }
        const parsed = await parseOrganizationDesignPackage(archive);
        const validatedFiles = parsed.files.map((file) => {
            const { kind, filename } = validateOrganizationDesignFileMetadata({
                kind: file.kind,
                filename: file.filename,
            });
            validateOrganizationDesignFileContent({
                body: file.body,
                filename,
            });
            return {
                kind,
                filename,
                contentType: file.contentType,
                body: sanitizeOrganizationDesignFile(file.body, filename),
            };
        });
        const violation = checkThemeLimits(
            validatedFiles.map((file) => ({ sizeBytes: file.body.length })),
        );
        if (violation) {
            throw new ParameterError(
                themeLimitMessage(violation, parsed.manifest.name),
            );
        }

        const existing = await this.organizationDesignModel.findByIdOrSlug(
            organizationUuid,
            parsed.manifest.slug,
        );
        const { client, bucket } = this.getS3Client();
        if (
            existing &&
            (await this.packageMatchesExistingDesign({
                client,
                bucket,
                organizationUuid,
                design: existing,
                manifest: parsed.manifest,
                files: validatedFiles,
            }))
        ) {
            const confirmed =
                await this.organizationDesignModel.confirmPackageSnapshot(
                    organizationUuid,
                    existing,
                );
            if (confirmed) {
                return { ...confirmed, action: PromotionAction.NO_CHANGES };
            }
        }

        // Preserve a byte-identical legacy theme package as a no-op. New or
        // changed packages are subject to the current font policy before any
        // bytes are staged in S3.
        /* eslint-disable no-await-in-loop */
        for (const file of validatedFiles) {
            await validateOrganizationDesignFontPolicy({
                body: file.body,
                filename: file.filename,
                kind: file.kind,
            });
        }
        /* eslint-enable no-await-in-loop */

        const designUuid = existing?.designUuid ?? uuidv4();
        const stagedFiles = validatedFiles.map((file) => {
            const fileUuid = uuidv4();
            const write: OrganizationDesignFileWrite = {
                fileUuid,
                kind: file.kind,
                filename: file.filename,
                contentType: file.contentType,
                sizeBytes: file.body.length,
            };
            return {
                write,
                body: file.body,
                key: designS3Key(
                    organizationUuid,
                    designUuid,
                    fileUuid,
                    file.filename,
                ),
            };
        });

        const uploadedKeys: string[] = [];
        try {
            /* eslint-disable no-await-in-loop */
            for (const file of stagedFiles) {
                await client.send(
                    new PutObjectCommand({
                        Bucket: bucket,
                        Key: file.key,
                        Body: file.body,
                        ContentLength: file.body.length,
                        ContentType: file.write.contentType,
                    }),
                );
                uploadedKeys.push(file.key);
            }
            /* eslint-enable no-await-in-loop */
        } catch (error) {
            await this.deleteObjectKeysBestEffort(
                client,
                bucket,
                uploadedKeys,
                `failed package staging for theme ${parsed.manifest.slug}`,
            );
            throw error;
        }

        let result: ApiOrganizationDesign;
        let removedFiles: ApiOrganizationDesignFile[] = [];
        try {
            if (existing) {
                const replacement =
                    await this.organizationDesignModel.replaceFiles(
                        organizationUuid,
                        existing.designUuid,
                        userUuid,
                        {
                            name: parsed.manifest.name,
                            description: parsed.manifest.description,
                            extraInstructions:
                                parsed.manifest.extraInstructions,
                            files: stagedFiles.map((file) => file.write),
                        },
                    );
                result = replacement.design;
                removedFiles = replacement.removedFiles;
            } else {
                result = await this.organizationDesignModel.createWithFiles(
                    organizationUuid,
                    userUuid,
                    {
                        designUuid,
                        slug: parsed.manifest.slug,
                        name: parsed.manifest.name,
                        description: parsed.manifest.description,
                        extraInstructions: parsed.manifest.extraInstructions,
                        files: stagedFiles.map((file) => file.write),
                    },
                );
            }
        } catch (error) {
            await this.deleteObjectKeysBestEffort(
                client,
                bucket,
                uploadedKeys,
                `failed package activation for theme ${parsed.manifest.slug}`,
            );
            throw error;
        }

        await this.deleteObjectKeysBestEffort(
            client,
            bucket,
            removedFiles.map((file) =>
                designS3Key(
                    organizationUuid,
                    result.designUuid,
                    file.fileUuid,
                    file.filename,
                ),
            ),
            `old package cleanup for theme ${parsed.manifest.slug}`,
        );
        return {
            ...result,
            action: existing ? PromotionAction.UPDATE : PromotionAction.CREATE,
        };
    }

    async updateDesign(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
        body: {
            name?: string;
            description?: string | null;
            extraInstructions?: string | null;
        },
    ): Promise<ApiOrganizationDesign> {
        const { organizationUuid } = this.assertCanManage(account);
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);
        const update: {
            name?: string;
            description?: string | null;
            extraInstructions?: string | null;
        } = {};
        if (body.name !== undefined) {
            const trimmed = body.name.trim();
            if (!trimmed) {
                throw new ParameterError('Design name may not be empty');
            }
            update.name = trimmed;
        }
        if (body.description !== undefined) {
            update.description =
                body.description === null
                    ? null
                    : body.description.trim() || null;
        }
        if (body.extraInstructions !== undefined) {
            // Normalise empty string to null so "no extra instructions" has
            // one canonical representation in the DB and downstream
            // skill-assembly check (`if (extraInstructions)`).
            update.extraInstructions =
                body.extraInstructions === null
                    ? null
                    : body.extraInstructions.trim() || null;
        }
        return this.organizationDesignModel.update(
            organizationUuid,
            design.designUuid,
            update,
        );
    }

    async deleteDesign(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
    ): Promise<void> {
        const { organizationUuid } = this.assertCanManage(account);
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);
        // Drop the metadata first — once gone, no API path can reference
        // these S3 objects, so an orphaned-S3 failure is safe and
        // reconcilable later.
        await this.organizationDesignModel.delete(
            organizationUuid,
            design.designUuid,
        );
        try {
            await this.deleteDesignS3Prefix(
                organizationUuid,
                design.designUuid,
            );
        } catch (err) {
            // The metadata row is already gone — the API can no longer
            // reach these S3 objects, so the user-visible deletion is
            // complete. Log loudly so the orphaned objects can be swept
            // up later (e.g. by a future cross-cutting GC job).
            this.logger.error(
                `Failed to delete S3 objects for design ${design.designUuid} (org ${organizationUuid}); objects are orphaned and require manual reconciliation`,
                {
                    organizationUuid,
                    designUuid: design.designUuid,
                    error: err,
                },
            );
        }
    }

    async setAsDefault(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
    ): Promise<ApiOrganizationDesign> {
        const { organizationUuid } = this.assertCanManage(account);
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);
        return this.organizationDesignModel.setDefault(
            organizationUuid,
            design.designUuid,
        );
    }

    async clearOrgDefault(account: Account): Promise<void> {
        const { organizationUuid } = this.assertCanManage(account);
        await this.organizationDesignModel.clearDefault(organizationUuid);
    }

    async uploadFile(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
        input: {
            kind: string;
            filename: string;
            contentType: string;
            body: Readable;
            contentLength: number;
        },
    ): Promise<ApiOrganizationDesignFile> {
        const { organizationUuid, userUuid } = this.assertCanManage(account);
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);

        const { kind, filename } = validateOrganizationDesignFileMetadata({
            kind: input.kind,
            filename: input.filename,
        });

        // Reject uploads that would push the theme past its total-size
        // guardrail, so a theme can't grow large enough to time out the
        // data-app pipeline when applied. `contentLength` is an upper bound on
        // the stored size (SVG sanitization can only shrink it), so this never
        // under-counts. Checked before reading any bytes off the wire.
        const prospectiveViolation = checkThemeLimits([
            ...design.files,
            { sizeBytes: input.contentLength },
        ]);
        if (prospectiveViolation) {
            throw new ParameterError(
                themeLimitMessage(prospectiveViolation, design.name),
            );
        }

        // Reject obviously-too-big uploads before reading a single byte off
        // the wire. The streaming cap below still enforces the limit against
        // the actual payload in case Content-Length is wrong or absent.
        if (input.contentLength > MAX_THEME_FILE_BYTES) {
            throw new ParameterError(
                `File exceeds ${MAX_THEME_FILE_BYTES} bytes`,
            );
        }

        // Buffer the body with a hard cap. We need the full Buffer anyway so
        // the AWS SDK can use standard S3v4 signing — streaming bodies cause
        // chunked signing which MinIO/GCS reject with RequestTimeout.
        const chunks: Buffer[] = [];
        let total = 0;
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of input.body) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.length;
            if (total > MAX_THEME_FILE_BYTES) {
                throw new ParameterError(
                    `File exceeds ${MAX_THEME_FILE_BYTES} bytes`,
                );
            }
            chunks.push(buf);
        }
        const rawBody = Buffer.concat(chunks);
        if (rawBody.length === 0) {
            throw new ParameterError('Upload body is empty');
        }

        validateOrganizationDesignFileContent({ body: rawBody, filename });
        await validateOrganizationDesignFontPolicy({
            body: rawBody,
            filename,
            kind,
        });
        const body = sanitizeOrganizationDesignFile(rawBody, filename);

        const contentType =
            input.contentType?.trim() || 'application/octet-stream';
        const fileUuid = uuidv4();
        const key = designS3Key(
            organizationUuid,
            design.designUuid,
            fileUuid,
            filename,
        );

        const { client, bucket } = this.getS3Client();
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentLength: body.length,
                ContentType: contentType,
            }),
        );

        return this.organizationDesignModel.addFile(
            design.designUuid,
            userUuid,
            {
                fileUuid,
                kind,
                filename,
                contentType,
                sizeBytes: body.length,
            },
        );
    }

    async deleteFile(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
        fileUuid: string,
    ): Promise<void> {
        const { organizationUuid } = this.assertCanManage(account);
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);

        const file = await this.organizationDesignModel.findFile(
            design.designUuid,
            fileUuid,
        );
        if (!file) {
            throw new NotFoundError(`Design file not found: ${fileUuid}`);
        }
        await this.organizationDesignModel.removeFile(
            design.designUuid,
            fileUuid,
        );

        const { client, bucket } = this.getS3Client();
        await client.send(
            new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: {
                    Objects: [
                        {
                            Key: designS3Key(
                                organizationUuid,
                                design.designUuid,
                                fileUuid,
                                file.filename,
                            ),
                        },
                    ],
                    Quiet: true,
                },
            }),
        );
    }

    /**
     * Delete every file in a design, keeping the design itself (name,
     * description, extra instructions, default flag and any `apps.design_uuid`
     * links all survive). Deleting and recreating the theme is not an
     * equivalent workaround — that unlinks every app already using it.
     */
    async clearFiles(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
    ): Promise<void> {
        const { organizationUuid } = this.assertCanManage(account);
        // Key off the stored uuid, not the raw path arg — Postgres matches uuids
        // case-insensitively, so an uppercase arg would build keys that hit
        // nothing and silently orphan every object.
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);

        // Fail loudly if storage isn't configured — a swallowed MissingConfigError
        // here would report a successful clear that never deleted any bytes.
        const { client, bucket } = this.getS3Client();

        // Drop the metadata first — once gone, no API path can reference these
        // S3 objects, so an orphaned-S3 failure is safe and reconcilable later.
        const removed = await this.organizationDesignModel.removeAllFiles(
            design.designUuid,
        );
        if (removed.length === 0) return;

        const keys = removed.map((file) => ({
            Key: designS3Key(
                organizationUuid,
                design.designUuid,
                file.fileUuid,
                file.filename,
            ),
        }));

        try {
            /* eslint-disable no-await-in-loop */
            for (let i = 0; i < keys.length; i += S3_DELETE_BATCH_SIZE) {
                await client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: {
                            Objects: keys.slice(i, i + S3_DELETE_BATCH_SIZE),
                            Quiet: true,
                        },
                    }),
                );
            }
            /* eslint-enable no-await-in-loop */
        } catch (err) {
            this.logger.error(
                `Failed to delete S3 objects while clearing files for design ${design.designUuid} (org ${organizationUuid}); objects are orphaned and require manual reconciliation`,
                {
                    organizationUuid,
                    designUuid: design.designUuid,
                    error: err,
                },
            );
        }
    }

    async getFileStream(
        account: Account,
        designUuidOrSlug: UuidOrSlug,
        fileUuid: string,
    ): Promise<{
        body: Readable;
        contentType: string;
        filename: string;
        sizeBytes: number;
    }> {
        const { organizationUuid } = this.assertCanView(account);
        const design = await this.loadOwned(organizationUuid, designUuidOrSlug);

        const file = await this.organizationDesignModel.findFile(
            design.designUuid,
            fileUuid,
        );
        if (!file) {
            throw new NotFoundError(`Design file not found: ${fileUuid}`);
        }

        const { client, bucket } = this.getS3Client();
        const response = await client.send(
            new GetObjectCommand({
                Bucket: bucket,
                Key: designS3Key(
                    organizationUuid,
                    design.designUuid,
                    fileUuid,
                    file.filename,
                ),
            }),
        );
        if (!response.Body) {
            throw new NotFoundError(
                `Design file body missing from storage: ${fileUuid}`,
            );
        }
        return {
            body: response.Body as Readable,
            contentType: file.contentType,
            filename: file.filename,
            sizeBytes: file.sizeBytes,
        };
    }

    private async deleteObjectKeysBestEffort(
        client: S3Client,
        bucket: string,
        keys: string[],
        context: string,
    ): Promise<void> {
        if (keys.length === 0) return;
        try {
            /* eslint-disable no-await-in-loop */
            for (let i = 0; i < keys.length; i += S3_DELETE_BATCH_SIZE) {
                await client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: {
                            Objects: keys
                                .slice(i, i + S3_DELETE_BATCH_SIZE)
                                .map((Key) => ({ Key })),
                            Quiet: true,
                        },
                    }),
                );
            }
            /* eslint-enable no-await-in-loop */
        } catch (error) {
            this.logger.error(
                `Failed to delete ${keys.length} theme package object(s) during ${context}`,
                { error, objectCount: keys.length },
            );
        }
    }

    /**
     * Cascade-delete every object under a design's S3 prefix. Mirrors
     * AppGenerateService.deleteAppS3Prefix — paginated list + batched
     * DeleteObjects (1000 keys per page).
     */
    private async deleteDesignS3Prefix(
        organizationUuid: string,
        designUuid: string,
    ): Promise<void> {
        const { client, bucket } = this.getS3Client();
        const prefix = designS3Prefix(organizationUuid, designUuid);
        let continuationToken: string | undefined;
        let totalDeleted = 0;
        /* eslint-disable no-await-in-loop */
        do {
            const listResponse = await client.send(
                new ListObjectsV2Command({
                    Bucket: bucket,
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                }),
            );
            const objects: ObjectIdentifier[] = (listResponse.Contents ?? [])
                .map((obj) => obj.Key)
                .filter((key): key is string => typeof key === 'string')
                .map((Key) => ({ Key }));
            if (objects.length > 0) {
                await client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucket,
                        Delete: { Objects: objects, Quiet: true },
                    }),
                );
                totalDeleted += objects.length;
            }
            continuationToken = listResponse.IsTruncated
                ? listResponse.NextContinuationToken
                : undefined;
        } while (continuationToken);
        /* eslint-enable no-await-in-loop */
        this.logger.info(
            `Design ${designUuid}: deleted ${totalDeleted} S3 object(s) under ${prefix}`,
        );
    }
}
