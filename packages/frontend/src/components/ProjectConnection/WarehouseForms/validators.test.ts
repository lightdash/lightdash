import { WarehouseTypes } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { type ProjectConnectionForm } from '../types';
import { PostgresDefaultValues, RedshiftDefaultValues } from './defaultValues';
import {
    createWarehouseValueValidators,
    SSH_TUNNEL_PUBLIC_KEY_REQUIRED_MESSAGE,
    warehouseValueValidators,
} from './validators';

const formValues = (
    warehouse: ProjectConnectionForm['warehouse'],
): ProjectConnectionForm => ({ warehouse }) as unknown as ProjectConnectionForm;

describe.each([
    ['postgres', WarehouseTypes.POSTGRES, PostgresDefaultValues],
    ['redshift', WarehouseTypes.REDSHIFT, RedshiftDefaultValues],
] as const)('%s sshTunnelPublicKey validation', (_label, type, defaults) => {
    const validators = [
        ['update', warehouseValueValidators[type].sshTunnelPublicKey],
        ['create', createWarehouseValueValidators[type].sshTunnelPublicKey],
    ] as const;

    it.each(validators)(
        '%s form rejects an empty key when the tunnel is enabled',
        (_form, validate) => {
            const values = formValues({ ...defaults, useSshTunnel: true });
            expect(validate('', values)).toBe(
                SSH_TUNNEL_PUBLIC_KEY_REQUIRED_MESSAGE,
            );
            expect(validate('   ', values)).toBe(
                SSH_TUNNEL_PUBLIC_KEY_REQUIRED_MESSAGE,
            );
        },
    );

    it.each(validators)(
        '%s form accepts a generated key when the tunnel is enabled',
        (_form, validate) => {
            const values = formValues({ ...defaults, useSshTunnel: true });
            expect(
                validate('ssh-rsa AAAA (generated)', values),
            ).toBeUndefined();
        },
    );

    it.each(validators)(
        '%s form ignores the key when the tunnel is disabled',
        (_form, validate) => {
            const values = formValues({ ...defaults, useSshTunnel: false });
            expect(validate('', values)).toBeUndefined();
        },
    );
});
