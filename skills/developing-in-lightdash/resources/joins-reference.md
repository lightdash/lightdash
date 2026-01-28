# Joins Reference

Joins connect tables together, allowing you to combine data from multiple models in a single query.

## Basic Join Configuration

```yaml
models:
  - name: orders
    meta:
      joins:
        - join: customers
          sql_on: "${orders.customer_id} = ${customers.customer_id}"
```

## Join Properties

### Required Properties

| Property | Description |
|----------|-------------|
| `join` | Name of the model to join |
| `sql_on` | SQL join condition |

### Optional Properties

| Property | Description | Default |
|----------|-------------|---------|
| `type` | Join type | `left` |
| `alias` | Alias for the joined model | Model name |
| `label` | Display label | Model label |
| `hidden` | Hide from UI | `false` |
| `fields` | Limit included fields | All fields |
| `always` | Always include in queries | `false` |
| `relationship` | Cardinality hint | None |
| `description` | Description of the join | None |

## Join Types

```yaml
joins:
  - join: customers
    sql_on: "${orders.customer_id} = ${customers.customer_id}"
    type: left      # LEFT JOIN (default)

  - join: required_data
    sql_on: "..."
    type: inner     # INNER JOIN

  - join: optional_data
    sql_on: "..."
    type: right     # RIGHT JOIN

  - join: all_combinations
    sql_on: "..."
    type: full      # FULL OUTER JOIN
```

**When to use each type:**

| Type | Use When |
|------|----------|
| `left` | Base table should always show, joined data is optional |
| `inner` | Only show rows where both tables have data |
| `right` | Joined table should always show (rare) |
| `full` | Show all rows from both tables (rare) |

## SQL On Syntax

### Basic Join

```yaml
sql_on: "${orders.customer_id} = ${customers.customer_id}"
```

### Multiple Conditions

```yaml
sql_on: |
  ${orders.customer_id} = ${customers.customer_id}
  AND ${orders.region} = ${customers.region}
```

### Complex Conditions

```yaml
sql_on: |
  ${orders.customer_id} = ${customers.customer_id}
  AND ${orders.created_at} >= ${customers.activated_at}
  AND (${customers.status} = 'active' OR ${customers.is_vip} = true)
```

### Date Range Joins

```yaml
sql_on: |
  ${events.user_id} = ${sessions.user_id}
  AND ${events.timestamp} BETWEEN ${sessions.start_time} AND ${sessions.end_time}
```

## Relationship Types

Specify the cardinality to help Lightdash optimize queries:

```yaml
joins:
  - join: customers
    sql_on: "${orders.customer_id} = ${customers.customer_id}"
    relationship: many-to-one    # Many orders per customer

  - join: order_items
    sql_on: "${orders.order_id} = ${order_items.order_id}"
    relationship: one-to-many    # One order has many items

  - join: user_profile
    sql_on: "${users.user_id} = ${user_profile.user_id}"
    relationship: one-to-one     # One profile per user

  - join: tags
    sql_on: "..."
    relationship: many-to-many   # Products can have many tags, tags can have many products
```

**Relationship meanings:**

| Relationship | Description | Example |
|--------------|-------------|---------|
| `one-to-one` | Each row matches exactly one row | User → Profile |
| `one-to-many` | Base row can match multiple joined rows | Order → Line Items |
| `many-to-one` | Multiple base rows match one joined row | Orders → Customer |
| `many-to-many` | Multiple matches in both directions | Products ↔ Tags |

## Aliasing

Use aliases to join the same table multiple times:

```yaml
joins:
  - join: users
    alias: created_by_user
    sql_on: "${orders.created_by} = ${created_by_user.user_id}"
    label: "Created By"

  - join: users
    alias: assigned_to_user
    sql_on: "${orders.assigned_to} = ${assigned_to_user.user_id}"
    label: "Assigned To"
```

## Limiting Fields

Include only specific fields from the joined table:

```yaml
joins:
  - join: customers
    sql_on: "${orders.customer_id} = ${customers.customer_id}"
    fields:
      - customer_name
      - email
      - segment
      - total_orders       # Metrics can be included too
```

## Hidden Joins

Join data for calculations without exposing in UI:

```yaml
joins:
  - join: internal_lookup
    sql_on: "${orders.code} = ${internal_lookup.code}"
    hidden: true           # Won't show in field picker
```

## Always Join

Force the join to always be included:

```yaml
joins:
  - join: required_context
    sql_on: "${orders.context_id} = ${required_context.id}"
    always: true           # Always included in queries
```

## Complete Examples

### E-commerce Data Model

