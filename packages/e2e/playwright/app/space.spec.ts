import {
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_1_ADMIN_ROLE,
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_EDITOR_PASSWORD,
    SEED_ORG_1_EDITOR_ROLE,
    SEED_ORG_1_VIEWER,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_1_VIEWER_PASSWORD,
    SEED_ORG_1_VIEWER_ROLE,
    SEED_PROJECT,
    SPACE_TREE_1,
    SPACE_TREE_2,
} from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Locator,
    type Page,
} from '@playwright/test';
import { randomUUID } from 'crypto';
import adminAuthenticationFile from '../auth';

const apiV1 = '/api/v1';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const projectUuid = SEED_PROJECT.project_uuid;
const rootSpaceName = SEED_PROJECT.name;
const tree1RootSpaceNames = SPACE_TREE_1.map((space) => space.name);
const tree2RootSpaceNames = SPACE_TREE_2.map((space) => space.name);
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const adminIdentity = {
    userUuid: SEED_ORG_1_ADMIN.user_uuid,
    firstName: SEED_ORG_1_ADMIN.first_name,
    lastName: SEED_ORG_1_ADMIN.last_name,
    email: SEED_ORG_1_ADMIN_EMAIL.email,
    organizationUuid: SEED_ORG_1.organization_uuid,
    role: SEED_ORG_1_ADMIN_ROLE,
};

const editorIdentity = {
    userUuid: SEED_ORG_1_EDITOR.user_uuid,
    firstName: SEED_ORG_1_EDITOR.first_name,
    lastName: SEED_ORG_1_EDITOR.last_name,
    email: SEED_ORG_1_EDITOR_EMAIL.email,
    organizationUuid: SEED_ORG_1.organization_uuid,
    role: SEED_ORG_1_EDITOR_ROLE,
};

const viewerIdentity = {
    userUuid: SEED_ORG_1_VIEWER.user_uuid,
    firstName: SEED_ORG_1_VIEWER.first_name,
    lastName: SEED_ORG_1_VIEWER.last_name,
    email: SEED_ORG_1_VIEWER_EMAIL.email,
    organizationUuid: SEED_ORG_1.organization_uuid,
    role: SEED_ORG_1_VIEWER_ROLE,
};

const adminCredentials = {
    email: SEED_ORG_1_ADMIN_EMAIL.email,
    password: SEED_ORG_1_ADMIN_PASSWORD.password,
};

const editorCredentials = {
    email: SEED_ORG_1_EDITOR_EMAIL.email,
    password: SEED_ORG_1_EDITOR_PASSWORD.password,
};

const viewerCredentials = {
    email: SEED_ORG_1_VIEWER_EMAIL.email,
    password: SEED_ORG_1_VIEWER_PASSWORD.password,
};

type ExpectedIdentity = {
    userUuid: string;
    firstName: string;
    lastName: string;
    email: string;
    organizationUuid: string;
    role: string;
};

type CleanupState = {
    spaceUuid: string | null;
    chartUuid: string | null;
    dashboardUuid: string | null;
    memberUserUuid: string | null;
    projectAccessGranted: boolean;
};

type ApiContextFactory = () => Promise<APIRequestContext>;

type JsonResponse = {
    text: () => Promise<string>;
    url: () => string;
};

type CleanupCapture = {
    setSpaceUuid: (uuid: string) => void;
    setChartUuid: (uuid: string) => void;
    setDashboardUuid: (uuid: string) => void;
    setMemberUserUuid: (uuid: string) => void;
    markProjectAccessGranted: () => void;
};

const newCleanupState = (): CleanupState => ({
    spaceUuid: null,
    chartUuid: null,
    dashboardUuid: null,
    memberUserUuid: null,
    projectAccessGranted: false,
});

const parseUuid = (value: unknown, label: string) => {
    if (typeof value !== 'string' || !uuidPattern.test(value)) {
        throw new Error(`${label} must be a UUID`);
    }
    return value;
};

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseRecord = (value: unknown, label: string) => {
    if (!isUnknownRecord(value)) {
        throw new Error(`${label} must be an object`);
    }
    return value;
};

const parseJson = async (response: JsonResponse) => {
    const text = await response.text();
    try {
        const value: unknown = JSON.parse(text);
        return value;
    } catch {
        throw new Error(`Expected JSON from ${response.url()}`);
    }
};

const parseOkResults = async (response: JsonResponse) => {
    const body = parseRecord(await parseJson(response), 'API response');
    if (body.status !== 'ok') {
        throw new Error(`Expected an ok API response from ${response.url()}`);
    }
    return body.results;
};

const parseOkEmpty = async (response: JsonResponse) => {
    const results = await parseOkResults(response);
    if (results !== undefined && results !== null) {
        throw new Error(`Expected empty results from ${response.url()}`);
    }
};

const parseResourceUuid = async (response: JsonResponse, label: string) => {
    const results = parseRecord(
        await parseOkResults(response),
        `${label} results`,
    );
    return parseUuid(results.uuid, `${label} UUID`);
};

