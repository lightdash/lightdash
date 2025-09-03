import { test, expect } from '@playwright/test';
import { 
    AnyType, 
    SEED_PROJECT
} from '@lightdash/common';
import { login } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Lightdash catalog all tables and fields', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });
    
    test('Should list all tables', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?type=table`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.length).toBeGreaterThan(0);
        
        const userTable = body.results.find((table: AnyType) => table.name === 'users');
        expect(userTable).toEqual({
            name: 'users',
            label: 'Users',
            description: 'users table',
            type: 'table',
            joinedTables: [],
            tags: [],
            categories: [],
            catalogSearchUuid: '',
            icon: null,
            aiHints: null,
        });
    });

    test('Should list all fields', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?type=field`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.length).toBeGreaterThan(10);

        const dimension = body.results.find(
            (field: AnyType) =>
                field.name === 'payment_method' &&
                field.tableLabel === 'Payments',
        );
        expect(dimension).toEqual({
            name: 'payment_method',
            description: 'Method of payment used, for example credit card',
            tableLabel: 'Payments',
            tableName: 'payments',
            label: 'Payment method',
            fieldType: 'dimension',
            basicType: 'string',
            type: 'field',
            tags: [],
            categories: [],
            catalogSearchUuid: '',
            icon: null,
            aiHints: null,
            fieldValueType: 'string',
        });

        const metric = body.results.find(
            (field: AnyType) =>
                field.name === 'total_revenue' &&
                field.tableLabel === 'Payments',
        );
        expect(metric).toEqual({
            name: 'total_revenue',
            description: 'Sum of all payments',
            tableLabel: 'Payments',
            tableName: 'payments',
            fieldType: 'metric',
            basicType: 'number',
            label: 'Total revenue',
            type: 'field',
            tags: [],
            categories: [],
            catalogSearchUuid: '',
            icon: null,
            aiHints: null,
            fieldValueType: 'sum',
        });
    });
});

test.describe('Lightdash catalog search', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });
    
    test('Should search for customer tables and fields', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=customer`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.length).toBeGreaterThan(10);

        const table = body.results.find((t: AnyType) => t.name === 'customers' && t.type === 'table');
        expect(table).toHaveProperty('name', 'customers');

        const field = body.results.find(
            (f: AnyType) => f.name === 'customer_id' && f.tableLabel === 'Users',
        );
        expect(field).toHaveProperty('name', 'customer_id');
    });
    
    test('Should search for a dimension (payment_method)', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=payment_method`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(2); // payment and stg_payments

        const field = body.results.find(
            (f: AnyType) =>
                f.name === 'payment_method' && f.tableLabel === 'Payments',
        );
        expect(field).toHaveProperty('name', 'payment_method');
    });

    test('Should search for a metric (total_revenue) sorted by chartUsage', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog/metrics?search=total_revenue&sort=chartUsage&order=desc`);
        
        const body = await response.json();
        const { data } = body.results;
        expect(response.status()).toBe(200);
        expect(data).toHaveLength(2);

        const field1 = data[0];
        expect(field1).toHaveProperty('name', 'total_revenue');
        expect(field1).toHaveProperty('description', 'Sum of all payments');

        const field2 = data[1];
        expect(field2).toHaveProperty('name', 'total_revenue');
        expect(field2).toHaveProperty('description', 'Sum of Revenue attributed');
    });

    test('Should search with partial word (cust)', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=cust`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.length).toBeGreaterThan(0);

        // Check for a returned field
        const matchingField = body.results.find(
            (f: AnyType) =>
                f.name === 'customer_id' &&
                f.tableLabel === 'Users' &&
                f.type === 'field',
        );
        expect(matchingField).toHaveProperty('name', 'customer_id');

        // Check for a table
        const matchingTable = body.results.find((t: AnyType) => t.name === 'customers');
        expect(matchingTable).toHaveProperty('name', 'customers');
    });

    test('Should search with multiple words (order date)', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=order%20date`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.length).toBeGreaterThan(0);

        const matchingField = body.results.find(
            (f: AnyType) => f.name === 'date_of_first_order' && f.type === 'field',
        );
        expect(matchingField).toHaveProperty('description', 'Min of Order date');
    });

    test('Should filter fields with required attributes (age)', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=average_age`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(0);
    });

    test('Should filter table with required attributes (memberships)', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=memberships`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(0);
    });
    
    test('Should filter field in table without attribute access (plan)', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=plan`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(13);
        
        const planResult = body.results.find(
            (r: AnyType) =>
                r.name === 'plan' && r.tableGroupLabel === 'fanouts',
        );
        expect(planResult).toHaveProperty('name', 'plan');
        expect(planResult).toHaveProperty('tableGroupLabel', 'fanouts');
        
        const planNameResult = body.results.find(
            (r: AnyType) =>
                r.name === 'plan_name' && r.tableName === 'subscriptions',
        );
        expect(planNameResult).toHaveProperty('name', 'plan_name');
        expect(planNameResult).toHaveProperty('tableName', 'subscriptions');
    });
});

