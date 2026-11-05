export const MANAGED_BY_CODE_LABEL = 'Managed by Content as Code';

// data-disabled keeps hover events so the tooltip can still say why.
export const getGitBackedActionProps = (managed: boolean) => ({
    'data-disabled': managed || undefined,
});
