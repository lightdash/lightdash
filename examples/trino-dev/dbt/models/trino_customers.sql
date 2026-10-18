select
    c.custkey as customer_id,
    c.name as customer_name,
    n.name as nation_name,
    c.mktsegment as market_segment,
    c.acctbal as account_balance
from tpch.tiny.customer c
join tpch.tiny.nation n on c.nationkey = n.nationkey
