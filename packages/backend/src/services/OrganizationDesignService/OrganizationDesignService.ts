import {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
    type ObjectIdentifier,
    type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { subject } from '@casl/ability';
import {
    ApiOrganizationDesign,
    ApiOrganizationDesignFile,
    assertIsAccountWithOrg,
    assertRegisteredAccount,
    ForbiddenError,
    MissingConfigError,
    NotFoundError,
    ORGANIZATION_DESIGN_FILE_KINDS,
    OrganizationDesignFileKind,
    ParameterError,
    type Account,
} from '@lightdash/common';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { Readable } from 'node:stream';
import { v4 as uuidv4 } from 'uuid';
import { resolveS3Credentials } from '../../clients/Aws/S3BaseClient';
import { LightdashConfig } from '../../config/parseConfig';
import { OrganizationDesignModel } from '../../models/OrganizationDesignModel';
import { BaseService } from '../BaseService';

type OrganizationDesignServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationDesignModel: OrganizationDesignModel;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

/**
 * Allowed filename extensions for each kind. Filename extension is the
 * authoritative signal — client-supplied Content-Type is stored but not
 * relied on for routing/validation, since browsers send wildly different
 * MIME strings for the same font/image types.
 */
const KIND_EXTENSIONS: Record<OrganizationDesignFileKind, string[]> = {
    css: ['.css'],
    font: ['.woff', '.woff2', '.ttf', '.otf'],
    image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    instruction: ['.md'],
};

const FILENAME_BAD_CHARS = /[\0/\\]/;

const ensureValidFilename = (filename: string): string => {
    const trimmed = filename.trim();
    if (!trimmed) {
        throw new ParameterError('Filename is required');
    }
    if (trimmed.length > 255) {
        throw new ParameterError('Filename exceeds 255 characters');
    }
    if (trimmed.includes('..')) {
        throw new ParameterError('Filename may not contain ".."');
    }
    if (FILENAME_BAD_CHARS.test(trimmed)) {
        throw new ParameterError(
            'Filename may not contain slashes or null bytes',
        );
    }
    return trimmed;
};

const ensureFilenameMatchesKind = (
    filename: string,
    kind: OrganizationDesignFileKind,
): void => {
    const lower = filename.toLowerCase();
    const allowed = KIND_EXTENSIONS[kind];
    if (!allowed.some((ext) => lower.endsWith(ext))) {
        throw new ParameterError(
            `Filename "${filename}" does not match kind "${kind}". Allowed extensions: ${allowed.join(', ')}`,
        );
    }
};

const ensureValidKind = (kind: string): OrganizationDesignFileKind => {
    if (!(ORGANIZATION_DESIGN_FILE_KINDS as readonly string[]).includes(kind)) {
        throw new ParameterError(
            `Invalid kind "${kind}". Allowed: ${ORGANIZATION_DESIGN_FILE_KINDS.join(', ')}`,
        );
    }
    return kind as OrganizationDesignFileKind;
};

/**
 * Magic-byte validation. A SignatureAlternative is a set of byte-runs at
 * given offsets that must ALL match. An extension's signature list is an
 * OR over alternatives (e.g. GIF87a OR GIF89a, TTF magic 00 01 00 00 OR
 * the 'true' variant). Extension is the authoritative signal (matched
 * against the declared `kind` upstream), so we only need one mapping.
 */
type SignatureAlternative = ReadonlyArray<{
    offset: number;
    bytes: ReadonlyArray<number>;
}>;

const BINARY_SIGNATURES: Record<string, ReadonlyArray<SignatureAlternative>> = {
    // Fonts
    '.woff2': [[{ offset: 0, bytes: [0x77, 0x4f, 0x46, 0x32] }]], // wOF2
    '.woff': [[{ offset: 0, bytes: [0x77, 0x4f, 0x46, 0x46] }]], // wOFF
    '.ttf': [
        [{ offset: 0, bytes: [0x00, 0x01, 0x00, 0x00] }],
        [{ offset: 0, bytes: [0x74, 0x72, 0x75, 0x65] }], // 'true'
    ],
    '.otf': [[{ offset: 0, bytes: [0x4f, 0x54, 0x54, 0x4f] }]], // OTTO
    // Images
    '.png': [
        [
            {
                offset: 0,
                bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            },
        ],
    ],
    '.jpg': [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
    '.jpeg': [[{ offset: 0, bytes: [0xff, 0xd8, 0xff] }]],
    '.gif': [
        [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }], // GIF87a
        [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }], // GIF89a
    ],
    '.webp': [
        [
            { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
            { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
        ],
    ],
};

const TEXT_EXTENSIONS = new Set<string>(['.css', '.md', '.svg']);

// SVG is XML — must look like one. NOTE: this is NOT a full XSS defense:
// an SVG that passes this check can still contain <script> tags. It only
// kills the trivial "rename .exe to .svg" path. A future hardening pass
// should DOMPurify SVG bodies before they ship into the rendered data app.
const SVG_HEAD_PREFIX = /^\s*<(?:\?xml|svg|!--|!DOCTYPE)/i;

const TEXT_HEAD_SCAN_BYTES = 1024;

const getExtension = (filename: string): string => {
    const lower = filename.toLowerCase();
    const dot = lower.lastIndexOf('.');
    return dot === -1 ? '' : lower.slice(dot);
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

const ensureContentMatchesExtension = (
    body: Buffer,
    filename: string,
): { body: Buffer } => {
    const ext = getExtension(filename);

    const binaryAlternatives = BINARY_SIGNATURES[ext];
    if (binaryAlternatives) {
        const matchesAny = binaryAlternatives.some((alternative) =>
            alternative.every(({ offset, bytes }) =>
                bytes.every((byte, i) => body[offset + i] === byte),
            ),
        );
        if (!matchesAny) {
            throw new ParameterError(
                `File content does not match ${ext} signature`,
            );
        }
        return { body };
    }

    if (TEXT_EXTENSIONS.has(ext)) {
        let text: string;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(body);
        } catch {
            throw new ParameterError(
                `File content for ${ext} must be valid UTF-8 text`,
            );
        }
        // Binary files almost always have a null byte in the first kilobyte;
        // legitimate text doesn't. Cheap belt-and-suspenders alongside the
        // UTF-8 check (NULs are valid UTF-8).
        const head = body.subarray(
            0,
            Math.min(body.length, TEXT_HEAD_SCAN_BYTES),
        );
        if (head.includes(0)) {
            throw new ParameterError(
                `File content for ${ext} contains null bytes`,
            );
        }
        if (ext === '.svg') {
            if (!SVG_HEAD_PREFIX.test(head.toString('utf8'))) {
                throw new ParameterError(
                    'SVG content must start with <?xml, <svg, or an XML comment/doctype',
                );
            }
            // Returned bytes are the sanitized SVG — anything DOMPurify
            // stripped (<script>, on*= handlers, foreignObject, javascript:
            // hrefs) never lands in S3.
            return { body: Buffer.from(sanitizeSvg(text), 'utf8') };
        }
        return { body };
    }

    // Defensive default: ensureFilenameMatchesKind upstream guarantees
    // the extension is one we recognize, so we should never get here.
    return { body };
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
        designUuid: string,
    ): Promise<ApiOrganizationDesign> {
        const design = await this.organizationDesignModel.findInOrganization(
            organizationUuid,
            designUuid,
        );
        if (!design) {
            throw new NotFoundError(`Design not found: ${designUuid}`);
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
        designUuid: string,
    ): Promise<ApiOrganizationDesign> {
        const { organizationUuid } = this.assertCanView(account);
        return this.loadOwned(organizationUuid, designUuid);
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

    async updateDesign(
        account: Account,
        designUuid: string,
        body: { name?: string; description?: string | null },
    ): Promise<ApiOrganizationDesign> {
        const { organizationUuid } = this.assertCanManage(account);
        await this.loadOwned(organizationUuid, designUuid);
        const update: { name?: string; description?: string | null } = {};
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
        return this.organizationDesignModel.update(
            organizationUuid,
            designUuid,
            update,
        );
    }

    async deleteDesign(account: Account, designUuid: string): Promise<void> {
        const { organizationUuid } = this.assertCanManage(account);
        await this.loadOwned(organizationUuid, designUuid);
        // Drop the metadata first — once gone, no API path can reference
        // these S3 objects, so an orphaned-S3 failure is safe and
        // reconcilable later.
        await this.organizationDesignModel.delete(organizationUuid, designUuid);
        try {
            await this.deleteDesignS3Prefix(organizationUuid, designUuid);
        } catch (err) {
            // The metadata row is already gone — the API can no longer
            // reach these S3 objects, so the user-visible deletion is
            // complete. Log loudly so the orphaned objects can be swept
            // up later (e.g. by a future cross-cutting GC job).
            this.logger.error(
                `Failed to delete S3 objects for design ${designUuid} (org ${organizationUuid}); objects are orphaned and require manual reconciliation`,
                {
                    organizationUuid,
                    designUuid,
                    error: err,
                },
            );
        }
    }

    async setAsDefault(
        account: Account,
        designUuid: string,
    ): Promise<ApiOrganizationDesign> {
        const { organizationUuid } = this.assertCanManage(account);
        return this.organizationDesignModel.setDefault(
            organizationUuid,
            designUuid,
        );
    }

    async clearOrgDefault(account: Account): Promise<void> {
        const { organizationUuid } = this.assertCanManage(account);
        await this.organizationDesignModel.clearDefault(organizationUuid);
    }

    async uploadFile(
        account: Account,
        designUuid: string,
        input: {
            kind: string;
            filename: string;
            contentType: string;
            body: Readable;
            contentLength: number;
        },
    ): Promise<ApiOrganizationDesignFile> {
        const { organizationUuid, userUuid } = this.assertCanManage(account);
        await this.loadOwned(organizationUuid, designUuid);

        const kind = ensureValidKind(input.kind);
        const filename = ensureValidFilename(input.filename);
        ensureFilenameMatchesKind(filename, kind);

        // Reject obviously-too-big uploads before reading a single byte off
        // the wire. The streaming cap below still enforces the limit against
        // the actual payload in case Content-Length is wrong or absent.
        if (input.contentLength > MAX_FILE_BYTES) {
            throw new ParameterError(`File exceeds ${MAX_FILE_BYTES} bytes`);
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
            if (total > MAX_FILE_BYTES) {
                throw new ParameterError(
                    `File exceeds ${MAX_FILE_BYTES} bytes`,
                );
            }
            chunks.push(buf);
        }
        const rawBody = Buffer.concat(chunks);
        if (rawBody.length === 0) {
            throw new ParameterError('Upload body is empty');
        }

        // ensureContentMatchesExtension may return a sanitized body (SVG).
        // Always use the returned buffer for both S3 upload and size accounting.
        const { body } = ensureContentMatchesExtension(rawBody, filename);

        const contentType =
            input.contentType?.trim() || 'application/octet-stream';
        const fileUuid = uuidv4();
        const key = designS3Key(
            organizationUuid,
            designUuid,
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

        return this.organizationDesignModel.addFile(designUuid, userUuid, {
            fileUuid,
            kind,
            filename,
            contentType,
            sizeBytes: body.length,
        });
    }

    async deleteFile(
        account: Account,
        designUuid: string,
        fileUuid: string,
    ): Promise<void> {
        const { organizationUuid } = this.assertCanManage(account);
        await this.loadOwned(organizationUuid, designUuid);

        const file = await this.organizationDesignModel.findFile(
            designUuid,
            fileUuid,
        );
        if (!file) {
            throw new NotFoundError(`Design file not found: ${fileUuid}`);
        }
        await this.organizationDesignModel.removeFile(designUuid, fileUuid);

        const { client, bucket } = this.getS3Client();
        await client.send(
            new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: {
                    Objects: [
                        {
                            Key: designS3Key(
                                organizationUuid,
                                designUuid,
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

    async getFileStream(
        account: Account,
        designUuid: string,
        fileUuid: string,
    ): Promise<{
        body: Readable;
        contentType: string;
        filename: string;
        sizeBytes: number;
    }> {
        const { organizationUuid } = this.assertCanView(account);
        await this.loadOwned(organizationUuid, designUuid);

        const file = await this.organizationDesignModel.findFile(
            designUuid,
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
                    designUuid,
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
