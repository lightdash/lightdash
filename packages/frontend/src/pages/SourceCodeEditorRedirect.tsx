import { Navigate, useParams, useSearchParams } from 'react-router';

/**
 * Redirects the old /projects/:projectUuid/source-code route to the project
 * home page with the editor drawer opened via query params.
 *
 * Preserves any branch/file params from the original URL.
 */
const SourceCodeEditorRedirect = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchParams] = useSearchParams();

    // Preserve branch and file params if they exist
    const newParams = new URLSearchParams();
    newParams.set('editor', '1');

    const branch = searchParams.get('branch');
    const file = searchParams.get('file');
    const explore = searchParams.get('explore');

    if (branch) newParams.set('branch', branch);
    if (file) newParams.set('file', file);
    if (explore) newParams.set('explore', explore);

    return (
        <Navigate
            to={`/projects/${projectUuid}/home?${newParams.toString()}`}
            replace
        />
    );
};

export default SourceCodeEditorRedirect;
