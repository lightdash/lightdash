import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
    path.join(__dirname, 'sqlRunnerConnectionsController.ts'),
    'utf8',
);

const middlewaresBefore = (route: string): string => {
    const routeIndex = source.indexOf(route);
    const middlewaresIndex = source.lastIndexOf('@Middlewares(', routeIndex);
    return source.slice(middlewaresIndex, routeIndex);
};

describe('SqlRunnerConnectionsController', () => {
    test.each([
        "@Post('/{warehouseConnectionUuid}/refresh-catalog')",
        "@Get('/{warehouseConnectionUuid}/fields')",
    ])('%s is refused in the demo', (route) => {
        expect(source).toContain(route);
        expect(middlewaresBefore(route)).toContain('unauthorisedInDemo');
    });
});
