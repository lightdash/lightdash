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
        relatedNumbers: [index + 1],
        url: `https://github.com/lightdash/lightdash/pull/${index + 1}`,
    })),
    ranked: Array.from({ length: 10 }, (_, index) => ({
        candidateId: `pr-${index + 1}`,
        title: `Feature ${index + 1}`,
        benefit: `Benefit ${index + 1}`,
    })),
};

it('joins ranked text to candidates and returns the top five with no organization matches', () => {
    const highlights = buildHighlights(cached, []);
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
    const highlights = buildHighlights(cached, [
        { title: 'Requested feature', numbers: [8, 6] },
    ]);
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
        buildHighlights(cached, [
            { title: 'Requested feature', numbers: [10, 9, 8, 7, 6, 5] },
        ]).map(({ title }) => title),
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
        candidates: [
            { ...cached.candidates[0], number: null, relatedNumbers: [] },
        ],
        ranked: [cached.ranked[1], cached.ranked[0], cached.ranked[0]],
    };
    expect(
        buildHighlights(data, [{ title: 'Requested feature', numbers: [1] }]),
    ).toHaveLength(1);
    expect(
        buildHighlights(data, [{ title: 'Requested feature', numbers: [1] }])[0]
            .requestedByYourOrganization,
    ).toBe(false);
    expect(buildHighlights({ ...cached, ranked: [] }, [])).toEqual([]);
});

it('promotes a related issue match and uses AI copy before fallback candidates', () => {
    const data = {
        ...cached,
        candidates: cached.candidates.map((candidate, index) => ({
            ...candidate,
            relatedNumbers: [100 + index],
        })),
        ranked: [cached.ranked[1], cached.ranked[0]],
    };
    const result = buildHighlights(data, [
        { title: 'Requested export', numbers: [100, 102, 103] },
    ]);
    expect(result.map((item) => item.title)).toEqual([
        'Feature 1',
        'Requested export',
        'Requested export',
        'Feature 2',
    ]);
    expect(result.map((item) => item.benefit)).toEqual([
        'Benefit 1',
        'Feature 3',
        'Feature 4',
        'Benefit 2',
    ]);
    expect(result.map((item) => item.requestedByYourOrganization)).toEqual([
        true,
        true,
        true,
        false,
    ]);
});

it('deduplicates fallback candidates and caps their capitalized benefits at 200 characters', () => {
    const candidate = {
        ...cached.candidates[0],
        text: `export ${'a'.repeat(250)}`,
    };
    const data = { ...cached, candidates: [candidate, candidate], ranked: [] };
    const result = buildHighlights(data, [
        { title: 'Requested export', numbers: [1] },
        { title: 'Duplicate request', numbers: [1] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Requested export');
    expect(result[0].benefit).toBe(`Export ${'a'.repeat(193)}`);
    expect(candidate.text).toMatch(/^export/);
});

it('matches the primary number even when related numbers are empty', () => {
    const data = {
        ...cached,
        candidates: [{ ...cached.candidates[0], relatedNumbers: [] }],
    };
    expect(
        buildHighlights(data, [{ title: 'Exports', numbers: [1] }])[0]
            .requestedByYourOrganization,
    ).toBe(true);
});
