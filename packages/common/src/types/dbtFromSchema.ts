/**
 * WritableManifest(metadata: dbt.contracts.graph.manifest.ManifestMetadata, nodes: Mapping[str, Union[dbt.contracts.graph.compiled.CompiledAnalysisNode, dbt.contracts.graph.compiled.CompiledSingularTestNode, dbt.contracts.graph.compiled.CompiledModelNode, dbt.contracts.graph.compiled.CompiledHookNode, dbt.contracts.graph.compiled.CompiledRPCNode, dbt.contracts.graph.compiled.CompiledSqlNode, dbt.contracts.graph.compiled.CompiledGenericTestNode, dbt.contracts.graph.compiled.CompiledSeedNode, dbt.contracts.graph.compiled.CompiledSnapshotNode, dbt.contracts.graph.parsed.ParsedAnalysisNode, dbt.contracts.graph.parsed.ParsedSingularTestNode, dbt.contracts.graph.parsed.ParsedHookNode, dbt.contracts.graph.parsed.ParsedModelNode, dbt.contracts.graph.parsed.ParsedRPCNode, dbt.contracts.graph.parsed.ParsedSqlNode, dbt.contracts.graph.parsed.ParsedGenericTestNode, dbt.contracts.graph.parsed.ParsedSeedNode, dbt.contracts.graph.parsed.ParsedSnapshotNode]], sources: Mapping[str, dbt.contracts.graph.parsed.ParsedSourceDefinition], macros: Mapping[str, dbt.contracts.graph.parsed.ParsedMacro], docs: Mapping[str, dbt.contracts.graph.parsed.ParsedDocumentation], exposures: Mapping[str, dbt.contracts.graph.parsed.ParsedExposure], metrics: Mapping[str, dbt.contracts.graph.parsed.ParsedMetric], selectors: Mapping[str, Any], disabled: Optional[Mapping[str, List[Union[dbt.contracts.graph.compiled.CompiledAnalysisNode, dbt.contracts.graph.compiled.CompiledSingularTestNode, dbt.contracts.graph.compiled.CompiledModelNode, dbt.contracts.graph.compiled.CompiledHookNode, dbt.contracts.graph.compiled.CompiledRPCNode, dbt.contracts.graph.compiled.CompiledSqlNode, dbt.contracts.graph.compiled.CompiledGenericTestNode, dbt.contracts.graph.compiled.CompiledSeedNode, dbt.contracts.graph.compiled.CompiledSnapshotNode, dbt.contracts.graph.parsed.ParsedAnalysisNode, dbt.contracts.graph.parsed.ParsedSingularTestNode, dbt.contracts.graph.parsed.ParsedHookNode, dbt.contracts.graph.parsed.ParsedModelNode, dbt.contracts.graph.parsed.ParsedRPCNode, dbt.contracts.graph.parsed.ParsedSqlNode, dbt.contracts.graph.parsed.ParsedGenericTestNode, dbt.contracts.graph.parsed.ParsedSeedNode, dbt.contracts.graph.parsed.ParsedSnapshotNode, dbt.contracts.graph.parsed.ParsedSourceDefinition]]]], parent_map: Optional[Dict[str, List[str]]], child_map: Optional[Dict[str, List[str]]])
 */
