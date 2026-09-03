-- Minimal schema and fixture so extract_events.sql can be exercised without a
-- full Lightdash database. Only the columns the extraction touches are declared.
-- Not a substitute for real data: the fixture proves the pipeline, not the thesis.

CREATE TABLE organizations (organization_id serial PRIMARY KEY, organization_uuid uuid NOT NULL);
CREATE TABLE projects (
    project_id serial PRIMARY KEY, project_uuid uuid NOT NULL, organization_id int NOT NULL,
    name text NOT NULL, project_type text NOT NULL DEFAULT 'DEFAULT'
);
CREATE TABLE users (user_id serial PRIMARY KEY, user_uuid uuid NOT NULL);
CREATE TABLE emails (email_id serial PRIMARY KEY, user_id int NOT NULL, email text NOT NULL, is_primary boolean NOT NULL DEFAULT true);
CREATE TABLE spaces (space_id serial PRIMARY KEY, space_uuid uuid NOT NULL, project_id int NOT NULL);
CREATE TABLE query_history (
    query_uuid uuid PRIMARY KEY, created_at timestamptz NOT NULL, created_by_user_uuid uuid,
    created_by_actor_type text, project_uuid uuid, organization_uuid uuid NOT NULL, context text NOT NULL,
    compiled_sql text NOT NULL DEFAULT '', metric_query jsonb NOT NULL, request_parameters jsonb NOT NULL DEFAULT '{}',
    total_row_count int, warehouse_execution_time_ms int, error text, status text NOT NULL DEFAULT 'ready'
);
CREATE TABLE saved_queries (
    saved_query_id serial PRIMARY KEY, saved_query_uuid uuid NOT NULL, project_uuid uuid NOT NULL,
    space_id int, name text NOT NULL
);
CREATE TABLE saved_queries_versions (
    saved_queries_version_id serial PRIMARY KEY, saved_queries_version_uuid uuid NOT NULL DEFAULT gen_random_uuid(),
    saved_query_id int NOT NULL, created_at timestamptz NOT NULL, explore_name text NOT NULL,
    filters jsonb NOT NULL DEFAULT '{}', chart_type text NOT NULL, updated_by_user_uuid uuid
);
CREATE TABLE saved_queries_version_fields (
    saved_queries_version_field_id serial PRIMARY KEY, saved_queries_version_id int NOT NULL,
    name text NOT NULL, field_type text NOT NULL, "order" int NOT NULL
);
CREATE TABLE dashboards (dashboard_id serial PRIMARY KEY, dashboard_uuid uuid NOT NULL, name text NOT NULL, space_id int NOT NULL);
CREATE TABLE dashboard_versions (dashboard_version_id serial PRIMARY KEY, dashboard_id int NOT NULL, created_at timestamptz NOT NULL, updated_by_user_uuid uuid);
CREATE TABLE analytics_chart_views (analytics_chart_view_uuid uuid DEFAULT gen_random_uuid(), chart_uuid uuid NOT NULL, user_uuid uuid, timestamp timestamptz NOT NULL DEFAULT now());
CREATE TABLE analytics_dashboard_views (analytics_dashboard_view_uuid uuid DEFAULT gen_random_uuid(), dashboard_uuid uuid NOT NULL, user_uuid uuid, timestamp timestamptz NOT NULL DEFAULT now());
CREATE TABLE ai_thread (
    ai_thread_uuid uuid PRIMARY KEY, organization_uuid uuid NOT NULL, project_uuid uuid NOT NULL,
    created_from text NOT NULL, title text
);
CREATE TABLE ai_prompt (
    ai_prompt_uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL, ai_thread_uuid uuid NOT NULL,
    created_by_user_uuid uuid, prompt text NOT NULL, response text, error_message text,
    human_score int, human_feedback text, metric_query jsonb, hidden boolean NOT NULL DEFAULT false
);

