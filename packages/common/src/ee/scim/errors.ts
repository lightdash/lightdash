import { type ScimSchemaType } from '..';
import { type ScimErrorPayload } from './types';

export class ScimError extends Error {
    /**
     * a SCIM-specific error type that provides additional context for the error.
     * @type {ScimErrorPayload['scimType']}
     */
    scimType?: ScimErrorPayload['scimType'];

    /**
     * The "schemas" attribute is an array of Strings which allows the service provider to declare
     * the schemas it supports. Each String is a URI and can be used to declare both standard and
     * custom schemas.
     * @type {ScimSchemaType[]}
     */
    schemas: ScimSchemaType.ERROR[];

    /**
     * A human-readable message in English, providing more information about the error.
     * @type {string}
     */
    detail: string;

    /**
     * The HTTP status code applicable to this error, expressed as a string value.
     * @type {string}
     * */
    status: string;

    constructor({
        detail,
        scimType,
        status,
    }: {
        detail: string;
        scimType?: ScimErrorPayload['scimType'];
        status: number;
    }) {
        super(detail);
        this.scimType = scimType;
        this.schemas = [
            'urn:ietf:params:scim:api:messages:2.0:Error',
        ] as ScimSchemaType.ERROR[];
        this.detail = detail;
        this.status = status.toString();
    }

    // Override the toJSON method to return the desired structure directly
    toJSON(): ScimErrorPayload {
        return {
            ...(this.scimType && { scimType: this.scimType }), // only include if defined
            schemas: this.schemas,
            detail: this.detail,
            status: this.status,
        };
    }
}