const parseIdentity = (value: unknown, label: string) => {
    const identity = parseRecord(value, label);
    const userUuid = parseUuid(identity.userUuid, `${label} user UUID`);
    const organizationUuid = parseUuid(
        identity.organizationUuid,
        `${label} organization UUID`,
    );
    if (
        typeof identity.firstName !== 'string' ||
        typeof identity.lastName !== 'string' ||
        typeof identity.email !== 'string' ||
        typeof identity.role !== 'string' ||
        typeof identity.isSetupComplete !== 'boolean'
    ) {
        throw new Error(`${label} has an invalid identity shape`);
    }
    return {
        userUuid,
        organizationUuid,
        firstName: identity.firstName,
        lastName: identity.lastName,
        email: identity.email,
        role: identity.role,
        isSetupComplete: identity.isSetupComplete,
    };
};

const expectIdentity = (
    value: unknown,
    expected: ExpectedIdentity,
    label: string,
) => {
    const identity = parseIdentity(value, label);
    expect(identity.userUuid).toBe(expected.userUuid);
    expect(identity.organizationUuid).toBe(expected.organizationUuid);
    expect(identity.firstName).toBe(expected.firstName);
    expect(identity.lastName).toBe(expected.lastName);
    expect(identity.email).toBe(expected.email);
    expect(identity.role).toBe(expected.role);
    return identity;
};

const expectCurrentIdentity = async (
    request: APIRequestContext,
    expected: ExpectedIdentity,
) => {
    const response = await request.get(`${apiV1}/user`);
    expect(response.status()).toBe(200);
    return expectIdentity(
        await parseOkResults(response),
        expected,
        'authenticated user',
    );
};

const authenticate = async (
    request: APIRequestContext,
    credentials: { email: string; password: string },
    expected: ExpectedIdentity,
) => {
    const loginResponse = await request.post(`${apiV1}/login`, {
        data: credentials,
    });
    expect(loginResponse.status()).toBe(200);
    expectIdentity(await parseOkResults(loginResponse), expected, 'login user');
    return expectCurrentIdentity(request, expected);
};

const authenticateBrowserContext = async (
    context: BrowserContext,
    credentials: { email: string; password: string },
    expected: ExpectedIdentity,
) => {
    await context.clearCookies();
    return authenticate(context.request, credentials, expected);
};

const normalizedPathname = (url: string) => {
    const { pathname } = new URL(url);
    return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
};

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const waitForApiResponse = (page: Page, method: string, pathname: string) =>
    page.waitForResponse(
        (response) =>
            response.request().method() === method &&
            normalizedPathname(response.url()) === pathname,
    );

const parseSpacePageUrl = (url: string) => {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    if (
        segments.length !== 4 ||
        segments[0] !== 'projects' ||
        segments[2] !== 'spaces'
    ) {
        throw new Error(`Expected a space URL, received ${url}`);
    }
    expect(parseUuid(segments[1], 'space URL project UUID')).toBe(projectUuid);
    return parseUuid(segments[3], 'space URL space UUID');
};

const parseChartViewUrl = (url: string) => {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    if (
        segments.length !== 5 ||
        segments[0] !== 'projects' ||
        segments[2] !== 'saved' ||
        segments[4] !== 'view'
    ) {
        throw new Error(`Expected a chart view URL, received ${url}`);
    }
    expect(parseUuid(segments[1], 'chart URL project UUID')).toBe(projectUuid);
    return parseUuid(segments[3], 'chart URL chart UUID');
};

const parseDashboardEditUrl = (url: string) => {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    if (
        segments.length !== 5 ||
        segments[0] !== 'projects' ||
        segments[2] !== 'dashboards' ||
        segments[4] !== 'edit'
    ) {
        throw new Error(`Expected a dashboard edit URL, received ${url}`);
    }
    expect(parseUuid(segments[1], 'dashboard URL project UUID')).toBe(
        projectUuid,
    );
    return parseUuid(segments[3], 'dashboard URL dashboard UUID');
};

const parseExploreUrl = (url: string, expectedSpaceUuid: string) => {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (
        segments.length !== 4 ||
        segments[0] !== 'projects' ||
        segments[2] !== 'tables' ||
        segments[3] !== 'orders'
    ) {
        throw new Error(`Expected the Orders explore URL, received ${url}`);
    }
    expect(parseUuid(segments[1], 'explore URL project UUID')).toBe(
        projectUuid,
    );
    expect(
        parseUuid(
            parsedUrl.searchParams.get('fromSpace'),
            'explore URL source space UUID',
        ),
    ).toBe(expectedSpaceUuid);
};

const resourceTable = async (page: Page) => {
    const table = page.getByRole('table');
    await expect(table).toHaveCount(1);
    await expect(table).toBeVisible();
    return table;
};

const dialogByTitle = (page: Page, title: string) =>
    page.getByRole('dialog', { name: title, exact: true });

const resourceRow = (page: Page, table: Locator, name: string) =>
    table.getByRole('row').filter({
        has: page.getByText(name, { exact: true }),
    });

const expectResourceVisible = async (
    page: Page,
    table: Locator,
    name: string,
) => {
    const row = resourceRow(page, table, name);
    await expect(row).toHaveCount(1);
    await expect(row).toBeVisible();
    return row;
};

const expectResourceAbsent = async (
    page: Page,
    table: Locator,
    name: string,
) => {
    await expect(resourceRow(page, table, name)).toHaveCount(0);
};

const openSpaceFromTable = async (page: Page, name: string) => {
    const table = await resourceTable(page);
    const row = await expectResourceVisible(page, table, name);
    await row
        .getByRole('link', {
            name: new RegExp(`^${escapeRegExp(name)}(?:\\s|$)`),
        })
        .click();
    await expect(page).toHaveURL((url) =>
        url.pathname.startsWith(`/projects/${projectUuid}/spaces/`),
    );
    return parseSpacePageUrl(page.url());
};

