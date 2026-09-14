import { getSimilarityNameWords } from './ContentSimilarity';

describe('getSimilarityNameWords', () => {
    it.each([
        ['Weekly revenue by region', ['revenue', 'region']],
        ['Revenue REVENUE revenue!', ['revenue']],
        ['MRR_USD', ['mrr', 'usd']],
        ['Résumé des ventes', ['résumé', 'des', 'ventes']],
        ['売上 月次', ['売上', '月次']],
        ['Monthly report', []],
        ['!!!', []],
        ['', []],
    ])('extracts meaningful name words from %s', (name, expected) => {
        expect(getSimilarityNameWords(name)).toEqual(expected);
    });
});
