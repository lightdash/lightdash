{{ config(tags=['sim_base']) }}
select id::integer as id, label::text as label, amount::numeric as amount,
       active::boolean as active, event_date::date as event_date
from {{ ref('payments_seed') }}