const expectSpaceNames = async (scope: Locator, names: readonly string[]) => {
    await Promise.all(
        names.map(async (name) => {
            const item = scope.getByText(name, { exact: true });
            await expect(item).toHaveCount(1);
            await expect(item).toBeVisible();
        }),
    );
};

const expandTreeItem = async (
    tree: Locator,
    parentName: string,
    childName: string,
) => {
    const label = tree.getByText(parentName, { exact: true });
    await expect(label).toHaveCount(1);
    const treeItem = label.locator('xpath=ancestor::*[@role="treeitem"]');
    await expect(treeItem).toHaveCount(1);
    await treeItem
        .getByRole('button', {
            name: `Expand ${parentName}`,
            exact: true,
        })
        .click();
    await expect(tree.getByText(childName, { exact: true })).toBeVisible();
};

const waitForVirtualTreeRender = async (container: Locator) => {
    await container.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                });
            }),
    );
};

const selectRenderedVirtualTreeItem = async (
    container: Locator,
    label: string,
    attempt: number,
): Promise<void> => {
    if (attempt >= 200) {
        throw new Error(`Virtual tree item "${label}" was not rendered`);
    }

    const item = container.getByText(label, { exact: true });
    const count = await item.count();
    if (count > 1) {
        throw new Error(`Found multiple virtual tree items named "${label}"`);
    }
    if (count === 1 && (await item.isVisible())) {
        await item.click();
        return;
    }

    const scroll = await container.evaluate((element) => {
        const maximum = Math.max(
            0,
            element.scrollHeight - element.clientHeight,
        );
        const next = Math.min(
            maximum,
            element.scrollTop + Math.max(1, element.clientHeight / 2),
        );
        const current = element.scrollTop;
        element.scrollTo({ top: next });
        return { current, next, maximum };
    });
    await waitForVirtualTreeRender(container);

    if (scroll.current === scroll.maximum && scroll.next === scroll.maximum) {
        throw new Error(`Virtual tree item "${label}" was not rendered`);
    }
    await selectRenderedVirtualTreeItem(container, label, attempt + 1);
};

const selectVirtualTreeItem = async (page: Page, label: string) => {
    const container = page.getByTestId('virtualized-tree-scroll-container');
    await expect(container).toHaveCount(1);
    await expect(container).toBeVisible();
    await container.evaluate((element) => {
        element.scrollTo({ top: 0 });
    });
    await waitForVirtualTreeRender(container);
    await selectRenderedVirtualTreeItem(container, label, 0);
};

const openDashboardSelectorFromHome = async (
    page: Page,
    dashboardName: string,
) => {
    await page.goto(`/projects/${projectUuid}/home`);
    await page.getByTestId('ExploreMenu/NewButton').click();
    await page.getByTestId('ExploreMenu/NewDashboardButton').click();

    const dialog = dialogByTitle(page, 'Create Dashboard');
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder('eg. KPI Dashboard').fill(dashboardName);
    await dialog.getByTestId('DashboardCreateModal/Next').click();
    const tree = dialog.getByRole('tree');
    await expect(tree).toHaveCount(1);
    await expect(tree).toBeVisible();
    return { dialog, tree };
};

const openDashboardSelectorFromCurrentSpace = async (
    page: Page,
    dashboardName: string,
) => {
    await page.getByTestId('Space/AddButton').click();
    const addMenu = page.getByRole('menu').filter({
        has: page.getByRole('menuitem', {
            name: 'Create new dashboard',
            exact: true,
        }),
    });
    await addMenu
        .getByRole('menuitem', {
            name: 'Create new dashboard',
            exact: true,
        })
        .click();

    const dialog = dialogByTitle(page, 'Create Dashboard');
    await dialog.getByPlaceholder('eg. KPI Dashboard').fill(dashboardName);
    await dialog.getByTestId('DashboardCreateModal/Next').click();
    const tree = dialog.getByRole('tree');
    await expect(tree).toHaveCount(1);
    await expect(tree).toBeVisible();
    return { dialog, tree };
};

const expectApiNotFound = async (request: APIRequestContext, url: string) => {
    const response = await request.get(url);
    expect(response.status()).toBe(404);
};

const ensureContentAbsent = async (
    request: APIRequestContext,
    url: string,
    expectedUuid: string,
    label: string,
) => {
    const existingResponse = await request.get(url);
    if (existingResponse.status() === 200) {
        expect(await parseResourceUuid(existingResponse, label)).toBe(
            expectedUuid,
        );
        const deleteResponse = await request.delete(url);
        expect(deleteResponse.status()).toBe(200);
        await parseOkEmpty(deleteResponse);
    } else {
        expect(existingResponse.status()).toBe(404);
    }
    await expectApiNotFound(request, url);
};

const ensureProjectAccessAbsent = async (
    request: APIRequestContext,
    userUuid: string,
) => {
    const url = `${apiV1}/projects/${projectUuid}/user/${userUuid}`;
    const existingResponse = await request.get(url);
    if (existingResponse.status() === 200) {
        const access = parseRecord(
            await parseOkResults(existingResponse),
            'project access results',
        );
        expect(parseUuid(access.userUuid, 'project access user UUID')).toBe(
            userUuid,
        );
        expect(
            parseUuid(access.projectUuid, 'project access project UUID'),
        ).toBe(projectUuid);
        const deleteResponse = await request.delete(
            `${apiV1}/projects/${projectUuid}/access/${userUuid}`,
        );
        expect(deleteResponse.status()).toBe(200);
        await parseOkEmpty(deleteResponse);
    } else {
        expect(existingResponse.status()).toBe(404);
    }
    await expectApiNotFound(request, url);
};