export interface MySchema {
    /**
     * Metadata about the manifest
     */
    metadata: {
        dbt_schema_version?: string;
        dbt_version?: string;
        generated_at?: string;
        invocation_id?: string | null;
        env?: {
            [k: string]: string;
        };
        /**
         * A unique identifier for the project
         */
        project_id?: string | null;
        /**
         * A unique identifier for the user
         */
        user_id?: string | null;
        /**
         * Whether dbt is configured to send anonymous usage statistics
         */
        send_anonymous_usage_stats?: boolean | null;
        /**
         * The type name of the adapter
         */
        adapter_type?: string | null;
    };
    /**
     * The nodes defined in the dbt project and its dependencies
     */
    nodes: {
        [k: string]:
            | CompiledAnalysisNode
            | CompiledSingularTestNode
            | CompiledModelNode
            | CompiledHookNode
            | CompiledRPCNode
            | CompiledSqlNode
            | CompiledGenericTestNode
            | CompiledSeedNode
            | CompiledSnapshotNode
            | ParsedAnalysisNode
            | ParsedSingularTestNode
            | ParsedHookNode
            | ParsedModelNode
            | ParsedRPCNode
            | ParsedSqlNode
            | ParsedGenericTestNode
            | ParsedSeedNode
            | ParsedSnapshotNode;
    };
    /**
     * The sources defined in the dbt project and its dependencies
     */
    sources: {
        [k: string]: ParsedSourceDefinition;
    };
    /**
     * The macros defined in the dbt project and its dependencies
     */
    macros: {
        [k: string]: ParsedMacro;
    };
    /**
     * The docs defined in the dbt project and its dependencies
     */
    docs: {
        [k: string]: ParsedDocumentation;
    };
    /**
     * The exposures defined in the dbt project and its dependencies
     */
    exposures: {
        [k: string]: ParsedExposure;
    };
    /**
     * The metrics defined in the dbt project and its dependencies
     */
    metrics: {
        [k: string]: ParsedMetric;
    };
    /**
     * The selectors defined in selectors.yml
     */
    selectors: {
        [k: string]: unknown;
    };
    /**
     * A mapping of the disabled nodes in the target
     */
    disabled?: {
        [k: string]: (
            | CompiledAnalysisNode
            | CompiledSingularTestNode
            | CompiledModelNode
            | CompiledHookNode
            | CompiledRPCNode
            | CompiledSqlNode
            | CompiledGenericTestNode
            | CompiledSeedNode
            | CompiledSnapshotNode
            | ParsedAnalysisNode
            | ParsedSingularTestNode
            | ParsedHookNode
            | ParsedModelNode
            | ParsedRPCNode
            | ParsedSqlNode
            | ParsedGenericTestNode
            | ParsedSeedNode
            | ParsedSnapshotNode
            | ParsedSourceDefinition
        )[];
    } | null;
    /**
     * A mapping from child nodes to their dependencies
     */
    parent_map?: {
        [k: string]: string[];
    } | null;
    /**
     * A mapping from parent nodes to their dependents
     */
    child_map?: {
        [k: string]: string[];
    } | null;
}
/**
 * CompiledAnalysisNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None)
 */
export interface CompiledAnalysisNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'analysis';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
}
/**
 * FileHash(name: str, checksum: str)
 */
export interface FileHash {
    name: string;
    checksum: string;
}
/**
 * Hook(sql: str, transaction: bool = True, index: Optional[int] = None)
 */
export interface Hook {
    sql: string;
    transaction?: boolean;
    index?: number | null;
}
/**
 * ColumnInfo(name: str, description: str = '', meta: Dict[str, Any] = <factory>, data_type: Optional[str] = None, quote: Optional[bool] = None, tags: List[str] = <factory>, _extra: Dict[str, Any] = <factory>)
 */
export interface ColumnInfo {
    name: string;
    description?: string;
    meta?: {
        [k: string]: unknown;
    };
    data_type?: string | null;
    quote?: boolean | null;
    tags?: string[];
    [k: string]: unknown;
}
/**
 * InjectedCTE(id: str, sql: str)
 */
export interface InjectedCTE {
    id: string;
    sql: string;
}
/**
 * CompiledSingularTestNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.TestConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None)
 */
