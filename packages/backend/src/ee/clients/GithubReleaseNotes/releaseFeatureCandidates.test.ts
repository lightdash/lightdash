import {
    parseCommitFeatureCandidates,
    parseReleaseFeatureCandidates,
} from './releaseFeatureCandidates';

it('takes only bullets under Features headings and strips scope, links and bold', () => {
    const body = `* Ignore the introduction
### Features
* **charts:** add **chart options** ([#31000](https://github.com/lightdash/lightdash/issues/31000)) ([abc1234](https://github.com/lightdash/lightdash/commit/abc1234))
### Bug Fixes
* Fix filters
## Performance
* Faster queries
## Reverts
* Revert charts
## BREAKING CHANGES
* Run migrations
## fEaTuReS
- Add [sharing](https://example.com/docs) and __exports__
# Other heading
* Ignore this too`;
    expect(parseReleaseFeatureCandidates([{ version: '2.2.0', body }])).toEqual(
        [
            {
                id: 'pr-31000',
                version: '2.2.0',
                scope: 'charts',
                text: 'add chart options',
                number: 31000,
                url: 'https://github.com/lightdash/lightdash/pull/31000',
            },
            {
                id: '2.2.0-12',
                version: '2.2.0',
                scope: null,
                text: 'Add sharing and exports',
                number: null,
                url: 'https://github.com/lightdash/lightdash/releases/tag/2.2.0',
            },
        ],
    );
});

it('uses the first repository issue or pull number and never passes foreign URLs through', () => {
    const candidates = parseReleaseFeatureCandidates([
        {
            version: '2.2.0',
            body: `### Features
* Add charts ([#42](https://github.com/lightdash/lightdash/pull/42)) ([#43](https://github.com/lightdash/lightdash/issues/43))
* Foreign issue [#99](https://github.com/other/repo/issues/99)
* Fake host [#100](https://github.com.evil.test/lightdash/lightdash/pull/100)
* Spoofed URL [#101](https://evil.test/https://github.com/lightdash/lightdash/pull/101)
* Link [details](https://example.com/feature)`,
        },
    ]);
    expect(candidates.map(({ number }) => number)).toEqual([
        42,
        null,
        null,
        null,
        null,
    ]);
    expect(candidates.map(({ url }) => url)).toEqual([
        'https://github.com/lightdash/lightdash/pull/42',
        ...Array.from(
            { length: 4 },
            () => 'https://github.com/lightdash/lightdash/releases/tag/2.2.0',
        ),
    ]);
});

it('deduplicates by number, retaining the newest numeric version and stable ids', () => {
    const releases = [
        {
            version: '2.9.0',
            body: '## Features\n* Old ([#1](https://github.com/lightdash/lightdash/issues/1))',
        },
        {
            version: '2.10.0',
            body: '## Features\n* New ([#1](https://github.com/lightdash/lightdash/pull/1))\n* Another feature',
        },
    ];
    const candidates = parseReleaseFeatureCandidates(releases);
    expect(
        candidates.map(({ id, version, text }) => ({ id, version, text })),
    ).toEqual([
        { id: 'pr-1', version: '2.10.0', text: 'New' },
        { id: '2.10.0-2', version: '2.10.0', text: 'Another feature' },
    ]);
    expect(parseReleaseFeatureCandidates(releases)).toEqual(candidates);
});

it('ignores prose, empty bullets and fenced examples', () => {
    expect(
        parseReleaseFeatureCandidates([
            {
                version: '2.2.0',
                body: '```md\n## Features\n* Example\n```\n## Features\nNot a bullet\n* ** **\n### Fixes\n* Fixed',
            },
        ]),
    ).toEqual([]);
});

it('uses only feat first lines and trailing pull numbers for compare fallback', () => {
    const candidates = parseCommitFeatureCandidates(
        [
            'feat(charts): Old option (#1)',
            'fix: A correction (#2)\nfeat: Hidden feature (#3)',
            'perf: Faster query (#4)',
            'feat!: Breaking change (#5)',
            'chore: Maintenance (#6)',
            'feat(charts): New **option** (#1)\nDetails',
            'feat: Share [charts](https://evil.test) (#7)',
            'feat: Export charts',
        ],
        '2.2.0',
    );
    expect(
        candidates.map(({ id, scope, text, number }) => ({
            id,
            scope,
            text,
            number,
        })),
    ).toEqual([
        { id: '2.2.0-0', scope: null, text: 'Export charts', number: null },
        { id: 'pr-7', scope: null, text: 'Share charts', number: 7 },
        { id: 'pr-1', scope: 'charts', text: 'New option', number: 1 },
    ]);
    expect(candidates[1].url).toBe(
        'https://github.com/lightdash/lightdash/pull/7',
    );
});
