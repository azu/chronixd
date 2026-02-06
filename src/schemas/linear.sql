CREATE TABLE IF NOT EXISTS linear AS
SELECT * FROM read_ndjson('db/**/linear/**/*.ndjson', columns = {
    type: 'VARCHAR',
    unixTimeMs: 'BIGINT',
    url: 'VARCHAR',
    activityType: 'VARCHAR',
    issueTitle: 'VARCHAR',
    body: 'VARCHAR',
    fromState: 'VARCHAR',
    toState: 'VARCHAR'
});