-- One org, one project, two users, ~90 minutes of activity spread over two days.
INSERT INTO organizations (organization_uuid) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO projects (project_uuid, organization_id, name) VALUES ('22222222-2222-2222-2222-222222222222', 1, 'Jaffle Shop');
INSERT INTO users (user_uuid) VALUES ('aaaaaaaa-0000-0000-0000-000000000001'), ('aaaaaaaa-0000-0000-0000-000000000002');
INSERT INTO emails (user_id, email) VALUES (1, 'analyst@example.com'), (2, 'finance@example.com');
INSERT INTO spaces (space_uuid, project_id) VALUES ('33333333-3333-3333-3333-333333333333', 1);
INSERT INTO saved_queries (saved_query_uuid, project_uuid, space_id, name) VALUES
    ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 1, 'Revenue by payment method');
INSERT INTO dashboards (dashboard_uuid, name, space_id) VALUES ('55555555-5555-5555-5555-555555555555', 'Finance overview', 1);

-- Episode A (analyst): a real exploration — five explore runs, an underlying-data view,
-- an agent question, a chart save and a dashboard save inside 16 minutes.
INSERT INTO query_history (query_uuid, created_at, created_by_user_uuid, created_by_actor_type, project_uuid, organization_uuid, context, metric_query, request_parameters, total_row_count, warehouse_execution_time_ms) VALUES
 (gen_random_uuid(), now() - interval '2 days' + interval '0 min',  'aaaaaaaa-0000-0000-0000-000000000001', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'exploreView',
  '{"exploreName":"orders","dimensions":["orders_order_date_month"],"metrics":["orders_total_revenue"],"filters":{},"sorts":[{"fieldId":"orders_order_date_month","descending":true}],"limit":500}', '{}', 12, 640),
 (gen_random_uuid(), now() - interval '2 days' + interval '1 min',  'aaaaaaaa-0000-0000-0000-000000000001', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'exploreView',
  '{"exploreName":"orders","dimensions":["orders_order_date_month","customers_segment"],"metrics":["orders_total_revenue"],"filters":{},"sorts":[{"fieldId":"orders_order_date_month","descending":true}],"limit":500}', '{}', 36, 710),
 (gen_random_uuid(), now() - interval '2 days' + interval '3 min',  'aaaaaaaa-0000-0000-0000-000000000001', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'exploreView',
  '{"exploreName":"orders","dimensions":["orders_order_date_month","payments_payment_method"],"metrics":["orders_total_revenue"],"filters":{"dimensions":{"id":"g1","and":[{"id":"r1","target":{"fieldId":"orders_status"},"operator":"equals","values":["completed"]}]}},"sorts":[],"limit":500}', '{}', 48, 820),
 (gen_random_uuid(), now() - interval '2 days' + interval '4 min',  'aaaaaaaa-0000-0000-0000-000000000001', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'viewUnderlyingData',
  '{"exploreName":"orders","dimensions":["orders_order_id","orders_order_date","payments_payment_method","orders_amount"],"metrics":[],"filters":{"dimensions":{"id":"g2","and":[{"id":"r2","target":{"fieldId":"payments_payment_method"},"operator":"equals","values":["coupon"]}]}},"sorts":[],"limit":500}', '{}', 500, 1200),
 (gen_random_uuid(), now() - interval '2 days' + interval '9 min',  'aaaaaaaa-0000-0000-0000-000000000001', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'exploreView',
  '{"exploreName":"orders","dimensions":["orders_order_date_month","payments_payment_method"],"metrics":["orders_total_revenue","orders_count"],"filters":{"dimensions":{"id":"g1","and":[{"id":"r1","target":{"fieldId":"orders_status"},"operator":"equals","values":["completed"]}]}},"sorts":[],"limit":500}', '{}', 48, 790);
INSERT INTO ai_thread (ai_thread_uuid, organization_uuid, project_uuid, created_from, title) VALUES
 ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'web_app', 'July coupon dip');
INSERT INTO ai_prompt (created_at, ai_thread_uuid, created_by_user_uuid, prompt, response, human_score, metric_query) VALUES
 (now() - interval '2 days' + interval '6 min', '66666666-6666-6666-6666-666666666666', 'aaaaaaaa-0000-0000-0000-000000000001',
  'Is the July dip in coupon orders new or did it happen last year too?', 'Coupon revenue fell in July both years...', 1,
  '{"exploreName":"orders","dimensions":["orders_order_date_month"],"metrics":["orders_total_revenue"],"filters":{"dimensions":{"id":"g3","and":[{"id":"r3","target":{"fieldId":"payments_payment_method"},"operator":"equals","values":["coupon"]}]}}}');
