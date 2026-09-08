import { rm } from 'node:fs/promises';
for (const file of ['data/mn-insights.db', 'data/mn-insights.db-shm', 'data/mn-insights.db-wal']) {
  await rm(file, { force: true });
}
console.log('Banco local removido. Na próxima execução, a base real de clientes da agência será recriada automaticamente.');
