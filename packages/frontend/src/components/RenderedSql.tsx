import { Callout, NonIdealState, Spinner } from '@blueprintjs/core';
import { Prism } from '@mantine/prism';
import { useCompiledSql } from '../hooks/useCompiledSql';

export const RenderedSql = () => {
    const { data, error, isLoading } = useCompiledSql();

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
        <Prism m="sm" language="sql">
            {data || ''}
        </Prism>
    );
};
