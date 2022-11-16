import { getTemplatedUrlRowDependencies, renderTemplatedUrl } from './template';
import {
    rowMock,
    templateWithFormattedValueReference,
    templateWithInvalidReference,
    templateWithMultipleRowReferences,
    templateWithRawValueReference,
    templateWithRowReference,
    templateWithRowReferenceAndInvalidReference,
    valueMock,
} from './template.mock';

describe('template', () => {
    it('Render valid templates', () => {
        expect(
            renderTemplatedUrl(
                templateWithRawValueReference.template,
                valueMock,
                rowMock,
            ),
        ).toBe(templateWithRawValueReference.expectedUrl);
        expect(
            renderTemplatedUrl(
                templateWithFormattedValueReference.template,
                valueMock,
                rowMock,
            ),
        ).toBe(templateWithFormattedValueReference.expectedUrl);
        expect(
            renderTemplatedUrl(
                templateWithRowReference.template,
                valueMock,
                rowMock,
            ),
        ).toBe(templateWithRowReference.expectedUrl);
        expect(
            renderTemplatedUrl(
                templateWithMultipleRowReferences.template,
                valueMock,
                rowMock,
            ),
        ).toBe(templateWithMultipleRowReferences.expectedUrl);
    });
    it('Get row dependencies from valid templates', () => {
        expect(
            getTemplatedUrlRowDependencies(
                templateWithRawValueReference.template,
            ),
        ).toStrictEqual(templateWithRawValueReference.expectedRowReferences);
        expect(
            getTemplatedUrlRowDependencies(
                templateWithFormattedValueReference.template,
            ),
        ).toStrictEqual(
            templateWithFormattedValueReference.expectedRowReferences,
        );
        expect(
            getTemplatedUrlRowDependencies(templateWithRowReference.template),
        ).toStrictEqual(templateWithRowReference.expectedRowReferences);
        expect(
            getTemplatedUrlRowDependencies(
                templateWithMultipleRowReferences.template,
            ),
        ).toStrictEqual(
            templateWithMultipleRowReferences.expectedRowReferences,
        );
    });
    it('Throw error when template has invalid reference', () => {
        expect(() =>
            getTemplatedUrlRowDependencies(
                templateWithInvalidReference.template,
            ),
        ).toThrow(templateWithInvalidReference.expectedError);
        expect(() =>
            getTemplatedUrlRowDependencies(
                templateWithRowReferenceAndInvalidReference.template,
            ),
        ).toThrow(templateWithRowReferenceAndInvalidReference.expectedError);
    });
});
