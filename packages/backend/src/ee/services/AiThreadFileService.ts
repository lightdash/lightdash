import {
    AI_THREAD_FILE_MAX_BYTES,
    AI_THREAD_FILE_MAX_NAME_LENGTH,
    AI_THREAD_FILE_MAX_UNCLAIMED_PER_USER,
    AI_THREAD_FILE_MAX_UPLOADS_PER_MINUTE,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    TooManyRequestsError,
    type AiThreadFile,
    type SessionUser,
} from '@lightdash/common';
import type { Readable } from 'stream';
import Logger from '../../logging/logger';
import { BaseService } from '../../services/BaseService';
import type { AiThreadFileModel } from '../models/AiThreadFileModel';
import type { AiAgentService } from './AiAgentService/AiAgentService';

type AiThreadFileServiceDependencies = {
    aiThreadFileModel: AiThreadFileModel;
    aiAgentService: Pick<AiAgentService, 'getIsCopilotEnabled'>;
};

export type AiThreadFileUploadInput = {
    fileName: string;
    contentLength: number;
    body: Readable;
};

const UPLOAD_RATE_WINDOW_MS = 60 * 1000;

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/** Strict UTF-8 decode, then BOM strip and CRLF/CR → LF. */
export const normalizeThreadFileText = (bytes: Buffer): string => {
    let text: string;
    try {
        text = utf8Decoder.decode(bytes);
    } catch {
        throw new ParameterError(
            'Only UTF-8 text files can be attached to a conversation',
        );
    }
    if (text.includes('\u0000')) {
        throw new ParameterError(
            'Only UTF-8 text files can be attached to a conversation',
        );
    }
    return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
};

/** Keep only the base name so the agent mount path is always `/attachments/<name>`. */
export const sanitizeThreadFileName = (fileName: string): string => {
    const base = fileName.trim().split(/[\\/]/).pop() ?? '';
    // eslint-disable-next-line no-control-regex
    const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
        throw new ParameterError('File name is required');
    }
    if (cleaned.length > AI_THREAD_FILE_MAX_NAME_LENGTH) {
        throw new ParameterError(
            `File name must be at most ${AI_THREAD_FILE_MAX_NAME_LENGTH} characters`,
        );
    }
    return cleaned;
};

export class AiThreadFileService extends BaseService {
    private readonly aiThreadFileModel: AiThreadFileModel;

    private readonly aiAgentService: Pick<
        AiAgentService,
        'getIsCopilotEnabled'
    >;

    constructor(dependencies: AiThreadFileServiceDependencies) {
        super();
        this.aiThreadFileModel = dependencies.aiThreadFileModel;
        this.aiAgentService = dependencies.aiAgentService;
    }

    private async assertCanUpload(user: SessionUser): Promise<string> {
        if (!user.organizationUuid) {
            throw new ForbiddenError('User must belong to an organization');
        }
        const isCopilotEnabled =
            await this.aiAgentService.getIsCopilotEnabled(user);
        if (!isCopilotEnabled) {
            throw new ForbiddenError('Copilot is not enabled');
        }
        return user.organizationUuid;
    }

    private static async readBody(
        body: Readable,
        contentLength: number,
    ): Promise<Buffer> {
        if (contentLength > AI_THREAD_FILE_MAX_BYTES) {
            throw new ParameterError(
                `File exceeds the ${AI_THREAD_FILE_MAX_BYTES / 1024} KB limit`,
            );
        }
        const chunks: Buffer[] = [];
        let total = 0;
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of body) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buffer.length;
            if (total > AI_THREAD_FILE_MAX_BYTES) {
                throw new ParameterError(
                    `File exceeds the ${AI_THREAD_FILE_MAX_BYTES / 1024} KB limit`,
                );
            }
            chunks.push(buffer);
        }
        if (total === 0) {
            throw new ParameterError('Upload body is empty');
        }
        return Buffer.concat(chunks);
    }

    async upload(
        user: SessionUser,
        input: AiThreadFileUploadInput,
    ): Promise<AiThreadFile> {
        const organizationUuid = await this.assertCanUpload(user);
        const fileName = sanitizeThreadFileName(input.fileName);

        const [recentUploads, unclaimedCount] = await Promise.all([
            this.aiThreadFileModel.countRecentUploadsForUser(
                user.userUuid,
                UPLOAD_RATE_WINDOW_MS,
            ),
            this.aiThreadFileModel.countUnclaimedForUser(user.userUuid),
        ]);
        if (recentUploads >= AI_THREAD_FILE_MAX_UPLOADS_PER_MINUTE) {
            throw new TooManyRequestsError(
                'Too many uploads. Wait a minute and try again.',
            );
        }
        if (unclaimedCount >= AI_THREAD_FILE_MAX_UNCLAIMED_PER_USER) {
            throw new TooManyRequestsError(
                'Too many unsent files. Send or remove some before uploading more.',
            );
        }

        const bytes = await AiThreadFileService.readBody(
            input.body,
            input.contentLength,
        );
        const content = normalizeThreadFileText(bytes);
        if (content.trim().length === 0) {
            throw new ParameterError('The file is empty');
        }

        return this.aiThreadFileModel.create({
            organizationUuid,
            createdByUserUuid: user.userUuid,
            fileName,
            content,
            sizeBytes: Buffer.byteLength(content, 'utf8'),
        });
    }

    /** Only the uploader may delete, and only before the file is sent. */
    async delete(user: SessionUser, fileUuid: string): Promise<void> {
        await this.assertCanUpload(user);
        const deleted = await this.aiThreadFileModel.deleteUnclaimed({
            fileUuid,
            userUuid: user.userUuid,
        });
        if (!deleted) {
            throw new NotFoundError('File not found');
        }
    }

    async sweepExpiredUnclaimed(): Promise<void> {
        const swept = await this.aiThreadFileModel.sweepExpiredUnclaimed();
        if (swept > 0) {
            Logger.info(`Swept ${swept} expired unclaimed AI thread files`);
        }
    }
}
