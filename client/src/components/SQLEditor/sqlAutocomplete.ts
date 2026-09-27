import type { SchemaMeta } from '../../types';

// Standard SQL Keywords
export const SQL_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT INTO',
  'UPDATE',
  'DELETE FROM',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'ON',
  'AS',
  'DISTINCT',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COALESCE',
  'NULLIF',
  'NOW()',
  'CURRENT_TIMESTAMP',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'TRUNCATE TABLE',
  'USE',
  'SET',
  'VALUES',
  'LIKE',
  'ILIKE',
  'IN',
  'NOT IN',
  'BETWEEN',
  'IS NULL',
  'IS NOT NULL',
  'AND',
  'OR',
  'NOT',
  'UNION',
  'UNION ALL',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'CAST',
  'EXISTS',
  'NOT EXISTS',
  'PRIMARY KEY',
  'FOREIGN KEY',
  'REFERENCES',
  'INDEX',
  'VIEW',
  'RETURNING',
  'CASCADE',
  'RESTRICT',
  'DESC',
  'ASC',
];

// Useful SQL Snippets
export const SQL_SNIPPETS = [
  {
    label: 'sel (SELECT query)',
    insertText: 'SELECT * FROM ${1:table_name} LIMIT 100;',
    detail: 'Basic SELECT statement with limit',
  },
  {
    label: 'selw (SELECT WHERE query)',
    insertText: 'SELECT * FROM ${1:table_name} WHERE ${2:id} = ${3:1};',
    detail: 'SELECT statement with WHERE clause',
  },
  {
    label: 'cnt (Count rows)',
    insertText: 'SELECT COUNT(*) AS total_count FROM ${1:table_name};',
    detail: 'Count total rows in a table',
  },
  {
    label: 'ins (INSERT INTO statement)',
    insertText: 'INSERT INTO ${1:table_name} (${2:col1, col2})\nVALUES (${3:val1, val2});',
    detail: 'Insert new row statement',
  },
  {
    label: 'upd (UPDATE statement)',
    insertText: 'UPDATE ${1:table_name}\nSET ${2:col1} = ${3:val1}\nWHERE ${4:id} = ${5:1};',
    detail: 'Update row statement with WHERE condition',
  },
  {
    label: 'del (DELETE statement)',
    insertText: 'DELETE FROM ${1:table_name}\nWHERE ${2:id} = ${3:1};',
    detail: 'Delete row with WHERE condition',
  },
  {
    label: 'join (INNER JOIN query)',
    insertText: 'SELECT t1.${1:*}, t2.${2:*}\nFROM ${3:table1} t1\nJOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:fk_id}\nLIMIT 100;',
    detail: 'Two tables INNER JOIN query',
  },
  {
    label: 'leftjoin (LEFT JOIN query)',
    insertText: 'SELECT t1.${1:*}, t2.${2:*}\nFROM ${3:table1} t1\nLEFT JOIN ${4:table2} t2 ON t1.${5:id} = t2.${6:fk_id}\nLIMIT 100;',
    detail: 'Two tables LEFT JOIN query',
  },
  {
    label: 'grp (GROUP BY Aggregation)',
    insertText: 'SELECT ${1:category_id}, COUNT(*) AS total_count, AVG(${2:price}) AS avg_val\nFROM ${3:products}\nGROUP BY ${1:category_id}\nORDER BY total_count DESC;',
    detail: 'GROUP BY with Aggregation',
  },
  {
    label: 'case (CASE WHEN statement)',
    insertText: 'CASE\n  WHEN ${1:status} = \'${2:active}\' THEN ${3:\'Active\'}\n  ELSE ${4:\'Inactive\'}\nEND',
    detail: 'Conditional CASE WHEN expression',
  },
];

/**
 * Build Monaco Completion Items from keywords, snippets, and active database schemas/tables
 */
export function buildSqlCompletionItems(
  monaco: any,
  schemas: SchemaMeta[],
  range: any
): any[] {
  const suggestions: any[] = [];

  // 1. Add SQL Keywords
  SQL_KEYWORDS.forEach((kw) => {
    suggestions.push({
      label: kw,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: kw,
      range,
      detail: 'SQL Keyword',
    });
  });

  // 2. Add SQL Snippets
  SQL_SNIPPETS.forEach((snip) => {
    suggestions.push({
      label: snip.label,
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: snip.insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range,
      detail: snip.detail,
    });
  });

  // 3. Add Schemas & Tables from database context
  schemas.forEach((schema) => {
    // Schema name suggestion
    suggestions.push({
      label: schema.name,
      kind: monaco.languages.CompletionItemKind.Module,
      insertText: schema.name,
      range,
      detail: `Database Schema (${schema.tables.length} tables)`,
    });

    // Tables suggestions
    schema.tables.forEach((table) => {
      // Unqualified table name (e.g. users)
      suggestions.push({
        label: table.name,
        kind: monaco.languages.CompletionItemKind.Class,
        insertText: table.name,
        range,
        detail: `${table.type === 'view' ? 'View' : 'Table'} (${schema.name})`,
        documentation: {
          value: `**${table.type === 'view' ? 'View' : 'Table'}**: \`${schema.name}.${table.name}\`\n\nSchema: *${schema.name}*`,
        },
      });

      // Qualified table name (e.g. public.users)
      if (schema.name && schema.name !== 'default' && schema.name !== 'main') {
        suggestions.push({
          label: `${schema.name}.${table.name}`,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: `${schema.name}.${table.name}`,
          range,
          detail: `Qualified ${table.type === 'view' ? 'View' : 'Table'}`,
        });
      }
    });
  });

  return suggestions;
}
