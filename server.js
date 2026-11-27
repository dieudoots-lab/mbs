// Plateforme Modern Business School · serveur classique (local, VPS, Railway, Render...).
// Lancement : npm start (port 3000 par defaut, variable PORT pour changer).
import http from 'node:http';
import { handler } from './app.js';
import { ready, dialect } from './lib/db.js';
import { startAutomation } from './lib/automation.js';

const PORT = Number(process.env.PORT) || 3000;

try {
  await ready;
} catch (e) {
  console.error(`\n  Impossible d'ouvrir la base de données (${dialect === 'pg' ? 'Supabase' : 'SQLite'}) : ${e.message}`);
  if (e.code === '28P01') console.error('  → Mot de passe refusé : vérifiez DATABASE_URL dans .env (Supabase › Project Settings › Database).');
  if (e.code === 'ENOTFOUND' || e.code === 'ETIMEDOUT') console.error('  → Serveur injoignable : vérifiez l\'adresse du pooler et votre connexion internet.');
  process.exit(1);
}
http.createServer(handler).listen(PORT, () => {
  console.log(`\n  Modern Business School · plateforme en ligne sur http://localhost:${PORT}`);
  console.log(`  Base de données : ${dialect === 'pg' ? 'Supabase / PostgreSQL' : 'SQLite locale (data/)'}`);
  console.log(`  Espace équipe : http://localhost:${PORT}/admin\n`);
  if (process.env.NO_AUTOMATION !== '1') startAutomation();
});
