import { ParameterError, WarehouseTypes } from '@lightdash/common';
import { parseCliDeployMetadata } from './cliDeployMetadata';

describe('parseCliDeployMetadata', () => {
    it('accepts old clients without metadata', () => {
        expect(parseCliDeployMetadata()).toEqual({});
    });

    it('keeps identity separate from source and target selection', () => {
        const metadata = {
            cliCapabilities: {
                dbtProjectIdentity: 1,
                dbtTargetLocation: 1,
            },
            dbtProjectName: '_example_1',
            dbtTarget: {
                type: WarehouseTypes.ATHENA,
                database: 'example_catalog',
                region: 'us-east-1',
            },
        } as const;
        expect(
            parseCliDeployMetadata({
                ...metadata,
                sourceUuid: 'example-source',
                target: { database: 'other_database' },
            } as typeof metadata),
        ).toEqual(metadata);
    });

    it.each(['a', '_', 'A'.repeat(255)])(
        'accepts a valid project name %s',
        (dbtProjectName) => {
            expect(parseCliDeployMetadata({ dbtProjectName })).toEqual({
                dbtProjectName,
            });
        },
    );

    it.each([
        { dbtProjectName: '' },
        { dbtProjectName: 'a'.repeat(256) },
        { dbtProjectName: '1example' },
        { dbtProjectName: 'example-project' },
        { dbtProjectName: 'example project' },
        { dbtProjectName: null },
        { cliCapabilities: { dbtProjectIdentity: 1 } },
        { cliCapabilities: { dbtProjectIdentity: 2, dbtTargetLocation: 1 } },
        { cliCapabilities: { dbtProjectIdentity: 1, dbtTargetLocation: '1' } },
        {
            cliCapabilities: {
                dbtProjectIdentity: 1,
                dbtTargetLocation: 1,
                unknown: 1,
            },
        },
        { dbtTarget: { type: 'unknown', database: 'example' } },
        { dbtTarget: { type: WarehouseTypes.POSTGRES, database: '' } },
        {
            dbtTarget: {
                type: WarehouseTypes.POSTGRES,
                database: 'a'.repeat(256),
            },
        },
        {
            dbtTarget: {
                type: WarehouseTypes.ATHENA,
                database: 'example',
                region: '',
            },
        },
        {
            dbtTarget: {
                type: WarehouseTypes.ATHENA,
                database: 'example',
                region: 'a'.repeat(256),
            },
        },
        { dbtTarget: null },
    ])('rejects malformed metadata %j', (metadata) => {
        expect(() => parseCliDeployMetadata(metadata as never)).toThrow(
            ParameterError,
        );
    });
});
