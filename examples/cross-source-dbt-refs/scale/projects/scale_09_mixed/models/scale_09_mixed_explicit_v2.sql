select b.id::integer as id, 'scale_09_mixed'::text as label,
       (383 + coalesce(r0.amount, 0))::numeric as amount, (b.id % 2 = 0) as active,
       (date '2026-01-01' + b.id) as event_date
from generate_series(1, 10) as b(id)
left join {{ ref('scale_08_versioned', 'scale_08_versioned_product', v=2) }} as r0 on b.id = r0.id
