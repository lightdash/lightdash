select b.id::integer as id, 'scale_03_hub'::text as label,
       (604 + coalesce(r0.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 15) as b(id)
left join {{ ref('scale_00_fanout', 'customers') }} as r0 on b.id = r0.id