export interface CompiledSingularTestNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'test';
    alias: string;
    checksum: FileHash;
    /**
     * TestConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = 'dbt_test__audit', database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'test', severity: dbt.contracts.graph.model_config.Severity = 'ERROR', store_failures: Optional[bool] = None, where: Optional[str] = None, limit: Optional[int] = None, fail_calc: str = 'count(*)', warn_if: str = '!= 0', error_if: str = '!= 0')
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        severity?: string;
        store_failures?: boolean | null;
        where?: string | null;
        limit?: number | null;
        fail_calc?: string;
        warn_if?: string;
        error_if?: string;
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
}
/**
 * CompiledModelNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None)
 */
export interface CompiledModelNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'model';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
}
/**
 * CompiledHookNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None, index: Optional[int] = None)
 */
export interface CompiledHookNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'operation';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
    index?: number | null;
}
/**
 * CompiledRPCNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None)
 */
export interface CompiledRPCNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'rpc';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
}
/**
 * CompiledSqlNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None)
 */
export interface CompiledSqlNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'sql operation';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
}
/**
 * CompiledGenericTestNode(test_metadata: dbt.contracts.graph.parsed.TestMetadata, compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.TestConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None, column_name: Optional[str] = None, file_key_name: Optional[str] = None)
 */
export interface CompiledGenericTestNode {
    test_metadata: TestMetadata;
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'test';
    alias: string;
    checksum: FileHash;
    /**
     * TestConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = 'dbt_test__audit', database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'test', severity: dbt.contracts.graph.model_config.Severity = 'ERROR', store_failures: Optional[bool] = None, where: Optional[str] = None, limit: Optional[int] = None, fail_calc: str = 'count(*)', warn_if: str = '!= 0', error_if: str = '!= 0')
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        severity?: string;
        store_failures?: boolean | null;
        where?: string | null;
        limit?: number | null;
        fail_calc?: string;
        warn_if?: string;
        error_if?: string;
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
    column_name?: string | null;
    file_key_name?: string | null;
}
/**
 * TestMetadata(name: str, kwargs: Dict[str, Any] = <factory>, namespace: Optional[str] = None)
 */
export interface TestMetadata {
    name: string;
    kwargs?: {
        [k: string]: unknown;
    };
    namespace?: string | null;
}
/**
 * CompiledSeedNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.SeedConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None)
 */
export interface CompiledSeedNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'seed';
    alias: string;
    checksum: FileHash;
    /**
     * SeedConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'seed', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, quote_columns: Optional[bool] = None)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        quote_columns?: boolean | null;
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
}
/**
 * CompiledSnapshotNode(compiled: bool, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, compiled_code: Optional[str] = None, extra_ctes_injected: bool = False, extra_ctes: List[dbt.contracts.graph.compiled.InjectedCTE] = <factory>, relation_name: Optional[str] = None, _pre_injected_sql: Optional[str] = None)
 */
export interface CompiledSnapshotNode {
    compiled: boolean;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'snapshot';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    compiled_code?: string | null;
    extra_ctes_injected?: boolean;
    extra_ctes?: InjectedCTE[];
    relation_name?: string | null;
}
/**
 * ParsedAnalysisNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>)
 */
export interface ParsedAnalysisNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'analysis';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
}
/**
 * ParsedSingularTestNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.TestConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>)
 */
export interface ParsedSingularTestNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'test';
    alias: string;
    checksum: FileHash;
    /**
     * TestConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = 'dbt_test__audit', database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'test', severity: dbt.contracts.graph.model_config.Severity = 'ERROR', store_failures: Optional[bool] = None, where: Optional[str] = None, limit: Optional[int] = None, fail_calc: str = 'count(*)', warn_if: str = '!= 0', error_if: str = '!= 0')
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        severity?: string;
        store_failures?: boolean | null;
        where?: string | null;
        limit?: number | null;
        fail_calc?: string;
        warn_if?: string;
        error_if?: string;
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
}
/**
 * ParsedHookNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, index: Optional[int] = None)
 */
export interface ParsedHookNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'operation';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    index?: number | null;
}
/**
 * ParsedModelNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>)
 */
