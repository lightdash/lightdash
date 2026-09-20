import {
    describeLearnWorkspaceYamlError,
    validateLearnWorkspaceYaml,
} from './learnSandbox';

describe('validateLearnWorkspaceYaml', () => {
    it('accepts a model file', () => {
        expect(
            validateLearnWorkspaceYaml(
                'models:\n  - name: a\n    columns:\n      - name: id\n',
            ),
        ).toBeNull();
    });

    it('names the line of a stray word between mapping items', () => {
        const message = validateLearnWorkspaceYaml(
            'columns:\n  - name: id\n  oops\n    description: x\n',
        );
        expect(message).not.toBeNull();
        expect(describeLearnWorkspaceYamlError(message!)).toMatch(
            /^Fix the YAML error on line \d+ to continue$/,
        );
    });

    it('falls back to a plain sentence when the parser names no line', () => {
        expect(describeLearnWorkspaceYamlError('Invalid YAML')).toBe(
            'Fix the YAML error to continue',
        );
    });
});
