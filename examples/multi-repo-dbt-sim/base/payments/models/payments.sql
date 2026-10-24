{% if var('sim_bootstrap', false) %}
select 1::integer as id, 'bootstrap'::text as label, 0::numeric as amount,
       true as active, date '2026-01-01' as event_date, 1::integer as merchant_id
{% else %}
select p.id::integer as id, p.label::text as label, p.amount::numeric as amount,
       p.active::boolean as active, p.event_date::date as event_date,
       m.id::integer as merchant_id
from {{ ref('payments_seed') }} p
left join {{ ref('merchants', 'merchant') }} m on p.id = m.id
{% endif %}
