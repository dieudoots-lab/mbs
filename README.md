# Plateforme Modern Business School

Plateforme d'inscription, de CRM et d'automatisation de **Modern Business School (MBS)**, l'école du business moderne et des nouveaux métiers du numérique (Kinshasa).

Elle reprend le principe d'edenflavors.com (tunnel d'inscription en étapes, relances automatiques, assistante, espace équipe) et l'étend à une école multi-formations, avec une offre entreprises, des certificats vérifiables et un espace apprenant.

## Démarrer

Prérequis : **Node.js 22.13 ou plus récent**.

```bash
npm install
cp .env.example .env   # puis renseignez DATABASE_URL (Supabase)
npm start
```

- Site public : http://localhost:3000
- Espace équipe : http://localhost:3000/admin (au premier passage, vous créez le compte administrateur)

### Base de données
- **Production : Supabase (PostgreSQL)**, projet `oamasjocrgqpbpmbetmx`. Renseignez `DATABASE_URL` dans `.env` : Supabase › bouton **Connect** › **Transaction pooler** (port 6543), avec le mot de passe de la base. Au premier démarrage, l'application crée toutes les tables et active la **sécurité par ligne (RLS)** pour que l'API publique de Supabase ne puisse rien lire. Le script équivalent est dans `supabase/schema.sql`.
- **Sans `DATABASE_URL`** : la plateforme utilise une base SQLite locale dans `data/`, pratique pour développer sans connexion.

Variables d'environnement (voir `.env.example`) : `DATABASE_URL`, `CRON_SECRET` (protège le déclencheur des relances), `ANTHROPIC_API_KEY` (facultatif), `PORT` (3000 par défaut), `NO_AUTOMATION=1` (désactive le moteur de relances intégré), `NODE_ENV=production` (cookies sécurisés, derrière HTTPS).

## Ce que fait la plateforme

### Côté public
| Page | Rôle |
|---|---|
| `/` | Accueil : hero avec compte à rebours et places restantes, programmes, bootcamps, **quiz d'orientation**, atouts, calendrier, formateurs, logos clients, FAQ |
| `/formations/:slug` | Page détaillée de chaque formation (objectifs, programme, sessions, formateurs) avec données structurées pour Google |
| `/inscription` | **Tunnel en 13 étapes**, une question par écran, enregistrées une par une : on reprend où on s'était arrêté, depuis n'importe quel téléphone |
| `/entreprises` | **Simulateur de devis en temps réel** (grille officielle : consultation 2 500 à 5 000 $ HT + frais par participant, TVA 16 %) et demande de proposition |
| `/espace` | **Espace apprenant** : formation, horaires, présences, solde et paiement, certificat, code de parrainage, ajout à l'agenda |
| `/verifier` | Vérification publique d'un certificat (code ou QR code) |
| `/certificat/:code` | Certificat imprimable aux couleurs de la charte, avec QR code et bouton « Ajouter à LinkedIn » |
| Bulle « Ama » | Assistante virtuelle sur toutes les pages (Claude) ; elle connaît le catalogue, les dates, les prix et le dossier de l'apprenant connecté |

### Espace équipe (`/admin`)
- **Tableau de bord** : visiteurs, dossiers, conversion, encaissé et attendu, entonnoir étape par étape (où les gens abandonnent), sources, remplissage des sessions, prospects à rappeler en priorité.
- **Inscrits (CRM)** : filtres, recherche, export CSV, inscription manuelle, fiche complète (historique, messages, conversation avec Ama), **score d'intérêt expliqué**, notes, enregistrement des paiements avec reçu WhatsApp, **analyse IA** avec message personnalisé prêt à envoyer.
- **Entreprises** : pipeline en colonnes (glisser-déposer), devis recalculable, **devis imprimable en PDF**, **proposition commerciale rédigée par l'IA**.
- **Catalogue** : formations, sessions (capacité, tarif early bird, statut, report avec avertissement automatique des inscrits), formateurs.
- **Présences & certificats** : émargement par jour, feuille d'émargement imprimable, délivrance des certificats en un clic selon le taux de présence, révocation.
- **Relances** : journal de tous les messages, envoi groupé à un segment, modèles modifiables avec variables, règles d'automatisation.
- **Assistante IA** : conversations, personnalité, base de connaissance complémentaire.
- **Promo & parrainage** : codes promo (plafond, expiration), programme de parrainage, classement des parrains.
- **Réglages** : informations de l'école, tarifs, certificats, intégrations, équipe et rôles (administrateur, commercial, formateur), journal d'audit.

