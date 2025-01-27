import { ScimService } from './ScimService';
import { ScimServiceArgumentsMock } from './ScimService.mock';

describe('ScimService', () => {
    const service = new ScimService(ScimServiceArgumentsMock);

    describe('convertScimToKnexPagination', () => {
        test('should return correct pagination for valid startIndex multiple of count', () => {
            const result = ScimService.convertScimToKnexPagination(1, 10);
            expect(result).toEqual({ pageSize: 10, page: 1 });
        });

        test('should treat startIndex as 1 if less than 1', () => {
            const result = ScimService.convertScimToKnexPagination(-5, 10);
            expect(result).toEqual({ pageSize: 10, page: 1 });
        });

        test('should return correct pagination for valid startIndex not multiple of count', () => {
            expect(ScimService.convertScimToKnexPagination(11, 10)).toEqual({
                pageSize: 10,
                page: 2,
            });
            expect(ScimService.convertScimToKnexPagination(21, 10)).toEqual({
                pageSize: 10,
                page: 3,
            });
            expect(ScimService.convertScimToKnexPagination(1, 2)).toEqual({
                pageSize: 2,
                page: 1,
            });
            expect(ScimService.convertScimToKnexPagination(3, 2)).toEqual({
                pageSize: 2,
                page: 2,
            });
            expect(ScimService.convertScimToKnexPagination(11, 2)).toEqual({
                pageSize: 2,
                page: 6,
            });
            expect(ScimService.convertScimToKnexPagination(51, 50)).toEqual({
                pageSize: 50,
                page: 2,
            });
            expect(ScimService.convertScimToKnexPagination(101, 50)).toEqual({
                pageSize: 50,
                page: 3,
            });
        });

        test('should throw error for invalid startIndex not multiple of count', () => {
            expect(() =>
                ScimService.convertScimToKnexPagination(2, 10),
            ).toThrow();
            expect(() =>
                ScimService.convertScimToKnexPagination(22, 10),
            ).toThrow();
            expect(() =>
                ScimService.convertScimToKnexPagination(2, 2),
            ).toThrow();
        });
    });
});