export interface ParsedModelNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'model';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
}
/**
 * ParsedRPCNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>)
 */
export interface ParsedRPCNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'rpc';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
}
/**
 * ParsedSqlNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.NodeConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>)
 */
export interface ParsedSqlNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'sql operation';
    alias: string;
    checksum: FileHash;
    /**
     * NodeConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'view', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
}
/**
 * ParsedGenericTestNode(test_metadata: dbt.contracts.graph.parsed.TestMetadata, database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.TestConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>, column_name: Optional[str] = None, file_key_name: Optional[str] = None)
 */
export interface ParsedGenericTestNode {
    test_metadata: TestMetadata;
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'test';
    alias: string;
    checksum: FileHash;
    /**
     * TestConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = 'dbt_test__audit', database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'test', severity: dbt.contracts.graph.model_config.Severity = 'ERROR', store_failures: Optional[bool] = None, where: Optional[str] = None, limit: Optional[int] = None, fail_calc: str = 'count(*)', warn_if: str = '!= 0', error_if: str = '!= 0')
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        severity?: string;
        store_failures?: boolean | null;
        where?: string | null;
        limit?: number | null;
        fail_calc?: string;
        warn_if?: string;
        error_if?: string;
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
    column_name?: string | null;
    file_key_name?: string | null;
}
/**
 * ParsedSeedNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.SeedConfig = <factory>, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>)
 */
export interface ParsedSeedNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'seed';
    alias: string;
    checksum: FileHash;
    /**
     * SeedConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'seed', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Union[str, List[str], NoneType] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, quote_columns: Optional[bool] = None)
     */
    config?: {
        enabled?: boolean;
        alias?: string | null;
        schema?: string | null;
        database?: string | null;
        tags?: string[] | string;
        meta?: {
            [k: string]: unknown;
        };
        materialized?: string;
        incremental_strategy?: string | null;
        persist_docs?: {
            [k: string]: unknown;
        };
        'post-hook'?: Hook[];
        'pre-hook'?: Hook[];
        quoting?: {
            [k: string]: unknown;
        };
        column_types?: {
            [k: string]: unknown;
        };
        full_refresh?: boolean | null;
        unique_key?: string | string[] | null;
        on_schema_change?: string | null;
        grants?: {
            [k: string]: unknown;
        };
        packages?: string[];
        /**
         * Docs(show: bool = True, node_color: Optional[str] = None)
         */
        docs?: {
            show?: boolean;
            node_color?: string | null;
        };
        quote_columns?: boolean | null;
        [k: string]: unknown;
    };
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
}
/**
 * ParsedSnapshotNode(database: Optional[str], schema: str, fqn: List[str], unique_id: str, raw_code: str, language: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, resource_type: dbt.node_types.NodeType, alias: str, checksum: dbt.contracts.files.FileHash, config: dbt.contracts.graph.model_config.SnapshotConfig, _event_status: Dict[str, Any] = <factory>, tags: List[str] = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, compiled_path: Optional[str] = None, build_path: Optional[str] = None, deferred: bool = False, unrendered_config: Dict[str, Any] = <factory>, created_at: float = <factory>, config_call_dict: Dict[str, Any] = <factory>)
 */
