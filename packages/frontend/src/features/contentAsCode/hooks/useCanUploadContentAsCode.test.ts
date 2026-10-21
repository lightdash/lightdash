import { Ability, subject } from '@casl/ability';
import { type PossibleAbilities } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanUploadContentAsCode } from './useCanUploadContentAsCode';

const state = vi.hoisted(() => ({
    authoringEnabled: true,
    project: {
        organizationUuid: 'organization',
        projectUuid: 'project',
        upstreamProjectUuid: 'upstream',
        type: 'PREVIEW',
        createdByUserUuid: 'creator',
    },
}));
let ability = new Ability<PossibleAbilities>([]);
vi.mock('../../../hooks/useProject', () => ({
    useProject: () => ({ data: state.project }),
}));
vi.mock('../../../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => state.authoringEnabled,
}));
vi.mock('../../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ability,
}));

beforeEach(() => {
    state.authoringEnabled = true;
    ability = new Ability<PossibleAbilities>([]);
});

describe('upload availability', () => {
    it('does not recast a project object shared with other permission checks', () => {
        subject('Project', state.project);
        ability = new Ability<PossibleAbilities>([
            { action: 'create', subject: 'ContentAsCode' },
        ]);
        expect(
            renderHook(() => useCanUploadContentAsCode('project')).result
                .current,
        ).toBe(true);
        expect(() => subject('Project', state.project)).not.toThrow();
    });
    it('does not offer uploads with only a content-as-code view grant', () => {
        ability = new Ability<PossibleAbilities>([
            { action: 'view', subject: 'ContentAsCode' },
        ]);
        expect(
            renderHook(() => useCanUploadContentAsCode('project')).result
                .current,
        ).toBe(false);
    });

    it('allows create grants scoped to all preview project conditions', () => {
        ability = new Ability<PossibleAbilities>([
            {
                action: 'create',
                subject: 'ContentAsCode',
                conditions: state.project,
            },
        ]);
        expect(
            renderHook(() => useCanUploadContentAsCode('project')).result
                .current,
        ).toBe(true);
    });

    it('respects the phone authoring restriction', () => {
        state.authoringEnabled = false;
        ability = new Ability<PossibleAbilities>([
            { action: 'manage', subject: 'ContentAsCode' },
        ]);
        expect(
            renderHook(() => useCanUploadContentAsCode('project')).result
                .current,
        ).toBe(false);
    });
});
