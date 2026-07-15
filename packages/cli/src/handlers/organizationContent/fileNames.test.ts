import { createHash } from 'crypto';
import { getOrganizationContentFileNames } from './fileNames';

describe('organization content filenames', () => {
    it('uses generateSlug with normalized accents', () => {
        expect(
            getOrganizationContentFileNames({
                values: ['Málaga Finance'],
                fallbackPrefix: 'group',
            }),
        ).toStrictEqual(['malaga-finance.yml']);
    });

    it('uses a deterministic hash when no slug can be generated', () => {
        const value = '🎉';
        const hash = createHash('sha256')
            .update(value)
            .digest('hex')
            .slice(0, 8);

        expect(
            getOrganizationContentFileNames({
                values: [value],
                fallbackPrefix: 'group',
            }),
        ).toStrictEqual([`group-${hash}.yml`]);
    });

    it('adds stable hashes when different values generate the same slug', () => {
        const values = ['Finance?', 'Finance!'];

        expect(
            getOrganizationContentFileNames({
                values,
                fallbackPrefix: 'group',
            }),
        ).toStrictEqual(
            values.map((value) => {
                const hash = createHash('sha256')
                    .update(value)
                    .digest('hex')
                    .slice(0, 8);
                return `finance-${hash}.yml`;
            }),
        );
    });
});
