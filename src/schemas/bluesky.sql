CREATE TABLE IF NOT EXISTS bluesky AS
SELECT * FROM read_ndjson('db/**/bluesky/**/*.ndjson', columns = {
    type: 'VARCHAR',
    unixTimeMs: 'BIGINT',
    url: 'VARCHAR',
    text: 'VARCHAR',
    parentUrl: 'VARCHAR'
});
