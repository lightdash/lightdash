import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ProjectService } from './ProjectService';

class BindingProbe extends ProjectService {
    async resolveWithoutBinding() {
        return this.getWarehouseCredentials(
            // @ts-expect-error
            {
                projectUuid: 'project-uuid',
                userId: 'user-uuid',
                isRegisteredUser: true,
            },
        );
    }
}

const backendSource = path.resolve(__dirname, '../..');

const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
        const fullPath = path.join(directory, entry);
        if (statSync(fullPath).isDirectory()) return sourceFiles(fullPath);
        const isProductionSource =
            fullPath.endsWith('.ts') &&
            !fullPath.endsWith('.test.ts') &&
            !fullPath.endsWith('.mock.ts') &&
            !fullPath.endsWith('.testUtils.ts') &&
            !fullPath.includes(`${path.sep}__tests__${path.sep}`);
        return isProductionSource ? [fullPath] : [];
    });

const SOURCE_SCAN_TIMEOUT_MS = 30_000;

const unroutedCallCount = (source: string) =>
    source.match(/\.getWarehouseCredentialsForProject\(/g)?.length ?? 0;

describe('connection bindings at warehouse credential call sites', () => {
    test('a credential request without a binding does not compile', () => {
        expect(BindingProbe.prototype.resolveWithoutBinding).toBeInstanceOf(
            Function,
        );
    });

    test(
        'only the original-connection paths call the unrouted credential loader',
        () => {
            const unroutedCallers = sourceFiles(backendSource)
                .map((file) => ({
                    file: path.relative(backendSource, file),
                    calls: unroutedCallCount(readFileSync(file, 'utf8')),
                }))
                .filter(({ calls }) => calls > 0);
            expect(unroutedCallers).toEqual([
                { file: 'models/ProjectModel/ProjectModel.ts', calls: 2 },
                { file: 'services/ProjectService/ProjectService.ts', calls: 2 },
                {
                    file: 'services/WarehouseConnectionService/WarehouseConnectionService.ts',
                    calls: 2,
                },
                {
                    file: 'services/WarehouseConnectionSwitchService/WarehouseConnectionSwitchService.ts',
                    calls: 1,
                },
            ]);
        },
        SOURCE_SCAN_TIMEOUT_MS,
    );

    test(
        'only the routing wrapper calls the single-route credential body',
        () => {
            const directCallers = sourceFiles(backendSource)
                .map((file) => ({
                    file: path.relative(backendSource, file),
                    calls:
                        readFileSync(file, 'utf8').match(
                            /\.getSingleRouteWarehouseCredentials\(/g,
                        )?.length ?? 0,
                }))
                .filter(({ calls }) => calls > 0);
            expect(directCallers).toEqual([
                { file: 'services/ProjectService/ProjectService.ts', calls: 1 },
            ]);
        },
        SOURCE_SCAN_TIMEOUT_MS,
    );
});