export interface ParsedSnapshotNode {
    database?: string | null;
    schema: string;
    fqn: string[];
    unique_id: string;
    raw_code: string;
    language: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    resource_type: 'snapshot';
    alias: string;
    checksum: FileHash;
    config: SnapshotConfig;
    tags?: string[];
    refs?: string[][];
    sources?: string[][];
    metrics?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    compiled_path?: string | null;
    build_path?: string | null;
    deferred?: boolean;
    unrendered_config?: {
        [k: string]: unknown;
    };
    created_at?: number;
    config_call_dict?: {
        [k: string]: unknown;
    };
}
/**
 * SnapshotConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True, alias: Optional[str] = None, schema: Optional[str] = None, database: Optional[str] = None, tags: Union[List[str], str] = <factory>, meta: Dict[str, Any] = <factory>, materialized: str = 'snapshot', incremental_strategy: Optional[str] = None, persist_docs: Dict[str, Any] = <factory>, post_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, pre_hook: List[dbt.contracts.graph.model_config.Hook] = <factory>, quoting: Dict[str, Any] = <factory>, column_types: Dict[str, Any] = <factory>, full_refresh: Optional[bool] = None, unique_key: Optional[str] = None, on_schema_change: Optional[str] = 'ignore', grants: Dict[str, Any] = <factory>, packages: List[str] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, strategy: Optional[str] = None, target_schema: Optional[str] = None, target_database: Optional[str] = None, updated_at: Optional[str] = None, check_cols: Union[str, List[str], NoneType] = None)
 */
export interface SnapshotConfig {
    enabled?: boolean;
    alias?: string | null;
    schema?: string | null;
    database?: string | null;
    tags?: string[] | string;
    meta?: {
        [k: string]: unknown;
    };
    materialized?: string;
    incremental_strategy?: string | null;
    persist_docs?: {
        [k: string]: unknown;
    };
    'post-hook'?: Hook[];
    'pre-hook'?: Hook[];
    quoting?: {
        [k: string]: unknown;
    };
    column_types?: {
        [k: string]: unknown;
    };
    full_refresh?: boolean | null;
    unique_key?: string | null;
    on_schema_change?: string | null;
    grants?: {
        [k: string]: unknown;
    };
    packages?: string[];
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    strategy?: string | null;
    target_schema?: string | null;
    target_database?: string | null;
    updated_at?: string | null;
    check_cols?: string | string[] | null;
    [k: string]: unknown;
}
/**
 * ParsedSourceDefinition(fqn: List[str], database: Optional[str], schema: str, unique_id: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, source_name: str, source_description: str, loader: str, identifier: str, resource_type: dbt.node_types.NodeType, _event_status: Dict[str, Any] = <factory>, quoting: dbt.contracts.graph.unparsed.Quoting = <factory>, loaded_at_field: Optional[str] = None, freshness: Optional[dbt.contracts.graph.unparsed.FreshnessThreshold] = None, external: Optional[dbt.contracts.graph.unparsed.ExternalTable] = None, description: str = '', columns: Dict[str, dbt.contracts.graph.parsed.ColumnInfo] = <factory>, meta: Dict[str, Any] = <factory>, source_meta: Dict[str, Any] = <factory>, tags: List[str] = <factory>, config: dbt.contracts.graph.model_config.SourceConfig = <factory>, patch_path: Optional[pathlib.Path] = None, unrendered_config: Dict[str, Any] = <factory>, relation_name: Optional[str] = None, created_at: float = <factory>)
 */
export interface ParsedSourceDefinition {
    fqn: string[];
    database?: string | null;
    schema: string;
    unique_id: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    source_name: string;
    source_description: string;
    loader: string;
    identifier: string;
    resource_type: 'source';
    /**
     * Quoting(database: Optional[bool] = None, schema: Optional[bool] = None, identifier: Optional[bool] = None, column: Optional[bool] = None)
     */
    quoting?: {
        database?: boolean | null;
        schema?: boolean | null;
        identifier?: boolean | null;
        column?: boolean | null;
    };
    loaded_at_field?: string | null;
    freshness?: FreshnessThreshold | null;
    external?: ExternalTable | null;
    description?: string;
    columns?: {
        [k: string]: ColumnInfo;
    };
    meta?: {
        [k: string]: unknown;
    };
    source_meta?: {
        [k: string]: unknown;
    };
    tags?: string[];
    /**
     * SourceConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True)
     */
    config?: {
        enabled?: boolean;
        [k: string]: unknown;
    };
    patch_path?: string | null;
    unrendered_config?: {
        [k: string]: unknown;
    };
    relation_name?: string | null;
    created_at?: number;
}
/**
 * FreshnessThreshold(warn_after: Optional[dbt.contracts.graph.unparsed.Time] = <factory>, error_after: Optional[dbt.contracts.graph.unparsed.Time] = <factory>, filter: Optional[str] = None)
 */