const ensureUserAbsent = async (
    request: APIRequestContext,
    userUuid: string,
) => {
    const getUrl = `${apiV1}/org/users/${userUuid}`;
    const existingResponse = await request.get(getUrl);
    if (existingResponse.status() === 200) {
        const user = parseRecord(
            await parseOkResults(existingResponse),
            'organization member results',
        );
        expect(parseUuid(user.userUuid, 'organization member user UUID')).toBe(
            userUuid,
        );
        expect(
            parseUuid(
                user.organizationUuid,
                'organization member organization UUID',
            ),
        ).toBe(SEED_ORG_1.organization_uuid);
        const deleteResponse = await request.delete(
            `${apiV1}/org/user/${userUuid}`,
        );
        expect(deleteResponse.status()).toBe(200);
        await parseOkEmpty(deleteResponse);
    } else {
        expect(existingResponse.status()).toBe(404);
    }
    await expectApiNotFound(request, getUrl);
};

const unknownErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

const cleanupWithFreshAdmin = async (
    createApiContext: ApiContextFactory,
    cleanup: CleanupState,
) => {
    const request = await createApiContext();
    try {
        await authenticate(
            request,
            {
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                password: SEED_ORG_1_ADMIN_PASSWORD.password,
            },
            adminIdentity,
        );
        await request.storageState({ path: adminAuthenticationFile });

        const failures: string[] = [];
        const run = async (label: string, action: () => Promise<void>) => {
            try {
                await action();
            } catch (error) {
                failures.push(`${label}: ${unknownErrorMessage(error)}`);
            }
        };

        const {
            dashboardUuid,
            chartUuid,
            spaceUuid,
            memberUserUuid,
            projectAccessGranted,
        } = cleanup;
        if (dashboardUuid !== null) {
            await run('dashboard cleanup', () =>
                ensureContentAbsent(
                    request,
                    `/api/v2/projects/${projectUuid}/dashboards/${dashboardUuid}`,
                    dashboardUuid,
                    'dashboard',
                ),
            );
        }
        if (chartUuid !== null) {
            await run('chart cleanup', () =>
                ensureContentAbsent(
                    request,
                    `/api/v2/projects/${projectUuid}/saved/${chartUuid}`,
                    chartUuid,
                    'chart',
                ),
            );
        }
        if (spaceUuid !== null) {
            await run('space cleanup', () =>
                ensureContentAbsent(
                    request,
                    `${apiV1}/projects/${projectUuid}/spaces/${spaceUuid}`,
                    spaceUuid,
                    'space',
                ),
            );
        }
        if (projectAccessGranted && memberUserUuid !== null) {
            await run('project access cleanup', () =>
                ensureProjectAccessAbsent(request, memberUserUuid),
            );
        }
        if (memberUserUuid !== null) {
            await run('member cleanup', () =>
                ensureUserAbsent(request, memberUserUuid),
            );
        }

        if (failures.length > 0) {
            throw new Error(`Cleanup failed:\n${failures.join('\n')}`);
        }
    } finally {
        await request.dispose();
    }
};

