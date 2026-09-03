import {
    isToolDataAppBuildResult,
    isToolIterateDataAppResult,
} from './toolIterateDataAppArgs';

const pendingResult = (toolName: string) => ({
    toolType: 'built-in',
    toolName,
    metadata: { status: 'pending', appUuid: 'app-1', version: 2 },
});

describe('data app build result guards', () => {
    it('matches an iterateDataApp result', () => {
        expect(
            isToolIterateDataAppResult(pendingResult('iterateDataApp')),
        ).toBe(true);
        expect(
            isToolIterateDataAppResult(pendingResult('generateDataApp')),
        ).toBe(false);
    });

    it('drives the build card from either tool name', () => {
        expect(isToolDataAppBuildResult(pendingResult('generateDataApp'))).toBe(
            true,
        );
        expect(isToolDataAppBuildResult(pendingResult('iterateDataApp'))).toBe(
            true,
        );
        expect(isToolDataAppBuildResult(pendingResult('editDbtProject'))).toBe(
            false,
        );
    });

    it('rejects metadata that does not parse as a build outcome', () => {
        expect(
            isToolDataAppBuildResult({
                toolType: 'built-in',
                toolName: 'iterateDataApp',
                metadata: { status: 'nonsense' },
            }),
        ).toBe(false);
    });
});
