CREATE TABLE IF NOT EXISTS location AS
SELECT * FROM read_ndjson('db/location/**/*.ndjson', columns = {
    type: 'VARCHAR',
    unixTimeMs: 'BIGINT',
    url: 'VARCHAR',
    latitude: 'DOUBLE',
    longitude: 'DOUBLE',
    altitude: 'DOUBLE',
    speed: 'DOUBLE',
    address: 'VARCHAR',
    poi: 'VARCHAR'
});
