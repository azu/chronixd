CREATE TABLE IF NOT EXISTS calendar AS
SELECT * FROM read_ndjson('db/calendar/**/*.ndjson', columns = {
    type: 'VARCHAR',
    unixTimeMs: 'BIGINT',
    url: 'VARCHAR',
    summary: 'VARCHAR'
});
