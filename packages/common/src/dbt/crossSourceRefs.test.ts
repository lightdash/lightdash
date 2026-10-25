import {
    CROSS_SOURCE_MODEL_HINT,
    parseMissingDbtNodeReferences,
    withCrossSourceDbtCliHint,
} from './crossSourceRefs';

const missing =
    "Model 'model.consumer.report' depends on a node named 'orders' with version '2' in package or project 'provider' which was not found";

describe('cross-project missing ref hints', () => {
    it('parses and deduplicates qualified versioned refs', () => {
        expect(parseMissingDbtNodeReferences(`${missing}\n${missing}`)).toEqual(
            [{ model: 'orders', packageName: 'provider', version: '2' }],
        );
    });

    it('preserves the original failure and adds actionable local dbt advice', () => {
        expect(withCrossSourceDbtCliHint(missing)).toBe(
            `${missing} ${CROSS_SOURCE_MODEL_HINT} Local dbt commands must resolve cross-project refs before deployment.`,
        );
    });

    it('does not repeat an existing hint', () => {
        const message = withCrossSourceDbtCliHint(missing);
        expect(withCrossSourceDbtCliHint(message)).toBe(message);
    });

    it.each([
        "Model 'model.consumer.report' depends on a node named 'orders' which was not found",
        'Compilation Error: invalid SQL',
    ])('leaves local refs and other errors unchanged: %s', (message) => {
        expect(withCrossSourceDbtCliHint(message)).toBe(message);
    });
});
