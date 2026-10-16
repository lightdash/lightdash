select b.id::integer as id, 'scale_15_chain'::text as label,
       (698 + coalesce(r0.amount, 0) + coalesce(r1.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 9) as b(id)
left join {{ ref('scale_00_fanout', 'customers') }} as r0 on b.id = r0.id
left join {{ ref('scale_14_chain', 'scale_14_chain_0000') }} as r1 on b.id = r1.id