const createPrivateContent = async (
    page: Page,
    capture: CleanupCapture,
    names: { space: string; chart: string; dashboard: string },
) => {
    await page.goto(`/projects/${projectUuid}/home`);
    const newButton = page.getByTestId('ExploreMenu/NewButton');
    await expect(newButton).toBeVisible();

    const omnibarSearch = page.getByPlaceholder(`Search ${rootSpaceName}`);
    if (await omnibarSearch.isVisible()) {
        const omnibar = page.getByRole('dialog').filter({ has: omnibarSearch });
        await expect(omnibar).toHaveCount(1);
        await omnibarSearch.press('Escape');
        await expect(omnibar).toBeHidden();
    }

    await newButton.click();
    await page.getByTestId('ExploreMenu/NewSpaceButton').click();

    const spaceDialog = dialogByTitle(page, 'Create new space');
    await spaceDialog.getByText('Restricted access', { exact: true }).click();
    await spaceDialog.getByPlaceholder('eg. KPIs').fill(names.space);
    const createSpaceResponsePromise = waitForApiResponse(
        page,
        'POST',
        `${apiV1}/projects/${projectUuid}/spaces`,
    );
    await spaceDialog
        .getByRole('button', { name: 'Create', exact: true })
        .click();
    const createSpaceResponse = await createSpaceResponsePromise;
    expect(createSpaceResponse.status()).toBe(200);
    const spaceUuid = await parseResourceUuid(
        createSpaceResponse,
        'private space',
    );
    capture.setSpaceUuid(spaceUuid);
    await expect(page).toHaveURL((url) =>
        url.pathname.startsWith(`/projects/${projectUuid}/spaces/`),
    );
    expect(parseSpacePageUrl(page.url())).toBe(spaceUuid);
    const privateSpaceTitle = page.getByText(names.space, { exact: true });
    await expect(privateSpaceTitle).toHaveCount(1);
    await expect(privateSpaceTitle).toBeVisible();

    await page.getByTestId('Space/AddButton').click();
    const addMenu = page.getByRole('menu').filter({
        has: page.getByRole('menuitem', {
            name: 'Create new chart',
            exact: true,
        }),
    });
    await addMenu
        .getByRole('menuitem', { name: 'Create new chart', exact: true })
        .click();
    await page.getByText('Orders', { exact: true }).click();
    await expect(page).toHaveURL((url) =>
        url.pathname.endsWith('/tables/orders'),
    );
    parseExploreUrl(page.url(), spaceUuid);

    await selectVirtualTreeItem(page, 'Total order amount');
    await selectVirtualTreeItem(page, 'Status');
    await page
        .getByRole('button', { name: 'Save chart', exact: true })
        .press('Enter');

    const chartDialog = dialogByTitle(page, 'Save chart');
    const chartNext = chartDialog.getByRole('button', {
        name: 'Next',
        exact: true,
    });
    const chartNameInput = chartDialog.getByTestId(
        'ChartCreateModal/NameInput',
    );
    await expect(chartNameInput).toHaveValue('');
    await expect(chartNext).toBeDisabled();
    await chartNameInput.fill(names.chart);
    await expect(chartNameInput).toHaveValue(names.chart);
    await expect(chartNext).toBeEnabled();
    await chartNext.click();
    const chartSave = chartDialog.getByRole('button', {
        name: 'Save',
        exact: true,
    });
    await expect(chartSave).toBeEnabled();
    const createChartResponsePromise = waitForApiResponse(
        page,
        'POST',
        `${apiV1}/projects/${projectUuid}/saved`,
    );
    await chartSave.click();
    const createChartResponse = await createChartResponsePromise;
    expect(createChartResponse.status()).toBe(200);
    const chartUuid = await parseResourceUuid(
        createChartResponse,
        'private chart',
    );
    capture.setChartUuid(chartUuid);
    await expect(
        page.getByText('Success! Chart was saved.', { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname.endsWith('/view'));
    expect(parseChartViewUrl(page.url())).toBe(chartUuid);

    const dashboardResponse = await page
        .context()
        .request.post(`${apiV1}/projects/${projectUuid}/dashboards`, {
            data: {
                name: names.dashboard,
                spaceUuid,
                tiles: [],
                tabs: [],
            },
        });
    expect(dashboardResponse.status()).toBe(201);
    const dashboardUuid = await parseResourceUuid(
        dashboardResponse,
        'private dashboard',
    );
    capture.setDashboardUuid(dashboardUuid);

    await page.goto(`/projects/${projectUuid}/spaces/${spaceUuid}`);
    expect(parseSpacePageUrl(page.url())).toBe(spaceUuid);
    const contentFilter = page.getByRole('radiogroup').filter({
        has: page.getByRole('radio', { name: 'Charts', exact: true }),
    });
    await expect(
        contentFilter.getByRole('radio', { name: 'All', exact: true }),
    ).toBeChecked();
    await contentFilter.getByText('All', { exact: true }).click();
    const table = await resourceTable(page);
    await expectResourceVisible(page, table, names.dashboard);
    await expectResourceVisible(page, table, names.chart);
};

const createDynamicMember = async (
    adminRequest: APIRequestContext,
    memberRequest: APIRequestContext,
    capture: CleanupCapture,
    member: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
    },
) => {
    const inviteResponse = await adminRequest.post(`${apiV1}/invite-links`, {
        data: {
            role: 'member',
            email: member.email,
            expiresAt: new Date(
                Date.now() + 24 * 60 * 60 * 1_000,
            ).toISOString(),
        },
    });
    expect(inviteResponse.status()).toBe(201);
    const invite = parseRecord(
        await parseOkResults(inviteResponse),
        'invite results',
    );
    const memberUserUuid = parseUuid(invite.userUuid, 'invited user UUID');
    capture.setMemberUserUuid(memberUserUuid);
    expect(parseUuid(invite.organizationUuid, 'invite organization UUID')).toBe(
        SEED_ORG_1.organization_uuid,
    );
    expect(invite.email).toBe(member.email);
    if (
        typeof invite.inviteCode !== 'string' ||
        invite.inviteCode.length === 0
    ) {
        throw new Error('Invite code must be a non-empty string');
    }

    const accessResponse = await adminRequest.post(
        `${apiV1}/projects/${projectUuid}/access`,
        {
            data: {
                role: 'editor',
                email: member.email,
                sendEmail: false,
            },
        },
    );
    expect(accessResponse.status()).toBe(200);
    capture.markProjectAccessGranted();
    await parseOkEmpty(accessResponse);
    const projectAccessResponse = await adminRequest.get(
        `${apiV1}/projects/${projectUuid}/user/${memberUserUuid}`,
    );
    expect(projectAccessResponse.status()).toBe(200);
    const projectAccess = parseRecord(
        await parseOkResults(projectAccessResponse),
        'member project access results',
    );
    expect(
        parseUuid(projectAccess.userUuid, 'member project access user UUID'),
    ).toBe(memberUserUuid);
    expect(
        parseUuid(
            projectAccess.projectUuid,
            'member project access project UUID',
        ),
    ).toBe(projectUuid);
    expect(projectAccess.email).toBe(member.email);
    expect(projectAccess.role).toBe('editor');

    const registerResponse = await memberRequest.post(`${apiV1}/user`, {
        data: {
            inviteCode: invite.inviteCode,
            firstName: member.firstName,
            lastName: member.lastName,
            password: member.password,
        },
    });
    expect(registerResponse.status()).toBe(200);
    const expectedMember = {
        userUuid: memberUserUuid,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        organizationUuid: SEED_ORG_1.organization_uuid,
        role: 'member',
    };
    const registeredMember = expectIdentity(
        await parseOkResults(registerResponse),
        expectedMember,
        'registered member',
    );

    const verifyResponse = await memberRequest.get(
        `${apiV1}/user/me/email/status?passcode=000000`,
    );
    expect(verifyResponse.status()).toBe(200);
    const emailStatus = parseRecord(
        await parseOkResults(verifyResponse),
        'email verification results',
    );
    expect(emailStatus.email).toBe(member.email);
    expect(emailStatus.isVerified).toBe(true);
    const currentMember = await authenticate(
        memberRequest,
        { email: member.email, password: member.password },
        expectedMember,
    );
    expect(currentMember.isSetupComplete).toBe(
        registeredMember.isSetupComplete,
    );
    return {
        identity: expectedMember,
        isSetupComplete: currentMember.isSetupComplete,
    };
};

const prepareMemberPage = async (
    page: Page,
    expectedMember: ExpectedIdentity,
    isSetupComplete: boolean,
) => {
    await page.goto(`/projects/${projectUuid}/home`);
    const onboarding = dialogByTitle(page, 'Nearly there...');
    if (isSetupComplete) {
        await expect(onboarding).toHaveCount(0);
        const currentMember = await expectCurrentIdentity(
            page.context().request,
            expectedMember,
        );
        expect(currentMember.isSetupComplete).toBe(true);
        return;
    }
    await onboarding.getByPlaceholder('Select your role').click();
    await page.getByRole('option', { name: 'Product', exact: true }).click();
    const completionResponsePromise = waitForApiResponse(
        page,
        'PATCH',
        `${apiV1}/user/me/complete`,
    );
    await onboarding.getByRole('button', { name: 'Next', exact: true }).click();
    const completionResponse = await completionResponsePromise;
    expect(completionResponse.status()).toBe(200);
    const completedMember = expectIdentity(
        await parseOkResults(completionResponse),
        expectedMember,
        'completed member',
    );
    expect(completedMember.isSetupComplete).toBe(true);
    await expect(onboarding).toBeHidden();
    const currentMember = await expectCurrentIdentity(
        page.context().request,
        expectedMember,
    );
    expect(currentMember.isSetupComplete).toBe(true);
};

test('another non-admin user cannot see private content @mutating', async ({
    browser,
    page,
    playwright,
}) => {
    test.setTimeout(120_000);
    const suffix = randomUUID();
    const names = {
        space: `Private space ${suffix}`,
        chart: `Private chart ${suffix}`,
        dashboard: `Private dashboard ${suffix}`,
    };
    const member = {
        firstName: `Space-${suffix}`,
        lastName: `Member-${suffix}`,
        email: `space-member-${suffix}@lightdash.com`,
        password: 'test1234',
    };
    const cleanup = newCleanupState();
    const capture: CleanupCapture = {
        setSpaceUuid: (uuid) => {
            cleanup.spaceUuid = uuid;
        },
        setChartUuid: (uuid) => {
            cleanup.chartUuid = uuid;
        },
        setDashboardUuid: (uuid) => {
            cleanup.dashboardUuid = uuid;
        },
        setMemberUserUuid: (uuid) => {
            cleanup.memberUserUuid = uuid;
        },
        markProjectAccessGranted: () => {
            cleanup.projectAccessGranted = true;
        },
    };
    let memberContext: BrowserContext | null = null;

    try {
        await authenticateBrowserContext(
            page.context(),
            adminCredentials,
            adminIdentity,
        );
        await createPrivateContent(page, capture, names);

        const activeMemberContext = await browser.newContext({ baseURL });
        memberContext = activeMemberContext;
        const dynamicMember = await createDynamicMember(
            page.context().request,
            activeMemberContext.request,
            capture,
            member,
        );
        const memberPage = await activeMemberContext.newPage();
        await prepareMemberPage(
            memberPage,
            dynamicMember.identity,
            dynamicMember.isSetupComplete,
        );

        await memberPage
            .getByRole('button', { name: 'Browse', exact: true })
            .click();
        const browseMenu = memberPage.getByRole('menu').filter({
            has: memberPage.getByRole('menuitem', {
                name: 'All Spaces',
                exact: true,
            }),
        });
        await browseMenu.getByText('Spaces', { exact: true }).click();
        await expect(
            browseMenu.getByRole('menuitem', {
                name: rootSpaceName,
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            browseMenu.getByText(names.space, { exact: true }),
        ).toHaveCount(0);

        await browseMenu
            .getByRole('menuitem', { name: 'All Spaces', exact: true })
            .click();
        const spacesTable = await resourceTable(memberPage);
        await expectResourceVisible(memberPage, spacesTable, rootSpaceName);
        await expectResourceAbsent(memberPage, spacesTable, names.space);

        const privateSpaceUuid = parseUuid(
            cleanup.spaceUuid,
            'private space UUID',
        );
        const privateChartUuid = parseUuid(
            cleanup.chartUuid,
            'private chart UUID',
        );
        const privateDashboardUuid = parseUuid(
            cleanup.dashboardUuid,
            'private dashboard UUID',
        );
        const privateUrls = [
            `${apiV1}/projects/${projectUuid}/spaces/${privateSpaceUuid}`,
            `/api/v2/projects/${projectUuid}/saved/${privateChartUuid}`,
            `/api/v2/projects/${projectUuid}/dashboards/${privateDashboardUuid}`,
        ];
        const forbiddenResponses = await Promise.all(
            privateUrls.map((url) => activeMemberContext.request.get(url)),
        );
        expect(forbiddenResponses).toHaveLength(3);
        forbiddenResponses.forEach((response) => {
            expect(response.status()).toBe(403);
        });
    } finally {
        if (memberContext !== null) {
            await memberContext.close();
        }
        await cleanupWithFreshAdmin(
            () => playwright.request.newContext({ baseURL }),
            cleanup,
        );
    }
});

test('admin can see public spaces and private spaces with direct access', async ({
    page,
}) => {
    await authenticateBrowserContext(
        page.context(),
        adminCredentials,
        adminIdentity,
    );
    await page.goto(`/projects/${projectUuid}/spaces`);
    const table = await resourceTable(page);
    await Promise.all(
        [rootSpaceName, ...tree1RootSpaceNames].map((name) =>
            expectResourceVisible(page, table, name),
        ),
    );
});

test('admin can see public and private spaces in the dashboard tree', async ({
    page,
}) => {
    await authenticateBrowserContext(
        page.context(),
        adminCredentials,
        adminIdentity,
    );
    const { dialog, tree } = await openDashboardSelectorFromHome(
        page,
        `Admin tree ${randomUUID()}`,
    );
    await expectSpaceNames(tree, tree1RootSpaceNames);
    await dialog.getByText('Admin Content View', { exact: true }).click();
    await expectSpaceNames(tree, [
        ...tree1RootSpaceNames,
        ...tree2RootSpaceNames,
    ]);
    await expandTreeItem(tree, 'Parent Space 4', 'Child Space 4.1');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
});

const editorRootSpaceNames = [
    ...tree2RootSpaceNames,
    rootSpaceName,
    'Parent Space 1',
    'Parent Space 3',
    'Parent Space 5',
];

test('editor can see public spaces and private spaces with access', async ({
    context,
    page,
}) => {
    await authenticateBrowserContext(
        context,
        editorCredentials,
        editorIdentity,
    );
    await page.goto(`/projects/${projectUuid}/spaces`);
    const table = await resourceTable(page);
    await Promise.all(
        editorRootSpaceNames.map((name) =>
            expectResourceVisible(page, table, name),
        ),
    );
    await expectResourceAbsent(page, table, 'Parent Space 2');
});

test('editor can see nested spaces', async ({ context, page }) => {
    await authenticateBrowserContext(
        context,
        editorCredentials,
        editorIdentity,
    );
    await page.goto(`/projects/${projectUuid}/spaces`);
    await openSpaceFromTable(page, 'Parent Space 4');
    const table = await resourceTable(page);
    await expectResourceVisible(page, table, 'Child Space 4.1');
});

test('editor can see accessible spaces in the dashboard tree', async ({
    context,
    page,
}) => {
    await authenticateBrowserContext(
        context,
        editorCredentials,
        editorIdentity,
    );
    await page.goto(`/projects/${projectUuid}/spaces`);
    await openSpaceFromTable(page, 'Parent Space 1');
    await openSpaceFromTable(page, 'Child Space 1.1');
    const { dialog, tree } = await openDashboardSelectorFromCurrentSpace(
        page,
        `Editor tree ${randomUUID()}`,
    );
    await expectSpaceNames(tree, editorRootSpaceNames);
    await expandTreeItem(tree, 'Parent Space 4', 'Child Space 4.1');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
});

test('viewer can see public spaces and private spaces with access', async ({
    context,
    page,
}) => {
    await authenticateBrowserContext(
        context,
        viewerCredentials,
        viewerIdentity,
    );
    await page.goto(`/projects/${projectUuid}/spaces`);
    const table = await resourceTable(page);
    await expectResourceVisible(page, table, rootSpaceName);
    await expectResourceVisible(page, table, 'Parent Space 1');
    await expectResourceAbsent(page, table, 'Parent Space 2');
    await expectResourceAbsent(page, table, 'Parent Space 5');
});

test('viewer can see nested spaces', async ({ context, page }) => {
    await authenticateBrowserContext(
        context,
        viewerCredentials,
        viewerIdentity,
    );
    await page.goto(`/projects/${projectUuid}/spaces`);
    await openSpaceFromTable(page, 'Parent Space 1');
    const table = await resourceTable(page);
    await Promise.all(
        ['Child Space 1.1', 'Child Space 1.2', 'Child Space 1.3'].map((name) =>
            expectResourceVisible(page, table, name),
        ),
    );
});

test('editor can create and delete a space @mutating', async ({
    context,
    page,
    playwright,
}) => {
    const cleanup = newCleanupState();
    const spaceName = `PW space ${randomUUID()}`;

    try {
        await authenticateBrowserContext(
            context,
            editorCredentials,
            editorIdentity,
        );
        await page.goto(`/projects/${projectUuid}/spaces`);
        await openSpaceFromTable(page, 'Parent Space 1');
        await openSpaceFromTable(page, 'Child Space 1.1');

        await page.getByTestId('Space/AddButton').click();
        const addMenu = page.getByRole('menu').filter({
            has: page.getByRole('menuitem', {
                name: 'Create space',
                exact: true,
            }),
        });
        await addMenu
            .getByRole('menuitem', { name: 'Create space', exact: true })
            .click();
        const createDialog = dialogByTitle(
            page,
            'Create space in "Child Space 1.1"',
        );
        await createDialog.getByPlaceholder('eg. KPIs').fill(spaceName);
        const createResponsePromise = waitForApiResponse(
            page,
            'POST',
            `${apiV1}/projects/${projectUuid}/spaces`,
        );
        await createDialog
            .getByRole('button', { name: 'Create', exact: true })
            .click();
        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(200);
        const spaceUuid = await parseResourceUuid(createResponse, 'space');
        cleanup.spaceUuid = spaceUuid;
        await expect(createDialog).toBeHidden();

        const table = await resourceTable(page);
        const row = await expectResourceVisible(page, table, spaceName);
        await row.getByRole('button', { name: 'Menu', exact: true }).click();
        const actionMenu = page.getByRole('menu').filter({
            has: page.getByRole('menuitem', {
                name: 'Delete space',
                exact: true,
            }),
        });
        await actionMenu
            .getByRole('menuitem', { name: 'Delete space', exact: true })
            .click();
        const deleteDialog = dialogByTitle(page, 'Delete space');
        await deleteDialog.getByPlaceholder('Space name').fill(spaceName);
        const deleteResponsePromise = waitForApiResponse(
            page,
            'DELETE',
            `${apiV1}/projects/${projectUuid}/spaces/${spaceUuid}`,
        );
        await deleteDialog
            .getByRole('button', { name: 'Delete', exact: true })
            .click();
        const deleteResponse = await deleteResponsePromise;
        expect(deleteResponse.status()).toBe(200);
        await parseOkEmpty(deleteResponse);
        await expect(deleteDialog).toBeHidden();
        await expectResourceAbsent(page, table, spaceName);
        await expectApiNotFound(
            context.request,
            `${apiV1}/projects/${projectUuid}/spaces/${spaceUuid}`,
        );
    } finally {
        await cleanupWithFreshAdmin(
            () => playwright.request.newContext({ baseURL }),
            cleanup,
        );
    }
});

test('editor can create and delete a dashboard @mutating', async ({
    context,
    page,
    playwright,
}) => {
    const cleanup = newCleanupState();
    const dashboardName = `PW dashboard ${randomUUID()}`;

    try {
        await authenticateBrowserContext(
            context,
            editorCredentials,
            editorIdentity,
        );
        await page.goto(`/projects/${projectUuid}/spaces`);
        await openSpaceFromTable(page, 'Parent Space 1');
        const parentSpaceUuid = await openSpaceFromTable(
            page,
            'Child Space 1.1',
        );

        await page.getByTestId('Space/AddButton').click();
        const addMenu = page.getByRole('menu').filter({
            has: page.getByRole('menuitem', {
                name: 'Create new dashboard',
                exact: true,
            }),
        });
        await addMenu
            .getByRole('menuitem', {
                name: 'Create new dashboard',
                exact: true,
            })
            .click();
        const createDialog = dialogByTitle(page, 'Create Dashboard');
        await createDialog
            .getByPlaceholder('eg. KPI Dashboard')
            .fill(dashboardName);
        await createDialog.getByTestId('DashboardCreateModal/Next').click();
        const createResponsePromise = waitForApiResponse(
            page,
            'POST',
            `${apiV1}/projects/${projectUuid}/dashboards`,
        );
        await createDialog
            .getByRole('button', { name: 'Create', exact: true })
            .click();
        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(201);
        const dashboardUuid = await parseResourceUuid(
            createResponse,
            'dashboard',
        );
        cleanup.dashboardUuid = dashboardUuid;
        await expect(page).toHaveURL((url) => url.pathname.endsWith('/edit'));
        expect(parseDashboardEditUrl(page.url())).toBe(dashboardUuid);

        await page.goto(`/projects/${projectUuid}/spaces/${parentSpaceUuid}`);
        expect(parseSpacePageUrl(page.url())).toBe(parentSpaceUuid);
        const table = await resourceTable(page);
        const row = await expectResourceVisible(page, table, dashboardName);
        await row.getByRole('button', { name: 'Menu', exact: true }).click();
        const actionMenu = page.getByRole('menu').filter({
            has: page.getByRole('menuitem', {
                name: 'Delete dashboard',
                exact: true,
            }),
        });
        await actionMenu
            .getByRole('menuitem', {
                name: 'Delete dashboard',
                exact: true,
            })
            .click();
        const deleteDialog = dialogByTitle(page, 'Delete dashboard');
        const deleteResponsePromise = waitForApiResponse(
            page,
            'DELETE',
            `/api/v2/projects/${projectUuid}/dashboards/${dashboardUuid}`,
        );
        await deleteDialog
            .getByRole('button', { name: 'Delete', exact: true })
            .click();
        const deleteResponse = await deleteResponsePromise;
        expect(deleteResponse.status()).toBe(200);
        await parseOkEmpty(deleteResponse);
        await expect(deleteDialog).toBeHidden();
        await expectResourceAbsent(page, table, dashboardName);
        await expectApiNotFound(
            context.request,
            `/api/v2/projects/${projectUuid}/dashboards/${dashboardUuid}`,
        );
    } finally {
        await cleanupWithFreshAdmin(
            () => playwright.request.newContext({ baseURL }),
            cleanup,
        );
    }
});
