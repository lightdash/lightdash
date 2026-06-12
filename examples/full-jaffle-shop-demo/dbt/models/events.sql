SELECT
  *,
  'https://placehold.co/300x100?text=id%20' || event as image_url,
  '{"event":"' || event || '","event_id":' || event_id || ',"properties":{"source":"demo","is_song_played":' ||
    CASE WHEN event = 'song_played' THEN 'true' ELSE 'false' END ||
    ',"tags":["raw","json","demo"],"nested":{"image_url":"' ||
    'https://placehold.co/300x100?text=id%20' || event || '"}}}' as event_properties_json
FROM {{ ref('raw_events') }}
