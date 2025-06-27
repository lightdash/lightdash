select
    address_id,
    user_id,
    street_address,
    city,
    state,
    postal_code,
    country_iso_code,
    valid_from,
    valid_to
from 
    {{ ref('addresses_raw') }}