```yaml
models:
  - name: orders
    meta:
      joins:
        # Customer information
        - join: customers
          sql_on: "${orders.customer_id} = ${customers.customer_id}"
          type: left
          label: "Customer"
          relationship: many-to-one
          description: "Customer who placed the order"

        # Product information (through order items)
        - join: order_items
          sql_on: "${orders.order_id} = ${order_items.order_id}"
          type: left
          label: "Line Items"
          relationship: one-to-many

        # Shipping address
        - join: addresses
          alias: shipping_address
          sql_on: "${orders.shipping_address_id} = ${shipping_address.address_id}"
          type: left
          label: "Shipping Address"
          fields:
            - city
            - state
            - country
            - postal_code

        # Billing address
        - join: addresses
          alias: billing_address
          sql_on: "${orders.billing_address_id} = ${billing_address.address_id}"
          type: left
          label: "Billing Address"
          fields:
            - city
            - state
            - country

        # Sales rep
        - join: users
          alias: sales_rep
          sql_on: "${orders.sales_rep_id} = ${sales_rep.user_id}"
          type: left
          label: "Sales Rep"
          relationship: many-to-one
          fields:
            - name
            - email
            - team
```

### SaaS Data Model

```yaml
models:
  - name: subscriptions
    meta:
      joins:
        # Account information
        - join: accounts
          sql_on: "${subscriptions.account_id} = ${accounts.account_id}"
          type: left
          relationship: many-to-one
          label: "Account"

        # Current plan
        - join: plans
          sql_on: "${subscriptions.plan_id} = ${plans.plan_id}"
          type: left
          relationship: many-to-one
          label: "Plan"
          fields:
            - plan_name
            - monthly_price
            - features

        # Usage data
        - join: usage_events
          sql_on: |
            ${subscriptions.subscription_id} = ${usage_events.subscription_id}
            AND ${usage_events.event_date} >= ${subscriptions.start_date}
            AND (${subscriptions.end_date} IS NULL OR ${usage_events.event_date} <= ${subscriptions.end_date})
          type: left
          relationship: one-to-many
          label: "Usage"

        # Account owner
        - join: users
          alias: account_owner
          sql_on: "${accounts.owner_id} = ${account_owner.user_id}"
          type: left
          label: "Account Owner"
          relationship: many-to-one
```

### Event-Based Model

```yaml
models:
  - name: events
    meta:
      joins:
        # User who triggered the event
        - join: users
          sql_on: "${events.user_id} = ${users.user_id}"
          type: left
          relationship: many-to-one

        # Session context
        - join: sessions
          sql_on: |
            ${events.user_id} = ${sessions.user_id}
            AND ${events.timestamp} BETWEEN ${sessions.session_start} AND ${sessions.session_end}
          type: left
          relationship: many-to-one
          label: "Session"

        # Page context
        - join: pages
          sql_on: "${events.page_id} = ${pages.page_id}"
          type: left
          relationship: many-to-one
          fields:
            - page_name
            - page_category
            - page_url

        # Experiment assignments
        - join: experiment_assignments
          sql_on: |
            ${events.user_id} = ${experiment_assignments.user_id}
            AND ${events.timestamp} >= ${experiment_assignments.assigned_at}
          type: left
          label: "Experiments"
```

## Best Practices

1. **Choose the right join type**: Use `left` to preserve base table rows, `inner` when both sides are required
2. **Specify relationships**: Helps Lightdash optimize fan-out calculations
3. **Use aliases for self-joins**: When joining the same table multiple times
4. **Limit fields when appropriate**: Reduce clutter by including only needed fields
5. **Add clear labels**: Help users understand what data is being joined
6. **Use hidden joins for internal data**: Keep lookup tables out of the UI
7. **Document complex join conditions**: Add descriptions for non-obvious joins
8. **Consider query performance**: Avoid many-to-many joins on large tables
9. **Test join results**: Verify row counts match expectations
10. **Use sql_on for complex logic**: Multi-condition joins, date ranges, etc.

## Common Patterns

### Joining Dimension Tables

```yaml
joins:
  - join: dim_date
    sql_on: "${fact_sales.date_key} = ${dim_date.date_key}"
    type: inner
    relationship: many-to-one

  - join: dim_product
    sql_on: "${fact_sales.product_key} = ${dim_product.product_key}"
    type: inner
    relationship: many-to-one
```

### Joining Through Intermediate Tables

```yaml
# orders → order_items → products
models:
  - name: orders
    meta:
      joins:
        - join: order_items
          sql_on: "${orders.order_id} = ${order_items.order_id}"

        - join: products
          sql_on: "${order_items.product_id} = ${products.product_id}"
```

### Point-in-Time Joins

```yaml
joins:
  - join: exchange_rates
    sql_on: |
      ${transactions.currency} = ${exchange_rates.currency}
      AND ${transactions.date} = ${exchange_rates.rate_date}
    type: left
    label: "Exchange Rate"
```
