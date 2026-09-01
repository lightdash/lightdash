import { ParameterError } from '../errors';
import { getContentAsCodeFilePath, normalizeContentAsCodePath } from './base';
import {
    classifyContentAsCodeFilePath,
    joinContentAsCodePath,
} from './fileDiscovery';

describe('normalizeContentAsCodePath', () => {
    it('strips dot segments and surrounding slashes', () => {
        expect(normalizeContentAsCodePath('lightdash')).toBe('lightdash');
        expect(normalizeContentAsCodePath('./analytics/content/')).toBe(
            'analytics/content',
        );
        expect(normalizeContentAsCodePath(' analytics//content ')).toBe(
            'analytics/content',
        );
        expect(normalizeContentAsCodePath('analytics\\content')).toBe(
            'analytics/content',
        );
    });

    it('treats the project directory itself as an empty path', () => {
        expect(normalizeContentAsCodePath('.')).toBe('');
        expect(normalizeContentAsCodePath('')).toBe('');
    });

    it('rejects absolute paths and parent traversal', () => {
        expect(() => normalizeContentAsCodePath('/srv/lightdash')).toThrow(
            ParameterError,
        );
        expect(() => normalizeContentAsCodePath('../shared')).toThrow(
            ParameterError,
        );
        expect(() => normalizeContentAsCodePath('a/../../b')).toThrow(
            ParameterError,
        );
    });
});

describe('classifyContentAsCodeFilePath', () => {
    it('classifies by parent folder at any depth and skips space and language files', () => {
        expect(classifyContentAsCodeFilePath('lightdash/charts/a.yml')).toEqual(
            { kind: 'content', contentType: 'chart', supportedExtension: true },
        );
        expect(
            classifyContentAsCodeFilePath(
                'lightdash/proj/space/dashboards/b.yml',
            ),
        ).toEqual({
            kind: 'content',
            contentType: 'dashboard',
            supportedExtension: true,
        });
        expect(classifyContentAsCodeFilePath('lightdash/kpis.yml')).toEqual({
            kind: 'loose',
            supportedExtension: true,
        });
        expect(
            classifyContentAsCodeFilePath('lightdash/charts/a.yaml'),
        ).toEqual({
            kind: 'content',
            contentType: 'chart',
            supportedExtension: false,
        });
        expect(
            classifyContentAsCodeFilePath('lightdash/sales.space.yml'),
        ).toBeUndefined();
        expect(
            classifyContentAsCodeFilePath('lightdash/fr.language.map.yml'),
        ).toBeUndefined();
        expect(classifyContentAsCodeFilePath('README.md')).toBeUndefined();
    });
});

describe('joinContentAsCodePath', () => {
    it('drops empty segments and stray slashes', () => {
        expect(joinContentAsCodePath('/', 'lightdash', 'charts/')).toBe(
            'lightdash/charts',
        );
        expect(joinContentAsCodePath('', '', 'a.yml')).toBe('a.yml');
        expect(joinContentAsCodePath()).toBe('');
    });
});

describe('getContentAsCodeFilePath', () => {
    it('places charts and dashboards under their type folder', () => {
        expect(getContentAsCodeFilePath('lightdash', 'chart', 'revenue')).toBe(
            'lightdash/charts/revenue.yml',
        );
        expect(
            getContentAsCodeFilePath('analytics/content', 'dashboard', 'kpis'),
        ).toBe('analytics/content/dashboards/kpis.yml');
    });

    it('keeps files at the project root for an empty path', () => {
        expect(getContentAsCodeFilePath('', 'chart', 'revenue')).toBe(
            'charts/revenue.yml',
        );
    });
});
