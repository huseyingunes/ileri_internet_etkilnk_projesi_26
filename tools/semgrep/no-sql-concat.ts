export async function q(db: any, id: string) {
  // ruleid: etkinlik-no-unsafe-raw-sql, etkinlik-no-sql-string-concat
  await db.$queryRawUnsafe('SELECT * FROM users WHERE id = ' + id);
  // ok: etkinlik-no-unsafe-raw-sql
  await db.$queryRaw`SELECT * FROM users WHERE id = ${id}`;
  // ruleid: etkinlik-no-sql-string-concat
  const a = 'SELECT * FROM t WHERE id = ' + id;
  // ruleid: etkinlik-no-sql-string-concat
  const b = `DELETE FROM t WHERE id = ${id}`;
  // ok: etkinlik-no-sql-string-concat
  const c = `Hello ${id}`;
  return [a, b, c];
}
