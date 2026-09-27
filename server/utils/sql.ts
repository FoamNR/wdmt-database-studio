/**
 * Split multi-statement SQL text into individual executable SQL queries,
 * respecting quotes (single/double), dollar quotes, and comments.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = i + 1 < sql.length ? sql[i + 1] : '';

    // Handle line comments
    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inBlockComment) {
      if (char === '-' && nextChar === '-') {
        inLineComment = true;
      }
    }
    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    // Handle block comments
    if (!inSingleQuote && !inDoubleQuote && !inBacktick && !inLineComment) {
      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
      }
    }
    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += nextChar;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    // Handle quotes
    if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
    }

    // Semicolon separator outside quotes
    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const remaining = current.trim();
  if (remaining.length > 0) {
    statements.push(remaining);
  }

  return statements;
}

/**
 * Extract table name from a SQL query string (e.g. SELECT * FROM products -> "products")
 */
export function extractTableNameFromSql(sql: string): string | undefined {
  if (!sql) return undefined;
  const clean = sql.replace(/\/\*[\s\S]*?\*\/|--.*$/gm, '').trim();

  // 1. Check FROM clause: FROM [table]
  const fromMatch = clean.match(/\bFROM\s+([`"\[]?([a-zA-Z0-9_]+)[`"\]]?\.)?[`"\[]?([a-zA-Z0-9_]+)[`"\]]?/i);
  if (fromMatch) {
    return fromMatch[3];
  }

  // 2. Check INSERT INTO clause
  const insertMatch = clean.match(/\bINSERT\s+INTO\s+([`"\[]?([a-zA-Z0-9_]+)[`"\]]?\.)?[`"\[]?([a-zA-Z0-9_]+)[`"\]]?/i);
  if (insertMatch) {
    return insertMatch[3];
  }

  // 3. Check UPDATE clause
  const updateMatch = clean.match(/\bUPDATE\s+([`"\[]?([a-zA-Z0-9_]+)[`"\]]?\.)?[`"\[]?([a-zA-Z0-9_]+)[`"\]]?/i);
  if (updateMatch) {
    return updateMatch[3];
  }

  // 4. Check DELETE FROM clause
  const deleteMatch = clean.match(/\bDELETE\s+FROM\s+([`"\[]?([a-zA-Z0-9_]+)[`"\]]?\.)?[`"\[]?([a-zA-Z0-9_]+)[`"\]]?/i);
  if (deleteMatch) {
    return deleteMatch[3];
  }

  return undefined;
}
