import { type CachedReleaseHighlights } from '../../models/ReleaseHighlightsModel';
import { buildHighlights } from './buildHighlights';

const cached: CachedReleaseHighlights = {
    fromVersion: '2.1.0',
    toVersion: '2.2.0',
    generatedAt: new Date('2026-10-14'),
    candidates: Array.from({ length: 10 }, (_, index) => ({
        id: `pr-${index + 1}`,
        version: `2.1.${index + 1}`,
        scope: null,
        text: `Feature ${index + 1}`,
        number: index + 1,
        url: `https://github.com/lightdash/lightdash/pull/${index + 1}`,
    })),
    ranked: Array.from({ length: 10 }, (_, index) => ({
        candidateId: `pr-${index + 1}`,
        title: `Feature ${index + 1}`,
        benefit: `Benefit ${index + 1}`,
    })),
};

it('joins ranked text to candidates and returns the top five with no organization matches', () => {
    const highlights = buildHighlights(cached, new Set());
    expect(highlights.map(({ title }) => title)).toEqual([
        'Feature 1',
        'Feature 2',
        'Feature 3',
        'Feature 4',
        'Feature 5',
    ]);
    expect(highlights[0]).toEqual({
        title: 'Feature 1',
        benefit: 'Benefit 1',
        version: '2.1.1',
        url: 'https://github.com/lightdash/lightdash/pull/1',
        requestedByYourOrganization: false,
    });
    expect(highlights.every((item) => !item.requestedByYourOrganization)).toBe(
        true,
    );
});

it('puts matches first with stable ranked order within both groups, capped at five', () => {
    const highlights = buildHighlights(cached, new Set([8, 6]));
    expect(highlights.map(({ title }) => title)).toEqual([
        'Feature 6',
        'Feature 8',
        'Feature 1',
        'Feature 2',
        'Feature 3',
    ]);
    expect(
        highlights.map(
            ({ requestedByYourOrganization }) => requestedByYourOrganization,
        ),
    ).toEqual([true, true, false, false, false]);
    expect(
        buildHighlights(cached, new Set([10, 9, 8, 7, 6, 5])).map(
            ({ title }) => title,
        ),
    ).toEqual([
        'Feature 5',
        'Feature 6',
        'Feature 7',
        'Feature 8',
        'Feature 9',
    ]);
    expect(cached.ranked[0].candidateId).toBe('pr-1');
});

it('drops missing and duplicate candidates and handles candidates without numbers', () => {
    const data = {
        ...cached,
        candidates: [{ ...cached.candidates[0], number: null }],
        ranked: [cached.ranked[1], cached.ranked[0], cached.ranked[0]],
    };
    expect(buildHighlights(data, new Set([1]))).toHaveLength(1);
    expect(
        buildHighlights(data, new Set([1]))[0].requestedByYourOrganization,
    ).toBe(false);
    expect(buildHighlights({ ...cached, ranked: [] }, new Set())).toEqual([]);
});
