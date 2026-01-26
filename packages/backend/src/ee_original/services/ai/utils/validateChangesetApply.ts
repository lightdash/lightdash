import { ChangeBase, ChangesetUtils, Explore } from '@lightdash/common';

export const validateChangesetApplyChange = (
    change: ChangeBase,
    explores: Record<string, Explore>,
) => {
    ChangesetUtils.applyChangeset({ changes: [change] }, explores);
};
