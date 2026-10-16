select
    orderkey as order_id,
    custkey as customer_id,
    orderstatus as order_status,
    totalprice as total_price,
    orderdate as order_date,
    orderpriority as order_priority
from tpch.tiny.orders
