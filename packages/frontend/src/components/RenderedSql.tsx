import { Callout, Code, NonIdealState, Pre, Spinner } from '@blueprintjs/core';
import { useCompliedSql } from '../hooks/useCompiledSql';

export const RenderedSql = () => {
    const { data, error, isLoading } = useCompliedSql();

    if (isLoading) {
        return (
            <div style={{ margin: 10 }}>
                <NonIdealState title="Compiling SQL" icon={<Spinner />} />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ margin: 10 }}>
                <Callout intent="danger" title="Compilation error">
                    <p>{error.error.message}</p>
                </Callout>
            </div>
        );
    }

    return (
        <Pre style={{ borderRadius: '0', boxShadow: 'none', overflow: 'auto' }}>
            <Code>{data || ''}</Code>
        </Pre>
    );
};
