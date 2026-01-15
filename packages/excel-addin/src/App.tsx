import { useEffect, useMemo, useState } from 'react';
import { normalizeMetricQuery } from './api/lightdashApi';
import type { Explore, ExploreField } from './types/lightdash';
import { buildMetricQuery } from './utils/buildMetricQuery';
import { groupExploreFields } from './utils/groupExploreFields';
import { saveQueryState } from './utils/saveQueryState';
import { toSheetValues } from './utils/toSheetValues';

type View = 'checking' | 'login' | 'project' | 'explore';

type ProjectOption = {
    name: string;
    projectUuid: string;
};

type ExploreSummary = {
    name: string;
    label?: string;
    groupLabel?: string;
};

type FilterInput = {
    id: string;
    fieldId: string;
    operator: string;
    values: string;
};

type SortInput = {
    id: string;
    fieldId: string;
    descending: boolean;
};

type SavedQueryState = {
    projectUuid: string;
    exploreName: string;
    metricQuery: {
        metrics: string[];
        dimensions: string[];
        filters?: unknown;
        sorts?: Array<{ fieldId: string; descending: boolean }>;
        limit: number;
    };
    columnOrder: string[];
    rangeAddress?: string;
};

const QUERY_LIMIT = 10000;
const QUERY_STATE_KEY = 'lightdashExcelQueryState';

const FILTER_OPERATORS = [
    { value: 'equals', label: '等于' },
    { value: 'notEquals', label: '不等于' },
    { value: 'include', label: '包含' },
    { value: 'doesNotInclude', label: '不包含' },
    { value: 'startsWith', label: '开头是' },
    { value: 'endsWith', label: '结尾是' },
    { value: 'greaterThan', label: '大于' },
    { value: 'greaterThanOrEqual', label: '大于等于' },
    { value: 'lessThan', label: '小于' },
    { value: 'lessThanOrEqual', label: '小于等于' },
    { value: 'isNull', label: '为空' },
    { value: 'notNull', label: '不为空' },
];

const VALUELESS_OPERATORS = new Set(['isNull', 'notNull']);

const createId = () =>
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const fetchLightdash = async <T,>(
    url: string,
    options?: RequestInit,
): Promise<T> => {
    const resp = await fetch(url, {
        credentials: 'include',
        ...options,
    });
    const payload = (await resp
        .json()
        .catch(() => undefined)) as
        | {
              status?: string;
              results?: T;
              error?: { message?: string };
          }
        | undefined;

    if (!resp.ok) {
        throw new Error(
            payload?.error?.message || `请求失败: HTTP ${resp.status}`,
        );
    }

    return (payload?.results ?? payload) as T;
};

const isOfficeReady = () =>
    typeof Office !== 'undefined' && typeof Office.onReady === 'function';

const extractCellValue = (cell: unknown) => {
    if (cell && typeof cell === 'object' && 'value' in cell) {
        return (cell as { value: unknown }).value ?? '';
    }
    return cell ?? '';
};

const filterFieldsBySearch = (fields: ExploreField[], query: string) => {
    if (!query.trim()) return fields;
    const lowerQuery = query.trim().toLowerCase();
    return fields.filter((field) =>
        `${field.label ?? ''} ${field.name}`.toLowerCase().includes(lowerQuery),
    );
};

const moveItem = <T,>(list: T[], index: number, delta: number) => {
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    return next;
};

