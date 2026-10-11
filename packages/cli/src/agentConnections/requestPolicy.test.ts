import path from 'path';
import { isAgentRequestAllowed, REQUEST_POLICY } from './requestPolicy';

const inventoryPath = path.join(
    __dirname,
    '../../../backend/src/auth/agentConnectionGrants/cliOperationInventory.ts',
);
it('pins every admitted and refused inventory operation to the method and route catalogue', async () => {
    const {
        CLI_GRANT_OPERATION_INVENTORY,
        CLI_CONNECTION_LIFECYCLE_OPERATIONS,
    } = (await import(inventoryPath)) as {
        CLI_GRANT_OPERATION_INVENTORY: {
            callSite: string;
            method: string;
            endpoint: string;
            operations: string[];
            disposition: 'allowed' | 'refused' | 'external';
        }[];
        CLI_CONNECTION_LIFECYCLE_OPERATIONS: string[];
    };

    const expected = new Set([
        ...CLI_GRANT_OPERATION_INVENTORY.filter(
            (entry) => entry.disposition === 'allowed',
        ).flatMap((entry) => entry.operations),
        ...CLI_CONNECTION_LIFECYCLE_OPERATIONS,
    ]);
    expect(new Set(REQUEST_POLICY.map((entry) => entry.operation))).toEqual(
        expected,
    );
    for (const entry of CLI_GRANT_OPERATION_INVENTORY.filter(
        (item) => item.disposition !== 'external',
    )) {
        for (const operation of entry.operations) {
            const routes = REQUEST_POLICY.filter(
                (route) => route.operation === operation,
            );
            if (entry.disposition === 'refused') {
                expect(routes).toEqual([]);
            } else {
                expect(routes.length).toBeGreaterThan(0);
                expect(
                    routes.every((route) => route.method === entry.method),
                ).toBe(true);
                for (const route of routes) {
                    expect(
                        isAgentRequestAllowed(
                            entry.method,
                            route.path.replace(/:[a-zA-Z]+/g, 'fixture'),
                        ),
                    ).toBe(true);
                }
            }
        }
        const literal = entry.endpoint.match(/^[`'](\/api\/[^`']*)[`']$/);
        if (
            literal &&
            !literal[1].includes('${config.') &&
            !literal[1].includes('${\n') &&
            !literal[1].includes('${new ')
        ) {
            const sample = literal[1]
                .replace(/\$\{pageSizeParam\}/g, '')
                .replace(/\$\{[^}]+\}/g, 'fixture')
                .split('?')[0];
            expect(isAgentRequestAllowed(entry.method, sample)).toBe(
                entry.disposition === 'allowed',
            );
        }
    }
});

it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'refuses unknown %s routes',
    (method) => {
        expect(isAgentRequestAllowed(method, '/api/v1/future')).toBe(false);
        expect(isAgentRequestAllowed(method, '/api/v1/org/projects')).toBe(
            false,
        );
    },
);
it('never marks a write as a safe read', () => {
    for (const entry of REQUEST_POLICY)
        expect(entry.safeRead).toBe(entry.method === 'GET');
});
it('requires an exact route, with only query text ignored', () => {
    expect(isAgentRequestAllowed('GET', '/api/v1/user?test=1')).toBe(true);
    expect(isAgentRequestAllowed('POST', '/api/v1/user')).toBe(false);
    expect(isAgentRequestAllowed('GET', '/api/v1/user/extra')).toBe(false);
    expect(isAgentRequestAllowed('GET', '/api/v1/projects//explores')).toBe(
        false,
    );
});
