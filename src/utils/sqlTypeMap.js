const sqlTypeMap = {
    String: 'VARCHAR',
    Char: 'CHAR',
    Number: 'INT',
    SmallInt: 'SMALLINT',
    BigInt: 'BIGINT',
    Decimal: 'DECIMAL',
    Boolean: 'BOOLEAN',
    Date: 'DATETIME',
    Object: 'JSON',
    Array: 'VARCHAR',
    Now: 'NOW()',
    Float: 'FLOAT',
    Double: 'DOUBLE',
    Text: 'TEXT',
    Blob: 'BLOB',
    Binary: 'VARBINARY',
    Uuid: 'CHAR',
    DateTime: "DATETIME",
    Timestamp: "TIMESTAMP",
    CurrentTimestamp: "CURRENT_TIMESTAMP"
};

module.exports = {sqlTypeMap}