### Le moteur de relances (automatique, chaque minute)
Inscription non terminée → relances à 1 h, 24 h, 72 h · inscription terminée → confirmation immédiate · paiement en attente → relances à 24 h et 96 h, puis J-7 · avant la formation → rappels J-3 et J-1 · après → certificat puis demande d'avis · demande entreprise non traitée → alerte interne.
Garde-fous : interrupteur général, heures calmes (heure de Kinshasa), plafond de messages par personne et par jour, chaque message n'est envoyé qu'une fois, désinscription respectée.

## Brancher les services (Admin › Réglages › Intégrations)

Tant qu'un service n'est pas configuré, la plateforme fonctionne quand même : les messages sont « simulés » (visibles dans le journal mais non envoyés) et l'assistante répond en mode simple.

| Service | Ce qu'il faut |
|---|---|
| **IA (Claude)** | Une clé API sur console.anthropic.com. Modèle par défaut : `claude-opus-5-5` |
| **WhatsApp** | Compte WhatsApp Business Platform (Meta) : jeton d'accès permanent + identifiant du numéro. Au-delà de 24 h sans message de la personne, Meta impose des **modèles de message approuvés** |
| **Email** | Clé API Brevo ou Resend + adresse d'expédition vérifiée |
| **Paiement en ligne** | Lien de votre page de paiement (agrégateur mobile money / carte : M-Pesa, Orange Money, Airtel Money, carte). La référence `MBS-<dossier>` est ajoutée au lien. Pour la confirmation automatique, donnez à l'agrégateur l'adresse `https://votre-site/api/webhooks/paiement?secret=VOTRE_SECRET` (corps JSON : `reference`, `montant`, `transaction_id`, `statut`) |
| **Mesure** | Pixel Meta et/ou Google Analytics (aucun script extérieur n'est chargé tant que c'est vide) |

## Mettre en ligne

La base étant sur Supabase, le site peut tourner partout :

**Vercel (depuis ce dépôt GitHub)** : importez le dépôt sur vercel.com (préréglage « Other », aucune commande de build), ajoutez les variables `DATABASE_URL`, `CRON_SECRET` et `NODE_ENV=production`, puis déployez. `vercel.json` envoie toutes les routes vers `api/index.js` et sert les fichiers de `public/` directement. Les relances : Vercel gratuit ne lance une tâche planifiée qu'**une fois par jour** ; pour des relances toutes les 10 minutes, exécutez `supabase/cron.sql` dans Supabase (pg_cron appelle `/api/cron/relances`).

**Serveur classique (Railway, Render, VPS…)** : `npm start` ; le moteur de relances tourne tout seul chaque minute.

Dans tous les cas : **HTTPS**, `NODE_ENV=production`, et l'adresse publique du site dans Réglages › Intégrations (elle sert aux liens envoyés).

## Structure

```
app.js               application : routes des pages, fichiers statiques, sécurité
server.js            serveur classique (npm start) + moteur de relances
api/index.js         point d'entrée serverless (Vercel)
lib/db.js            accès base : Supabase/PostgreSQL ou SQLite, données de départ
lib/schema.js        schéma des tables
supabase/            schema.sql (tables + RLS), cron.sql (relances via pg_cron)
lib/content.js       contenu tiré de la présentation MBS (modifiable ensuite dans l'admin)
lib/domain.js        règles métier : places, prix, soldes, score, devis
lib/api-public.js    API publique (inscription, espace, assistante, entreprises, webhook)
lib/api-admin.js     API de l'espace équipe
lib/automation.js    moteur de relances
lib/notify.js        envoi WhatsApp et email
lib/ai.js            Claude : assistante, analyse de dossier, proposition entreprise
lib/pages.js         pages publiques rendues côté serveur
public/              styles, scripts, images, espace admin
```

## À vérifier avant la mise en ligne
- Les **sessions de départ** sont des exemples (janvier et février 2027) : ajustez dates, horaires, lieu et capacité dans Admin › Catalogue.
- Les **prix particuliers** reprennent les frais par participant de la présentation (750 / 500 / 250 / 500 $ HT) : adaptez-les si le tarif individuel est différent.
- L'email de contact de la présentation est écrit `contact@mbsofficel.com` (sans « i ») alors que le site est `mbsofficiel.com` : la plateforme utilise `contact@mbsofficiel.com`, à corriger dans Réglages › École si besoin.
- L'association photo/nom des formateurs suit l'ordre de la présentation : à contrôler.
- Adresse exacte des bureaux et liens des réseaux sociaux : Réglages › École.
