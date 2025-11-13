import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

async function main() {
  const args = process.argv.slice(2);
  const filters = new Set(
    args
      .filter((arg) => !arg.startsWith('-'))
      .flatMap((arg) => arg.split(',').map((s) => s.trim()))
      .filter(Boolean)
  );

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tableQuery = `
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'tags'
      order by table_name
    `;
    const tableRes = await pool.query<{ table_name: string }>(tableQuery);
    const tables = tableRes.rows
      .map((row) => row.table_name)
      .filter((name) => filters.size === 0 || filters.has(name));

    if (tables.length === 0) {
      console.log(filters.size === 0
        ? 'No tables with a tags column were discovered in schema public.'
        : `No tables matched filters: ${Array.from(filters).join(', ')}`);
      return;
    }

    console.log(`Scanning tables: ${tables.join(', ')}`);

    for (const tableName of tables) {
      const columnRes = await pool.query<{ column_name: string; data_type: string; udt_name: string }>(
        `select column_name, data_type, udt_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
        [tableName]
      );

      const allColumns = columnRes.rows.map((row) => row.column_name);
      const tagsColumn = columnRes.rows.find((row) => row.column_name === 'tags');
      const tagsDataType = tagsColumn?.data_type ?? '';
      const tagsUdt = tagsColumn?.udt_name ?? '';

      let tagPredicate: string;
      if (tagsDataType === 'ARRAY' || tagsUdt.startsWith('_')) {
        tagPredicate = '"tags" is not null and cardinality("tags") > 0';
      } else {
        tagPredicate = '"tags" is not null and jsonb_typeof("tags") = \'array\' and jsonb_array_length("tags") > 0';
      }

      const interestingOrder: Array<(col: string) => boolean> = [
        (col) => col === 'id',
        (col) => col.endsWith('_id'),
        (col) => col === 'slug',
        (col) => col.endsWith('_slug'),
        (col) => col === 'name',
        (col) => col === 'title',
        (col) => col === 'asset_tag',
        (col) => col === 'external_id',
      ];

      const picked: string[] = [];
      for (const matcher of interestingOrder) {
        for (const col of allColumns) {
          if (matcher(col) && !picked.includes(col) && col !== 'tags') {
            picked.push(col);
          }
        }
      }

      if (!picked.includes('id') && allColumns.includes('id')) {
        picked.unshift('id');
      }

      picked.push('tags');

      const selectCols = picked
        .map((col) => `"${col}"`)
        .join(', ');

      const orderCol = picked.find((col) => col !== 'tags') ?? 'tags';
      const query = `select ${selectCols} from "${tableName}" where ${tagPredicate} order by "${orderCol}"`;

      const res = await pool.query(query);
      const count = res.rowCount ?? 0;
      console.log(`\nTable: ${tableName}`);
      console.log(`Rows with tags: ${count}`);
      if (count > 0) {
        for (const row of res.rows) {
          console.log(JSON.stringify(row));
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('report-tag-usage failed:', err);
  process.exit(1);
});