export default function App() {
    const [view, setView] = useState<View>('checking');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [queryRunning, setQueryRunning] = useState(false);
    const [officeReady, setOfficeReady] = useState(false);

    const [auth, setAuth] = useState({
        email: '',
        password: '',
    });

    const [projects, setProjects] = useState<ProjectOption[]>([]);
    const [projectUuid, setProjectUuid] = useState('');

    const [explores, setExplores] = useState<ExploreSummary[]>([]);
    const [exploreName, setExploreName] = useState('');
    const [explore, setExplore] = useState<Explore | null>(null);

    const [dimensionSearch, setDimensionSearch] = useState('');
    const [metricSearch, setMetricSearch] = useState('');
    const [timeSearch, setTimeSearch] = useState('');

    const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
    const [selectedTimeDimensions, setSelectedTimeDimensions] = useState<
        string[]
    >([]);
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);

    const [filters, setFilters] = useState<FilterInput[]>([]);
    const [sorts, setSorts] = useState<SortInput[]>([]);

    const [lastResultSummary, setLastResultSummary] = useState<string>('');

    const fields = useMemo(
        () => (explore ? groupExploreFields(explore) : null),
        [explore],
    );

    const fieldLabelById = useMemo(() => {
        const mapping: Record<string, string> = {};
        if (!fields) return mapping;
        [...fields.dimensions, ...fields.timeDimensions, ...fields.metrics].forEach(
            (field) => {
                mapping[field.name] = field.label || field.name;
            },
        );
        return mapping;
    }, [fields]);

    const dimensionOptions = useMemo(
        () =>
            fields
                ? filterFieldsBySearch(fields.dimensions, dimensionSearch)
                : [],
        [fields, dimensionSearch],
    );

    const metricOptions = useMemo(
        () =>
            fields
                ? filterFieldsBySearch(fields.metrics, metricSearch)
                : [],
        [fields, metricSearch],
    );

    const timeOptions = useMemo(
        () =>
            fields
                ? filterFieldsBySearch(fields.timeDimensions, timeSearch)
                : [],
        [fields, timeSearch],
    );

    const filterFieldOptions = useMemo(() => {
        if (!fields) return [];
        return [...fields.dimensions, ...fields.timeDimensions];
    }, [fields]);

    const sortFieldOptions = useMemo(() => {
        if (!fields) return [];
        return [...fields.dimensions, ...fields.timeDimensions, ...fields.metrics];
    }, [fields]);

    useEffect(() => {
        if (!isOfficeReady()) return;
        Office.onReady(() => setOfficeReady(true));
    }, []);

    useEffect(() => {
        const checkSession = async () => {
            setStatus('检查登录状态...');
            try {
                await fetchLightdash('/api/v1/user');
                await loadProjects();
            } catch (error) {
                setView('login');
                setStatus('请先登录');
            }
        };

        if (view === 'checking') {
            checkSession();
        }
    }, [view]);

    const loadProjects = async () => {
        setBusy(true);
        try {
            const results = await fetchLightdash<ProjectOption[]>(
                '/api/v1/org/projects',
            );
            setProjects(results || []);
            if (results?.length === 1) {
                await enterExplore(results[0].projectUuid);
                return;
            }
            setView('project');
            setStatus('请选择项目');
        } catch (error) {
            setStatus((error as Error).message);
            setView('login');
        } finally {
            setBusy(false);
        }
    };

    const enterExplore = async (nextProjectUuid: string) => {
        setProjectUuid(nextProjectUuid);
        setView('explore');
        await loadExplores(nextProjectUuid);
    };

    const loadExplores = async (nextProjectUuid: string) => {
        setBusy(true);
        try {
            const results = await fetchLightdash<ExploreSummary[]>(
                `/api/v1/projects/${encodeURIComponent(nextProjectUuid)}/explores`,
            );
            setExplores(results || []);
            const nextExplore = results?.[0]?.name || '';
            setExploreName(nextExplore);
            if (nextExplore) {
                await loadExplore(nextProjectUuid, nextExplore);
            } else {
                setExplore(null);
            }
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const loadExplore = async (nextProjectUuid: string, nextExplore: string) => {
        if (!nextExplore) return;
        setBusy(true);
        try {
            const results = await fetchLightdash<Explore>(
                `/api/v1/projects/${encodeURIComponent(
                    nextProjectUuid,
                )}/explores/${encodeURIComponent(nextExplore)}`,
            );
            setExplore(results);
            setSelectedDimensions([]);
            setSelectedTimeDimensions([]);
            setSelectedMetrics([]);
            setFilters([]);
            setSorts([]);
            setDimensionSearch('');
            setMetricSearch('');
            setTimeSearch('');
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const login = async () => {
        setBusy(true);
        setStatus('登录中...');
        try {
            await fetchLightdash('/api/v1/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(auth),
            });
            setStatus('登录成功');
            await loadProjects();
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setBusy(false);
        }
    };

    const toggleSelection = (
        list: string[],
        value: string,
        setter: (next: string[]) => void,
    ) => {
        if (list.includes(value)) {
            setter(list.filter((item) => item !== value));
            return;
        }
        setter([...list, value]);
    };

    const updateFilter = (id: string, patch: Partial<FilterInput>) =>
        setFilters((prev) =>
            prev.map((filter) =>
                filter.id === id ? { ...filter, ...patch } : filter,
            ),
        );

    const updateSort = (id: string, patch: Partial<SortInput>) =>
        setSorts((prev) =>
            prev.map((sort) => (sort.id === id ? { ...sort, ...patch } : sort)),
        );

    const buildQueryPayload = () => {
        const dimensions = [...selectedDimensions, ...selectedTimeDimensions];
        const metricFilters = filters
            .filter((filter) => filter.fieldId && filter.operator)
            .map((filter) => ({
                id: filter.id,
                target: { fieldId: filter.fieldId },
                operator: filter.operator,
                values: VALUELESS_OPERATORS.has(filter.operator)
                    ? []
                    : filter.values
                          .split(',')
                          .map((value) => value.trim())
                          .filter(Boolean),
            }));
        const metricSorts = sorts
            .filter((sort) => sort.fieldId)
            .map((sort) => ({
                fieldId: sort.fieldId,
                descending: sort.descending,
            }));

        return normalizeMetricQuery(
            buildMetricQuery({
                metrics: selectedMetrics,
                dimensions,
                filters: metricFilters,
                sorts: metricSorts,
                limit: QUERY_LIMIT,
            }),
        );
    };

    const executeMetricQuery = async (payload: {
        projectUuid: string;
        exploreName: string;
        metricQuery: {
            metrics: string[];
            dimensions: string[];
            filters?: unknown;
            sorts?: Array<{ fieldId: string; descending: boolean }>;
            limit: number;
        };
    }) => {
        const response = await fetchLightdash<{ queryUuid: string }>(
            `/api/v2/projects/${encodeURIComponent(
                payload.projectUuid,
            )}/query/metric-query`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: {
                        ...payload.metricQuery,
                        exploreName: payload.exploreName,
                    },
                    context: 'explore',
                    invalidateCache: true,
                }),
            },
        );

        const { queryUuid } = response || {};
        if (!queryUuid) {
            throw new Error('未获取到 queryUuid');
        }

        return pollForResults(payload.projectUuid, queryUuid);
    };

    const pollForResults = async (targetProject: string, queryUuid: string) => {
        let backoffMs = 250;
        while (true) {
            const result = await fetchLightdash<{
                status: string;
                rows?: Array<Record<string, unknown>>;
                columns?: Record<string, { reference: string }>;
                error?: string | null;
            }>(
                `/api/v2/projects/${encodeURIComponent(
                    targetProject,
                )}/query/${encodeURIComponent(queryUuid)}`,
            );

            if (result.status === 'pending') {
                await new Promise((resolve) => setTimeout(resolve, backoffMs));
                backoffMs = Math.min(backoffMs * 2, 1000);
                continue;
            }

            if (result.status === 'error') {
                throw new Error(result.error || '查询执行失败');
            }

            if (result.status !== 'ready') {
                throw new Error('查询未完成');
            }

            return result;
        }
    };

    const writeResultsToExcel = async (params: {
        rows: Array<Record<string, unknown>>;
        columns: Record<string, { reference: string }>;
        columnOrder: string[];
        rangeAddress?: string;
    }) => {
        if (!officeReady) {
            throw new Error('Office.js 未就绪');
        }
        const ExcelObj = (window as any).Excel;
        if (!ExcelObj) {
            throw new Error('Excel 对象不可用，请在 Excel 内运行');
        }

        const columnOrder = params.columnOrder.length
            ? params.columnOrder
            : Object.keys(params.columns || {});
        const normalizedRows = params.rows.map((row) => {
            const next: Record<string, unknown> = {};
            columnOrder.forEach((columnId) => {
                next[columnId] = extractCellValue(row[columnId]);
            });
            return next;
        });
        const { values } = toSheetValues(columnOrder, normalizedRows);
        values[0] = columnOrder.map(
            (columnId) => fieldLabelById[columnId] || columnId,
        );

        const targetRangeAddress = await ExcelObj.run(
            async (context: Excel.RequestContext) => {
                const workbook = context.workbook;
                const baseRange = params.rangeAddress
                    ? workbook.getRange(params.rangeAddress)
                    : workbook.getSelectedRange();
                baseRange.load(['address']);
                await context.sync();

                const writeRange = baseRange.getResizedRange(
                    values.length - 1,
                    values[0].length - 1,
                );
                writeRange.values = values;
                writeRange.format.autofitColumns();
                writeRange.format.autofitRows();
                await context.sync();
                return baseRange.address as string;
            },
        );

        return targetRangeAddress;
    };

    const handleRunQuery = async () => {
        if (!projectUuid || !exploreName) {
            setStatus('请先选择项目与 Explore');
            return;
        }
        if (
            !selectedMetrics.length &&
            !selectedDimensions.length &&
            !selectedTimeDimensions.length
        ) {
            setStatus('请至少选择一个字段');
            return;
        }

        setQueryRunning(true);
        setStatus('查询中...');
        try {
            const metricQuery = buildQueryPayload();
            const result = await executeMetricQuery({
                projectUuid,
                exploreName,
                metricQuery,
            });

            if (!result.rows || !result.columns) {
                throw new Error('查询结果为空');
            }

            const columnOrder = [
                ...selectedDimensions,
                ...selectedTimeDimensions,
                ...selectedMetrics,
            ].filter(Boolean);

            const rangeAddress = await writeResultsToExcel({
                rows: result.rows,
                columns: result.columns,
                columnOrder,
            });

            await saveQueryState(
                Office.context.document.settings,
                QUERY_STATE_KEY,
                {
                    projectUuid,
                    exploreName,
                    metricQuery,
                    columnOrder,
                    rangeAddress,
                } satisfies SavedQueryState,
            );

            setLastResultSummary(
                `已写入 ${result.rows.length} 行，${columnOrder.length || Object.keys(result.columns).length} 列`,
            );
            setStatus('查询完成并写入');
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setQueryRunning(false);
        }
    };

    const handleRefresh = async () => {
        if (!officeReady) {
            setStatus('Office.js 未就绪');
            return;
        }
        const settings = Office.context.document.settings;
        const saved = settings.get(QUERY_STATE_KEY) as SavedQueryState | null;
        if (!saved) {
            setStatus('未找到可刷新的设置');
            return;
        }

        setQueryRunning(true);
        setStatus('刷新中...');
        try {
            const result = await executeMetricQuery({
                projectUuid: saved.projectUuid,
                exploreName: saved.exploreName,
                metricQuery: saved.metricQuery,
            });

            if (!result.rows || !result.columns) {
                throw new Error('刷新结果为空');
            }

            await writeResultsToExcel({
                rows: result.rows,
                columns: result.columns,
                columnOrder: saved.columnOrder || [],
                rangeAddress: saved.rangeAddress,
            });

            setLastResultSummary(
                `已刷新 ${result.rows.length} 行，${saved.columnOrder.length || Object.keys(result.columns).length} 列`,
            );
            setStatus('刷新完成');
        } catch (error) {
            setStatus((error as Error).message);
        } finally {
            setQueryRunning(false);
        }
    };

    return (
        <div className="app">
            <header className="app__header">
                <div>
                    <h1>Lightdash Excel Add-in</h1>
                    <p>轻量 Explore 分析与一键写入 Excel</p>
                </div>
                <div className="status-pill">
                    {officeReady ? 'Office 已就绪' : 'Office 未就绪'}
                </div>
            </header>

            {view === 'checking' && (
                <section className="card">
                    <h2>检查登录状态</h2>
                    <p className="muted">{status || '正在验证 Token...'}</p>
                </section>
            )}

            {view === 'login' && (
                <section className="card">
                    <h2>登录 Lightdash</h2>
                    <div className="form-grid">
                        <label>
                            Email
                            <input
                                value={auth.email}
                                onChange={(event) =>
                                    setAuth((prev) => ({
                                        ...prev,
                                        email: event.target.value,
                                    }))
                                }
                                placeholder="you@company.com"
                            />
                        </label>
                        <label>
                            Password
                            <input
                                type="password"
                                value={auth.password}
                                onChange={(event) =>
                                    setAuth((prev) => ({
                                        ...prev,
                                        password: event.target.value,
                                    }))
                                }
                                placeholder="••••••••"
                            />
                        </label>
                    </div>
                    <button type="button" onClick={login} disabled={busy}>
                        {busy ? '登录中...' : '登录'}
                    </button>
                    {status && <div className="status">{status}</div>}
                </section>
            )}

            {view === 'project' && (
                <section className="card">
                    <h2>选择项目</h2>
                    <label>
                        项目
                        <select
                            value={projectUuid}
                            onChange={(event) =>
                                setProjectUuid(event.target.value)
                            }
                        >
                            <option value="">请选择项目</option>
                            {projects.map((project) => (
                                <option
                                    key={project.projectUuid}
                                    value={project.projectUuid}
                                >
                                    {project.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        onClick={() => enterExplore(projectUuid)}
                        disabled={!projectUuid || busy}
                    >
                        进入 Explore
                    </button>
                    {status && <div className="status">{status}</div>}
                </section>
            )}

            {view === 'explore' && (
                <div className="explore">
                    <section className="card">
                        <div className="toolbar">
                            <div>
                                <h2>Explore 分析</h2>
                                <p className="muted">
                                    项目: {projectUuid || '未选择'}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => loadProjects()}
                            >
                                切换项目
                            </button>
                        </div>
                        <label>
                            Explore
                            <select
                                value={exploreName}
                                onChange={(event) => {
                                    const nextExplore = event.target.value;
                                    setExploreName(nextExplore);
                                    loadExplore(projectUuid, nextExplore);
                                }}
                                disabled={!explores.length || busy}
                            >
                                {explores.map((item) => (
                                    <option key={item.name} value={item.name}>
                                        {item.label || item.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </section>

                    <section className="card">
                        <div className="section-title">
                            <h3>字段选择</h3>
                            <p className="muted">
                                可搜索、选择，并调整字段顺序
                            </p>
                        </div>
                        <div className="fields-grid">
                            <div className="field-group">
                                <div className="field-group__header">
                                    <h4>维度</h4>
                                    <span>{dimensionOptions.length} 项</span>
                                </div>
                                <input
                                    value={dimensionSearch}
                                    onChange={(event) =>
                                        setDimensionSearch(event.target.value)
                                    }
                                    placeholder="搜索维度"
                                />
                                <div className="field-list">
                                    {dimensionOptions.map((field) => (
                                        <label
                                            key={field.name}
                                            className="field-item"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedDimensions.includes(
                                                    field.name,
                                                )}
                                                onChange={() =>
                                                    toggleSelection(
                                                        selectedDimensions,
                                                        field.name,
                                                        setSelectedDimensions,
                                                    )
                                                }
                                            />
                                            <span>
                                                {field.label || field.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="field-group">
                                <div className="field-group__header">
                                    <h4>时间维度</h4>
                                    <span>{timeOptions.length} 项</span>
                                </div>
                                <input
                                    value={timeSearch}
                                    onChange={(event) =>
                                        setTimeSearch(event.target.value)
                                    }
                                    placeholder="搜索时间维度"
                                />
                                <div className="field-list">
                                    {timeOptions.map((field) => (
                                        <label
                                            key={field.name}
                                            className="field-item"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedTimeDimensions.includes(
                                                    field.name,
                                                )}
                                                onChange={() =>
                                                    toggleSelection(
                                                        selectedTimeDimensions,
                                                        field.name,
                                                        setSelectedTimeDimensions,
                                                    )
                                                }
                                            />
                                            <span>
                                                {field.label || field.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="field-group">
                                <div className="field-group__header">
                                    <h4>指标</h4>
                                    <span>{metricOptions.length} 项</span>
                                </div>
                                <input
                                    value={metricSearch}
                                    onChange={(event) =>
                                        setMetricSearch(event.target.value)
                                    }
                                    placeholder="搜索指标"
                                />
                                <div className="field-list">
                                    {metricOptions.map((field) => (
                                        <label
                                            key={field.name}
                                            className="field-item"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedMetrics.includes(
                                                    field.name,
                                                )}
                                                onChange={() =>
                                                    toggleSelection(
                                                        selectedMetrics,
                                                        field.name,
                                                        setSelectedMetrics,
                                                    )
                                                }
                                            />
                                            <span>
                                                {field.label || field.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="selection-grid">
                            <div className="selection-block">
                                <h4>已选维度</h4>
                                {selectedDimensions.map((fieldId, index) => (
                                    <div
                                        key={fieldId}
                                        className="selection-row"
                                    >
                                        <span>
                                            {fieldLabelById[fieldId] || fieldId}
                                        </span>
                                        <div>
                                            <button
                                                type="button"
                                                className="icon"
                                                onClick={() =>
                                                    setSelectedDimensions(
                                                        moveItem(
                                                            selectedDimensions,
                                                            index,
                                                            -1,
                                                        ),
                                                    )
                                                }
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                className="icon"
                                                onClick={() =>
                                                    setSelectedDimensions(
                                                        moveItem(
                                                            selectedDimensions,
                                                            index,
                                                            1,
                                                        ),
                                                    )
                                                }
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="selection-block">
                                <h4>已选时间维度</h4>
                                {selectedTimeDimensions.map((fieldId, index) => (
                                    <div
                                        key={fieldId}
                                        className="selection-row"
                                    >
                                        <span>
                                            {fieldLabelById[fieldId] || fieldId}
                                        </span>
                                        <div>
                                            <button
                                                type="button"
                                                className="icon"
                                                onClick={() =>
                                                    setSelectedTimeDimensions(
                                                        moveItem(
                                                            selectedTimeDimensions,
                                                            index,
                                                            -1,
                                                        ),
                                                    )
                                                }
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                className="icon"
                                                onClick={() =>
                                                    setSelectedTimeDimensions(
                                                        moveItem(
                                                            selectedTimeDimensions,
                                                            index,
                                                            1,
                                                        ),
                                                    )
                                                }
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="selection-block">
                                <h4>已选指标</h4>
                                {selectedMetrics.map((fieldId, index) => (
                                    <div
                                        key={fieldId}
                                        className="selection-row"
                                    >
                                        <span>
                                            {fieldLabelById[fieldId] || fieldId}
                                        </span>
                                        <div>
                                            <button
                                                type="button"
                                                className="icon"
                                                onClick={() =>
                                                    setSelectedMetrics(
                                                        moveItem(
                                                            selectedMetrics,
                                                            index,
                                                            -1,
                                                        ),
                                                    )
                                                }
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                className="icon"
                                                onClick={() =>
                                                    setSelectedMetrics(
                                                        moveItem(
                                                            selectedMetrics,
                                                            index,
                                                            1,
                                                        ),
                                                    )
                                                }
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="card">
                        <div className="section-title">
                            <h3>过滤器</h3>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() =>
                                    setFilters((prev) => [
                                        ...prev,
                                        {
                                            id: createId(),
                                            fieldId: '',
                                            operator: 'equals',
                                            values: '',
                                        },
                                    ])
                                }
                            >
                                添加过滤器
                            </button>
                        </div>
                        <div className="list-stack">
                            {filters.map((filter) => (
                                <div key={filter.id} className="row-grid">
                                    <select
                                        value={filter.fieldId}
                                        onChange={(event) =>
                                            updateFilter(filter.id, {
                                                fieldId: event.target.value,
                                            })
                                        }
                                    >
                                        <option value="">选择字段</option>
                                        {filterFieldOptions.map((field) => (
                                            <option
                                                key={field.name}
                                                value={field.name}
                                            >
                                                {field.label || field.name}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={filter.operator}
                                        onChange={(event) =>
                                            updateFilter(filter.id, {
                                                operator: event.target.value,
                                            })
                                        }
                                    >
                                        {FILTER_OPERATORS.map((operator) => (
                                            <option
                                                key={operator.value}
                                                value={operator.value}
                                            >
                                                {operator.label}
                                            </option>
                                        ))}
                                    </select>
                                    <input
                                        value={filter.values}
                                        onChange={(event) =>
                                            updateFilter(filter.id, {
                                                values: event.target.value,
                                            })
                                        }
                                        placeholder={
                                            VALUELESS_OPERATORS.has(
                                                filter.operator,
                                            )
                                                ? '无需输入'
                                                : '逗号分隔多个值'
                                        }
                                        disabled={VALUELESS_OPERATORS.has(
                                            filter.operator,
                                        )}
                                    />
                                    <button
                                        type="button"
                                        className="ghost"
                                        onClick={() =>
                                            setFilters((prev) =>
                                                prev.filter(
                                                    (item) =>
                                                        item.id !== filter.id,
                                                ),
                                            )
                                        }
                                    >
                                        删除
                                    </button>
                                </div>
                            ))}
                            {!filters.length && (
                                <div className="muted">暂无过滤器</div>
                            )}
                        </div>
                    </section>

                    <section className="card">
                        <div className="section-title">
                            <h3>排序</h3>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() =>
                                    setSorts((prev) => [
                                        ...prev,
                                        {
                                            id: createId(),
                                            fieldId: '',
                                            descending: false,
                                        },
                                    ])
                                }
                            >
                                添加排序
                            </button>
                        </div>
                        <div className="list-stack">
                            {sorts.map((sort) => (
                                <div key={sort.id} className="row-grid">
                                    <select
                                        value={sort.fieldId}
                                        onChange={(event) =>
                                            updateSort(sort.id, {
                                                fieldId: event.target.value,
                                            })
                                        }
                                    >
                                        <option value="">选择字段</option>
                                        {sortFieldOptions.map((field) => (
                                            <option
                                                key={field.name}
                                                value={field.name}
                                            >
                                                {field.label || field.name}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={sort.descending ? 'desc' : 'asc'}
                                        onChange={(event) =>
                                            updateSort(sort.id, {
                                                descending:
                                                    event.target.value ===
                                                    'desc',
                                            })
                                        }
                                    >
                                        <option value="asc">升序</option>
                                        <option value="desc">降序</option>
                                    </select>
                                    <div />
                                    <button
                                        type="button"
                                        className="ghost"
                                        onClick={() =>
                                            setSorts((prev) =>
                                                prev.filter(
                                                    (item) =>
                                                        item.id !== sort.id,
                                                ),
                                            )
                                        }
                                    >
                                        删除
                                    </button>
                                </div>
                            ))}
                            {!sorts.length && (
                                <div className="muted">暂无排序</div>
                            )}
                        </div>
                    </section>

                    <section className="card">
                        <div className="section-title">
                            <h3>执行与写入</h3>
                            <div className="actions">
                                <button
                                    type="button"
                                    onClick={handleRunQuery}
                                    disabled={busy || queryRunning}
                                >
                                    {queryRunning ? '查询中...' : '查询并写入'}
                                </button>
                                <button
                                    type="button"
                                    className="ghost"
                                    onClick={handleRefresh}
                                    disabled={queryRunning}
                                >
                                    刷新
                                </button>
                            </div>
                        </div>
                        <div className="status-block">
                            <div className="status">{status}</div>
                            {lastResultSummary && (
                                <div className="muted">
                                    {lastResultSummary}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
