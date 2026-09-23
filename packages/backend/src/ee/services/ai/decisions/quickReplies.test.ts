import { describe, expect, it, vi } from 'vitest';
import { findOptionCandidates, selectQuickReplies } from './quickReplies';

const clarification = `There are several revenue metrics:

- **Orders/Payments** – total revenue from payments
- **Subscriptions** – recurring revenue
- **Campaigns** – revenue attributed to marketing

Which of these do you mean?`;

const noul = (value: number) => ({ type: 'noul' as const, noul: value });

describe('findOptionCandidates', () => {
    it('reads listed options with their leading bold label', () => {
        expect(findOptionCandidates(clarification)).toEqual([
            {
                label: 'Orders/Payments',
                prompt: 'Orders/Payments – total revenue from payments',
            },
            {
                label: 'Subscriptions',
                prompt: 'Subscriptions – recurring revenue',
            },
            {
                label: 'Campaigns',
                prompt: 'Campaigns – revenue attributed to marketing',
            },
        ]);
    });

    it('ignores bold text in the middle of an option when labelling it', () => {
        const [first] = findOptionCandidates(
            '- Show the last 5 months **of data actually available**\n- Keep the empty window\n\nWhich would you prefer?',
        );
        expect(first.label).toBe('Show the last 5 months of data actually…');
    });

    it('needs a question and at least two list items', () => {
        expect(findOptionCandidates(clarification.replace('?', '.'))).toEqual(
            [],
        );
        expect(findOptionCandidates('- only one\n\nWhich one?')).toEqual([]);
    });
});

describe('selectQuickReplies', () => {
    it('offers only the options JEV identifies as the choices asked about', async () => {
        const evaluate = vi.fn().mockResolvedValue({
            clarifying: noul(0.97),
            option0: noul(0.95),
            option1: noul(0.9),
            option2: noul(0.2),
        });
        await expect(
            selectQuickReplies({
                decisions: { evaluate },
                question: 'whats our revenue?',
                response: clarification,
            }),
        ).resolves.toEqual([
            {
                label: 'Orders/Payments',
                prompt: 'Orders/Payments – total revenue from payments',
            },
            {
                label: 'Subscriptions',
                prompt: 'Subscriptions – recurring revenue',
            },
        ]);
    });

    it('offers nothing for an answer that only ends with a follow-up offer', async () => {
        const evaluate = vi.fn().mockResolvedValue({
            clarifying: noul(0.96),
            option0: noul(0.1),
            option1: noul(0.2),
            option2: noul(0.1),
        });
        await expect(
            selectQuickReplies({
                decisions: { evaluate },
                question: 'revenue last year?',
                response: clarification,
            }),
        ).resolves.toEqual([]);
    });

    it('skips the JEV call when the reply has no options', async () => {
        const evaluate = vi.fn();
        await expect(
            selectQuickReplies({
                decisions: { evaluate },
                question: 'hi',
                response: 'Hello! How can I help?',
            }),
        ).resolves.toEqual([]);
        expect(evaluate).not.toHaveBeenCalled();
    });
});
