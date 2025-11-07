import { getLeastSimilar } from './getLeastSimilar';

const idfn = <T>(x: T) => x;

describe('getLeastSimilar', () => {
    it('should return the least similar items', () => {
        const items = [
            'zatto',
            'catto',
            'gatto',
            'bird',
            'dog',
            'wolf',
            'batto',
        ];
        const result = getLeastSimilar(items, idfn, 4);
        expect(result).not.toContain(['catto', 'gatto']);
    });

    it('should diversify similar real questions', () => {
        const questions = [
            'How have unique order volumes by shipping method changed each month over time?',
            'How have unique order counts and total order amounts changed each month over time?',
            'What is the total revenue and unique payment count for each payment method?',
            'What is the average payment amount for each payment method?',
            'What is the average payment amount for each payment method?',
            'How have unique order counts and total order amounts changed by month over time?',
            'How have unique order counts and total order amounts changed each month over time?',
            'How have unique order counts and total order amounts changed each month over time?',
        ];

        const result = getLeastSimilar(questions, idfn, 3);

        expect(result).toEqual([
            'How have unique order volumes by shipping method changed each month over time?',
            'What is the total revenue and unique payment count for each payment method?',
            'How have unique order counts and total order amounts changed by month over time?',
        ]);
    });
});