INSERT INTO saved_queries_versions (saved_query_id, created_at, explore_name, filters, chart_type, updated_by_user_uuid) VALUES
 (1, now() - interval '2 days' + interval '12 min', 'orders', '{"dimensions":{"id":"g1","and":[{"id":"r1","target":{"fieldId":"orders_status"},"operator":"equals","values":["completed"]}]}}', 'cartesian', 'aaaaaaaa-0000-0000-0000-000000000001');
INSERT INTO saved_queries_version_fields (saved_queries_version_id, name, field_type, "order") VALUES
 (1, 'orders_order_date_month', 'dimension', 0), (1, 'payments_payment_method', 'dimension', 1), (1, 'orders_total_revenue', 'metric', 2), (1, 'orders_count', 'metric', 3);
INSERT INTO dashboard_versions (dashboard_id, created_at, updated_by_user_uuid) VALUES (1, now() - interval '2 days' + interval '16 min', 'aaaaaaaa-0000-0000-0000-000000000001');

-- Episode B (finance): pure consumption — opens the dashboard, tiles refresh.
INSERT INTO analytics_dashboard_views (dashboard_uuid, user_uuid, timestamp) VALUES ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '1 day');
INSERT INTO query_history (query_uuid, created_at, created_by_user_uuid, created_by_actor_type, project_uuid, organization_uuid, context, metric_query, request_parameters, total_row_count, warehouse_execution_time_ms) VALUES
 (gen_random_uuid(), now() - interval '1 day' + interval '2 seconds', 'aaaaaaaa-0000-0000-0000-000000000002', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'dashboardView',
  '{"exploreName":"orders","dimensions":["orders_order_date_month","payments_payment_method"],"metrics":["orders_total_revenue","orders_count"],"filters":{},"sorts":[],"limit":500}', '{"dashboardUuid":"55555555-5555-5555-5555-555555555555","chartUuid":"44444444-4444-4444-4444-444444444444"}', 48, 300);

-- Episode C (finance, later the same day): a dead-end — two explore runs, an error, nothing saved.
INSERT INTO query_history (query_uuid, created_at, created_by_user_uuid, created_by_actor_type, project_uuid, organization_uuid, context, metric_query, request_parameters, total_row_count, warehouse_execution_time_ms, status, error) VALUES
 (gen_random_uuid(), now() - interval '1 day' + interval '3 hours', 'aaaaaaaa-0000-0000-0000-000000000002', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'exploreView',
  '{"exploreName":"customers","dimensions":["customers_segment"],"metrics":["customers_count"],"filters":{},"sorts":[],"limit":500}', '{}', 4, 210, 'ready', NULL),
 (gen_random_uuid(), now() - interval '1 day' + interval '3 hours 2 min', 'aaaaaaaa-0000-0000-0000-000000000002', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'exploreView',
  '{"exploreName":"customers","dimensions":["customers_segment","customers_first_order_month"],"metrics":["customers_count","customers_lifetime_value"],"filters":{},"sorts":[],"limit":500}', '{}', NULL, NULL, 'error', 'column customers.lifetime_value does not exist');

-- Noise that must be excluded: a scheduled delivery and a service-account run.
INSERT INTO query_history (query_uuid, created_at, created_by_user_uuid, created_by_actor_type, project_uuid, organization_uuid, context, metric_query, request_parameters) VALUES
 (gen_random_uuid(), now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000002', 'session', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'scheduledDelivery', '{"exploreName":"orders","dimensions":[],"metrics":["orders_total_revenue"],"filters":{},"sorts":[],"limit":500}', '{}'),
 (gen_random_uuid(), now() - interval '1 day', 'aaaaaaaa-0000-0000-0000-000000000002', 'service-account', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'api', '{"exploreName":"orders","dimensions":[],"metrics":["orders_total_revenue"],"filters":{},"sorts":[],"limit":500}', '{}');
