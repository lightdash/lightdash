# CTE pipelines (and why not subqueries)

Structure a model as a pipeline of named CTEs. Each CTE does one job and is referenced by the next; the query ends in a single final `select`.

```sql
with

orders as (
    select * from {{ ref('stg_orders') }}
),

payments as (
    select * from {{ ref('stg_payments') }}
),

order_payments as (
    select
        orders.order_id,
        orders.customer_id,
        sum(payments.amount) as total_amount
    from orders
    left join payments on orders.order_id = payments.order_id
    group by 1, 2
),

final as (
    select
        order_id,
        customer_id,
        total_amount
    from order_payments
)

select * from final
```

Why a pipeline:

- Each step is independently readable and testable.
- The grain is explicit at every stage — you can see where an aggregate collapses rows.
- The final `select * from final` is safe because the columns were already pinned by the CTEs.

## Never use a correlated subquery

A correlated subquery recomputes a value **per outer row** by referencing that row inside the subquery. It is the most common non-idiomatic pattern the agent produces, and it is almost always wrong here — it is slow, hard to read, and easy to get wrong on grain.

Do **not** write:

```sql
-- correlated subquery: recomputed for every order row
select
    o.order_id,
    (
        select sum(p.amount)
        from payments p
        where p.order_id = o.order_id   -- references the outer row
    ) as total_amount
from orders o
```

Instead, aggregate once in a CTE and join:

```sql
with payment_totals as (
    select order_id, sum(amount) as total_amount
    from {{ ref('stg_payments') }}
    group by 1
)

select
    orders.order_id,
    payment_totals.total_amount
from {{ ref('stg_orders') }} as orders
left join payment_totals on orders.order_id = payment_totals.order_id
```

Or, if the value is already a metric/dimension on the model, **reuse that field** rather than recomputing it (see [reuse-over-subqueries](./reuse-over-subqueries.md)).

## Other structural preferences

- `union all`, not `union`, unless you specifically need to deduplicate (dedup is a real cost and usually a modelling smell).
- For "latest/first row per group", use a window function in a CTE (`row_number()` / `qualify`) referenced once — not a repeated subquery in `where`.
