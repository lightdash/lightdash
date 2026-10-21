import { describe, expect, it } from 'vitest';
import swagger from '../../generated/swagger.json';

type Operation = {
    responses: Record<
        string,
        {
            content?: { 'application/json': { schema: unknown } };
        }
    >;
};

const paths = swagger.paths as Record<string, Record<string, Operation>>;

describe('service account OpenAPI contract', () => {
    it.each([
        ['/api/v1/service-accounts', 'get'],
        ['/api/v1/service-accounts', 'post'],
        ['/api/v1/service-accounts/{tokenUuid}', 'delete'],
        ['/api/v1/service-accounts/{tokenUuid}', 'patch'],
        ['/api/v1/service-accounts/{tokenUuid}/rotate', 'patch'],
        ['/api/v1/service-accounts/{serviceAccountUuid}/projects', 'get'],
    ])('publishes %s %s', (path, method) => {
        expect(paths[path]?.[method]).toBeDefined();
    });

    it('documents the create response envelope and one-time token', () => {
        expect(
            paths['/api/v1/service-accounts']?.post.responses['201'].content?.[
                'application/json'
            ].schema,
        ).toMatchObject({
            properties: {
                status: { enum: ['ok'] },
                results: {
                    $ref: '#/components/schemas/ServiceAccountWithToken',
                },
            },
            required: expect.arrayContaining(['status', 'results']),
        });
        expect(
            swagger.components.schemas.ServiceAccountWithToken.allOf,
        ).toContainEqual(
            expect.objectContaining({
                properties: {
                    token: expect.objectContaining({ type: 'string' }),
                },
                required: ['token'],
            }),
        );
    });

    it('documents list results with project access counts', () => {
        expect(
            paths['/api/v1/service-accounts']?.get.responses['200'].content?.[
                'application/json'
            ].schema,
        ).toMatchObject({
            properties: {
                results: {
                    type: 'array',
                    items: {
                        $ref: '#/components/schemas/ServiceAccountWithProjectAccessCount',
                    },
                },
            },
        });
    });

    it('keeps deletion compatible with the existing 200 response', () => {
        const { responses } =
            paths['/api/v1/service-accounts/{tokenUuid}'].delete;
        expect(responses['200'].content?.['application/json'].schema).toEqual({
            $ref: '#/components/schemas/ApiSuccessEmpty',
        });
        expect(responses).not.toHaveProperty('204');
    });
});
