// Point d'entree serverless (Vercel) : toutes les routes passent par l'application.
// Les relances automatiques sont declenchees par /api/cron/relances (voir vercel.json).
import { handler } from '../app.js';

export default handler;