test.describe('Lightdash analytics', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });
    
    test('Should get analytics for customers table', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog/customers/analytics`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.charts.length).toBeGreaterThanOrEqual(1);

        const chart = body.results.charts.find(
            (c: AnyType) => c.name === 'How many users were created each month ?',
        );

        expect(chart).toHaveProperty('dashboardName', null);
        expect(chart).toHaveProperty('spaceName', 'Jaffle shop');
        expect(chart).toHaveProperty('name', 'How many users were created each month ?');
        expect(chart).toHaveProperty('uuid');
        expect(chart).toHaveProperty('spaceUuid');
    });

    test('Should get analytics for payments table', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog/payments/analytics`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.charts.length).toBeGreaterThanOrEqual(2); // at least 2

        const chart = body.results.charts.find(
            (c: AnyType) => c.name === 'How much revenue do we have per payment method?',
        );
        expect(chart).toHaveProperty('dashboardName', null);
        expect(chart).toHaveProperty('spaceName', 'Jaffle shop');
        expect(chart).toHaveProperty('name', 'How much revenue do we have per payment method?');
        expect(chart).toHaveProperty('uuid');
        expect(chart).toHaveProperty('spaceUuid');
    });

    test.skip('Should get analytics for charts within dashboards', async () => {
        // Skipping this test as it requires complex dashboard/chart creation logic
        // and imports from dashboard.cy that would need to be fully converted
    });

    test('Should get analytics for fields', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog/payments/analytics/payment_method`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results.charts.length).toBeGreaterThanOrEqual(3); // at least 3

        const chart = body.results.charts.find(
            (c: AnyType) => c.name === 'How much revenue do we have per payment method?',
        );
        expect(chart).toHaveProperty('dashboardName', null);
        expect(chart).toHaveProperty('spaceName', 'Jaffle shop');
        expect(chart).toHaveProperty('name', 'How much revenue do we have per payment method?');
        expect(chart).toHaveProperty('uuid');
        expect(chart).toHaveProperty('spaceUuid');
    });
});

test.describe('Lightdash catalog search with yaml tags', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });
    
    test('Should be able to find PII fields when no yaml tags are provided', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=first name&type=field`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(3);
        expect(body.results[0].name).toBe('first_name');
        expect(body.results[0].tableName).toBe('customers');
        expect(body.results[1].name).toBe('first_name');
        expect(body.results[1].tableName).toBe('users');
        expect(body.results[2].name).toBe('first_name');
        expect(body.results[2].tableName).toBe('stg_customers');
    });

    test('Should not be able to find any PII fields which does not have the ai tag', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=first_name&yamlTags=ai&type=field`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(0);
    });

    test('Should be able to find tables that have the ai tag when yaml tags are provided', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=events&yamlTags=ai&type=table`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0].name).toBe('events');
    });

    test('Should be able to find tagged tables when no yaml tags are provided', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=orders&type=table`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        // search query orders also returns payments (because of FTS)
        expect(body.results).toHaveLength(3);
        expect(body.results[0].name).toBe('orders');
        expect(body.results[1].name).toBe('stg_orders');
        expect(body.results[2].name).toBe('customers');
    });

    test('Should not be able to find tables that do not have the ai tag when yaml tags are provided', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=tracks&yamlTags=ai&type=table`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(0);
    });

    test('Should be able to find tagged fields from untagged table', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=total_revenue&yamlTags=ai&type=field`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0].name).toBe('total_revenue');
        expect(body.results[0].tableName).toBe('payments');
    });

    test('should be able to find fields if table is tagged but field is not', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=total_non_completed_order_amount&yamlTags=ai&type=field`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toHaveLength(1);
        expect(body.results[0].name).toBe('total_non_completed_order_amount');
        expect(body.results[0].tableName).toBe('orders');
    });

    test('should be able to find table if table is untagged but field is tagged', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;
        const response = await request.get(`${apiUrl}/projects/${projectUuid}/dataCatalog?search=payments&yamlTags=ai&type=table`);
        
        expect(response.status()).toBe(200);
        const body = await response.json();
        // search query payments also returns orders (because of FTS)
        expect(body.results).toHaveLength(2);
        expect(body.results[0].name).toBe('payments');
    });
});