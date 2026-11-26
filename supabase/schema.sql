-- Schema de la plateforme MBS pour Supabase (PostgreSQL).
-- Facultatif : l'application cree ces tables toute seule au premier demarrage.
-- A executer dans Supabase > SQL Editor si vous preferez le faire a la main.
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, nom TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'commercial', pass_hash TEXT NOT NULL,
  actif INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login TEXT
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS formateurs (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE, nom TEXT NOT NULL, titre TEXT, bio TEXT, photo TEXT,
  ordre INTEGER DEFAULT 0, actif INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS formations (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, titre TEXT NOT NULL, accroche TEXT,
  programme TEXT, domaine TEXT, icone TEXT, image TEXT,
  objectifs TEXT, contenu TEXT, public TEXT, prerequis TEXT, duree TEXT,
  prix DOUBLE PRECISION DEFAULT 0, consult_min DOUBLE PRECISION DEFAULT 0, consult_max DOUBLE PRECISION DEFAULT 0,
  formateurs TEXT DEFAULT '[]', ordre INTEGER DEFAULT 0, actif INTEGER DEFAULT 1,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions_formation (
  id TEXT PRIMARY KEY, formation_id TEXT NOT NULL REFERENCES formations(id) ON DELETE CASCADE,
  titre TEXT, debut TEXT NOT NULL, fin TEXT, horaire TEXT, lieu TEXT,
  format TEXT DEFAULT 'presentiel', capacite INTEGER DEFAULT 25,
  prix DOUBLE PRECISION, prix_early DOUBLE PRECISION, early_jusqu TEXT,
  statut TEXT DEFAULT 'ouverte', created_at TEXT
);
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  whatsapp TEXT UNIQUE, email TEXT, pass_hash TEXT,
  prenom TEXT, nom TEXT, ville TEXT,
  profil TEXT, niveau TEXT, objectif TEXT, motivation TEXT, financement TEXT,
  disponible TEXT, paiement_quand TEXT, paiement_mode TEXT, source TEXT,
  session_id TEXT REFERENCES sessions_formation(id) ON DELETE SET NULL,
  step INTEGER DEFAULT 0, completed_at TEXT,
  statut TEXT DEFAULT 'nouveau',
  prix_du DOUBLE PRECISION, remise_pct DOUBLE PRECISION DEFAULT 0, code_promo TEXT,
  code_parrain TEXT UNIQUE, parrain_id TEXT,
  score INTEGER DEFAULT 0, temperature TEXT DEFAULT 'froid',
  ia_analyse TEXT, notes TEXT, assigne_a TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, referrer TEXT,
  opt_out INTEGER DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_activity TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_session ON leads(session_id);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  montant DOUBLE PRECISION NOT NULL, methode TEXT, reference TEXT, statut TEXT DEFAULT 'recu',
  note TEXT, par TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_ref ON payments(reference) WHERE reference IS NOT NULL AND reference != '';
CREATE TABLE IF NOT EXISTS entreprises (
  id TEXT PRIMARY KEY, societe TEXT NOT NULL, secteur TEXT, contact TEXT, fonction TEXT,
  email TEXT, telephone TEXT, taille TEXT, participants INTEGER DEFAULT 1,
  modules TEXT DEFAULT '[]', jours INTEGER DEFAULT 1, format TEXT, periode TEXT,
  objectifs TEXT, devis_ht DOUBLE PRECISION, devis_detail TEXT,
  statut TEXT DEFAULT 'nouveau', valeur_finale DOUBLE PRECISION, notes TEXT, assigne_a TEXT,
  ia_proposition TEXT, source TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, lead_id TEXT, entreprise_id TEXT,
  canal TEXT NOT NULL, destinataire TEXT, type TEXT NOT NULL, statut TEXT NOT NULL,
  contenu TEXT, erreur TEXT, par TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_lead ON messages(lead_id, type);
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY, lead_id TEXT, type TEXT NOT NULL, data TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_lead ON events(lead_id);
CREATE INDEX IF NOT EXISTS events_type ON events(type, created_at);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, lead_id TEXT, visiteur TEXT, page TEXT,
  nb_messages INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_conv ON chat_messages(conversation_id);
CREATE TABLE IF NOT EXISTS presences (
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE, session_id TEXT NOT NULL,
  jour TEXT NOT NULL, present INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (lead_id, session_id, jour)
);
CREATE TABLE IF NOT EXISTS certificats (
  id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  session_id TEXT, nom_complet TEXT NOT NULL, formation TEXT NOT NULL, dates TEXT,
  delivre_le TEXT NOT NULL, revoque INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY, remise_pct DOUBLE PRECISION NOT NULL, max_utilisations INTEGER, utilisations INTEGER DEFAULT 0,
  expire_le TEXT, actif INTEGER DEFAULT 1, note TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id BIGSERIAL PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL
);

-- Securite : l'API publique de Supabase (cle anon) ne doit rien voir.
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE formateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE formations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions_formation ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE entreprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificats ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
