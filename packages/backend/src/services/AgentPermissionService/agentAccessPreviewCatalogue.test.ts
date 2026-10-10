import { AGENT_ACCESS_PREVIEW_ACTIONS } from '@lightdash/common';
import { getRequiredAgentCapabilities } from '../../auth/agentPermissions/capabilityMap';
import {
    AGENT_ACCESS_PREVIEW_BINDINGS,
    getAgentAccessPreviewCapabilities,
} from './agentAccessPreviewCatalogue';
import { PERSON_PERMISSION_PREVIEWS } from './personPermissionPreview';

test('every public action has a policy binding and a person predicate', () => {
    const ids = AGENT_ACCESS_PREVIEW_ACTIONS.map(({ id }) => id);
    expect(Object.keys(AGENT_ACCESS_PREVIEW_BINDINGS).sort()).toEqual(
        [...ids].sort(),
    );
    expect(Object.keys(PERSON_PERMISSION_PREVIEWS).sort()).toEqual(
        [...ids].sort(),
    );
    for (const id of ids) {
        const binding = AGENT_ACCESS_PREVIEW_BINDINGS[id];
        if (binding.type === 'operation') {
            const required = getRequiredAgentCapabilities(
                binding.kind === 'rest_operation' ? 'rest' : 'mcp',
                binding.key,
            );
            expect(required).not.toBeNull();
            expect(getAgentAccessPreviewCapabilities(id)).toEqual(required);
        } else {
            expect(getAgentAccessPreviewCapabilities(id)).toEqual([
                binding.capability,
            ]);
        }
    }
});
