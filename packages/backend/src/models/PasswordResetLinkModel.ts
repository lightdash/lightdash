import { NotExistsError, PasswordResetLink } from '@lightdash/common';
import * as crypto from 'crypto';
import { Knex } from 'knex';
import { URL } from 'url';
import { LightdashConfig } from '../config/parseConfig';
import { EmailTableName } from '../database/entities/emails';
import { PasswordResetTableName } from '../database/entities/passwordResetLinks';

type PasswordResetLinkModelArguments = {
    database: Knex;
    lightdashConfig: LightdashConfig;
};

export class PasswordResetLinkModel {
    private database: Knex;

    private lightdashConfig: LightdashConfig;

    constructor({
        database,
        lightdashConfig,
    }: PasswordResetLinkModelArguments) {
        this.database = database;
        this.lightdashConfig = lightdashConfig;
    }

    transformCodeToUrl(code: string): string {
        return new URL(`/reset-password/${code}`, this.lightdashConfig.siteUrl)
            .href;
    }

    static _hash(s: string): string {
        return crypto.createHash('sha256').update(s).digest('hex');
    }

    async getByCode(code: string): Promise<PasswordResetLink> {
        const codeHash = PasswordResetLinkModel._hash(code);
        const links = await this.database(PasswordResetTableName)
            .leftJoin(
                EmailTableName,
                'emails.email_id',
                'password_reset_links.email_id',
            )
            .select<{ expires_at: Date; email: string }[]>([
                'password_reset_links.expires_at',
                'emails.email',
            ])
            .where('code_hash', codeHash);
        if (links.length === 0) {
            throw new NotExistsError('No password reset link found');
        }
        const passwordResetLink = links[0];
        return {
            code,
            email: passwordResetLink.email,
            expiresAt: passwordResetLink.expires_at,
            url: this.transformCodeToUrl(code),
            isExpired: passwordResetLink.expires_at <= new Date(),
        };
    }

    async create(
        code: string,
        expiresAt: Date,
        email: string,
    ): Promise<PasswordResetLink> {
        const codeHash = PasswordResetLinkModel._hash(code);
        const emails = await this.database(EmailTableName)
            .where('email', email)
            .select('*');
        if (emails.length === 0) {
            throw new NotExistsError('Cannot find email');
        }
        const result = emails[0];
        const links = await this.database(PasswordResetTableName)
            .insert({
                email_id: result.email_id,
                code_hash: codeHash,
                expires_at: expiresAt,
            })
            .returning('*');
        return {
            code,
            email: result.email,
            expiresAt: links[0].expires_at,
            url: this.transformCodeToUrl(code),
            isExpired: links[0].expires_at <= new Date(),
        };
    }

    async deleteByCode(code: string) {
        const codeHash = PasswordResetLinkModel._hash(code);
        await this.database(PasswordResetTableName)
            .where('code_hash', codeHash)
            .delete();
    }
}