export interface FreshnessThreshold {
    warn_after?: Time | null;
    error_after?: Time | null;
    filter?: string | null;
}
/**
 * Time(count: Optional[int] = None, period: Optional[dbt.contracts.graph.unparsed.TimePeriod] = None)
 */
export interface Time {
    count?: number | null;
    period?: ('minute' | 'hour' | 'day') | null;
}
/**
 * ExternalTable(_extra: Dict[str, Any] = <factory>, location: Optional[str] = None, file_format: Optional[str] = None, row_format: Optional[str] = None, tbl_properties: Optional[str] = None, partitions: Optional[List[dbt.contracts.graph.unparsed.ExternalPartition]] = None)
 */
export interface ExternalTable {
    location?: string | null;
    file_format?: string | null;
    row_format?: string | null;
    tbl_properties?: string | null;
    partitions?: ExternalPartition[] | null;
    [k: string]: unknown;
}
/**
 * ExternalPartition(_extra: Dict[str, Any] = <factory>, name: str = '', description: str = '', data_type: str = '', meta: Dict[str, Any] = <factory>)
 */
export interface ExternalPartition {
    name?: string;
    description?: string;
    data_type?: string;
    meta?: {
        [k: string]: unknown;
    };
    [k: string]: unknown;
}
/**
 * ParsedMacro(unique_id: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, macro_sql: str, resource_type: dbt.node_types.NodeType, tags: List[str] = <factory>, depends_on: dbt.contracts.graph.parsed.MacroDependsOn = <factory>, description: str = '', meta: Dict[str, Any] = <factory>, docs: dbt.contracts.graph.unparsed.Docs = <factory>, patch_path: Optional[str] = None, arguments: List[dbt.contracts.graph.unparsed.MacroArgument] = <factory>, created_at: float = <factory>, supported_languages: Optional[List[dbt.node_types.ModelLanguage]] = None)
 */
export interface ParsedMacro {
    unique_id: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    macro_sql: string;
    resource_type: 'macro';
    tags?: string[];
    /**
     * MacroDependsOn(macros: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
    };
    description?: string;
    meta?: {
        [k: string]: unknown;
    };
    /**
     * Docs(show: bool = True, node_color: Optional[str] = None)
     */
    docs?: {
        show?: boolean;
        node_color?: string | null;
    };
    patch_path?: string | null;
    arguments?: MacroArgument[];
    created_at?: number;
    supported_languages?: ('python' | 'sql')[] | null;
}
/**
 * MacroArgument(name: str, type: Optional[str] = None, description: str = '')
 */
export interface MacroArgument {
    name: string;
    type?: string | null;
    description?: string;
}
/**
 * ParsedDocumentation(unique_id: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, block_contents: str)
 */
export interface ParsedDocumentation {
    unique_id: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    block_contents: string;
}
/**
 * ParsedExposure(fqn: List[str], unique_id: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, type: dbt.contracts.graph.unparsed.ExposureType, owner: dbt.contracts.graph.unparsed.ExposureOwner, resource_type: dbt.node_types.NodeType = <NodeType.Exposure: 'exposure'>, description: str = '', label: Optional[str] = None, maturity: Optional[dbt.contracts.graph.unparsed.MaturityType] = None, meta: Dict[str, Any] = <factory>, tags: List[str] = <factory>, config: dbt.contracts.graph.model_config.ExposureConfig = <factory>, unrendered_config: Dict[str, Any] = <factory>, url: Optional[str] = None, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, refs: List[List[str]] = <factory>, sources: List[List[str]] = <factory>, created_at: float = <factory>)
 */
