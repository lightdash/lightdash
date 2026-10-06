import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
    path.join(__dirname, 'AiIdentityController.ts'),
    'utf8',
);

describe('AiIdentityController', () => {
    test.each([
        "@Get('accounts/{aiIdentityAccountUuid}/provisioning')",
        "@Patch('accounts/{aiIdentityAccountUuid}/provisioning')",
        "@Put('accounts/{aiIdentityAccountUuid}/provisioning/ai-roles')",
        "@Put('accounts/{aiIdentityAccountUuid}/provisioning/mappings')",
        "@Get('accounts/{aiIdentityAccountUuid}/provisioning/plan')",
        "@Post('accounts/{aiIdentityAccountUuid}/provisioning/run')",
        "@Post('accounts/{aiIdentityAccountUuid}/provisioning/provisioner/check')",
    ])('keeps the route that Setup uses: %s', (route) => {
        expect(source).toContain(route);
    });
});
