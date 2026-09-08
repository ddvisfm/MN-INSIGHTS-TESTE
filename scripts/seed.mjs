import { mkdir } from 'node:fs/promises';
import { createDatabase } from '../dist/db.js';
await mkdir('data', { recursive: true });
const db = createDatabase(process.env.DATABASE_PATH ?? './data/mn-insights.db');
db.close();
console.log('Banco do MN Insights inicializado com a base real de clientes da agência e sem relatórios automáticos.');