export interface ParsedExposure {
    fqn: string[];
    unique_id: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    type: 'dashboard' | 'notebook' | 'analysis' | 'ml' | 'application';
    owner: ExposureOwner;
    resource_type?:
        | 'model'
        | 'analysis'
        | 'test'
        | 'snapshot'
        | 'operation'
        | 'seed'
        | 'rpc'
        | 'sql operation'
        | 'docs block'
        | 'source'
        | 'macro'
        | 'exposure'
        | 'metric';
    description?: string;
    label?: string | null;
    maturity?: ('low' | 'medium' | 'high') | null;
    meta?: {
        [k: string]: unknown;
    };
    tags?: string[];
    /**
     * ExposureConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True)
     */
    config?: {
        enabled?: boolean;
        [k: string]: unknown;
    };
    unrendered_config?: {
        [k: string]: unknown;
    };
    url?: string | null;
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    refs?: string[][];
    sources?: string[][];
    created_at?: number;
}
/**
 * ExposureOwner(email: str, name: Optional[str] = None)
 */
export interface ExposureOwner {
    email: string;
    name?: string | null;
}
/**
 * ParsedMetric(fqn: List[str], unique_id: str, package_name: str, root_path: str, path: str, original_file_path: str, name: str, description: str, label: str, calculation_method: str, expression: str, timestamp: str, filters: List[dbt.contracts.graph.unparsed.MetricFilter], time_grains: List[str], dimensions: List[str], window: Optional[dbt.contracts.graph.unparsed.MetricTime] = None, model: Optional[str] = None, model_unique_id: Optional[str] = None, resource_type: dbt.node_types.NodeType = <NodeType.Metric: 'metric'>, meta: Dict[str, Any] = <factory>, tags: List[str] = <factory>, config: dbt.contracts.graph.model_config.MetricConfig = <factory>, unrendered_config: Dict[str, Any] = <factory>, sources: List[List[str]] = <factory>, depends_on: dbt.contracts.graph.parsed.DependsOn = <factory>, refs: List[List[str]] = <factory>, metrics: List[List[str]] = <factory>, created_at: float = <factory>)
 */
export interface ParsedMetric {
    fqn: string[];
    unique_id: string;
    package_name: string;
    root_path: string;
    path: string;
    original_file_path: string;
    name: string;
    description: string;
    label: string;
    calculation_method: string;
    expression: string;
    timestamp: string;
    filters: MetricFilter[];
    time_grains: string[];
    dimensions: string[];
    window?: MetricTime | null;
    model?: string | null;
    model_unique_id?: string | null;
    resource_type?:
        | 'model'
        | 'analysis'
        | 'test'
        | 'snapshot'
        | 'operation'
        | 'seed'
        | 'rpc'
        | 'sql operation'
        | 'docs block'
        | 'source'
        | 'macro'
        | 'exposure'
        | 'metric';
    meta?: {
        [k: string]: unknown;
    };
    tags?: string[];
    /**
     * MetricConfig(_extra: Dict[str, Any] = <factory>, enabled: bool = True)
     */
    config?: {
        enabled?: boolean;
        [k: string]: unknown;
    };
    unrendered_config?: {
        [k: string]: unknown;
    };
    sources?: string[][];
    /**
     * DependsOn(macros: List[str] = <factory>, nodes: List[str] = <factory>)
     */
    depends_on?: {
        macros?: string[];
        nodes?: string[];
    };
    refs?: string[][];
    metrics?: string[][];
    created_at?: number;
}
/**
 * MetricFilter(field: str, operator: str, value: str)
 */
export interface MetricFilter {
    field: string;
    operator: string;
    value: string;
}
/**
 * MetricTime(count: Optional[int] = None, period: Optional[dbt.contracts.graph.unparsed.MetricTimePeriod] = None)
 */
export interface MetricTime {
    count?: number | null;
    period?: ('day' | 'week' | 'month' | 'year') | null;
}
