// Contenu de depart, tire de la presentation officielle de Modern Business School
// et de sa charte graphique. Tout est modifiable ensuite depuis l'espace admin.

export const ECOLE = {
  nom: 'Modern Business School',
  sigle: 'MBS',
  baseline: "L'école du Business Moderne et des Nouveaux Métiers du Numérique",
  slogan: 'Apprendre à créer de l\'impact',
  accroche: "Pour rester compétitif, il ne suffit pas de suivre le rythme, il faut le devancer. Nous vous donnons les moyens d'y arriver.",
  societe: 'Go Freelance Sarlu',
  telephone1: '+243 899 132 880',
  telephone2: '+243 896 120 025',
  whatsapp: '+243899132880',
  email: 'contact@mbsofficiel.com',
  site: 'www.mbsofficiel.com',
  ville: 'Kinshasa',
  adresse: 'Kinshasa, RDC',
  diplomes: 100,
  reseaux: {
    facebook: 'https://www.facebook.com/mbsofficiel',
    tiktok: 'https://www.tiktok.com/@mbsofficiel',
    instagram: 'https://www.instagram.com/mbsofficiel',
  },
};

export const DOMAINES = [
  { icone: 'fa-bullhorn', titre: 'Marketing digital et création de contenu' },
  { icone: 'fa-robot', titre: 'Intelligence artificielle et automatisation' },
  { icone: 'fa-building-circle-arrow-right', titre: 'Transformation digitale des entreprises' },
  { icone: 'fa-handshake', titre: 'Entrepreneuriat et prospection moderne' },
];

export const PROGRAMMES = [
  {
    cle: 'bootcamp', titre: 'Bootcamps', icone: 'fa-bolt',
    texte: 'Des formations courtes et pratiques pour apprendre une compétence précise.',
    pour: 'Particuliers, étudiants, freelances',
  },
  {
    cle: 'renforcement', titre: 'Renforcement de capacité', icone: 'fa-people-group',
    texte: 'Des parcours adaptés aux équipes qui veulent gagner en efficacité.',
    pour: 'Entreprises, ONG, institutions',
  },
  {
    cle: 'campus', titre: 'Campus des entrepreneurs', icone: 'fa-rocket',
    texte: 'Un accompagnement pour structurer, lancer ou développer son activité.',
    pour: 'Porteurs de projet, entrepreneurs',
  },
];

export const ATOUTS = [
  { icone: 'fa-hand-sparkles', titre: 'Une approche pratique', texte: 'Nos formations sont conçues pour permettre aux participants de pratiquer, expérimenter et appliquer directement les compétences apprises.' },
  { icone: 'fa-puzzle-piece', titre: 'Des programmes adaptés', texte: 'Des formations modulaires et des parcours personnalisés selon les besoins des individus, des équipes et des entreprises.' },
  { icone: 'fa-microchip', titre: 'Des compétences actuelles', texte: 'Numérique, IA, marketing, création de contenu, vente, collaboration et transformation digitale : les domaines essentiels du business moderne.' },
  { icone: 'fa-chart-line', titre: 'Une orientation résultats', texte: 'Chaque programme vise un impact concret : montée en compétence, meilleure productivité, transformation des pratiques et croissance.' },
];

export const CLIENTS = [
  { nom: 'Rawbank', logo: '/img/client-rawbank.png' },
  { nom: 'Silikin Village', logo: '/img/client-silikin.png' },
  { nom: 'Canal+', logo: '/img/client-canal.png' },
  { nom: 'ITM SARL', logo: '/img/client-itm.png' },
];

export const FORMATEURS = [
  { slug: 'gracy-omokoso', nom: 'Gracy Omokoso', titre: 'eMBA HEC · Expert Marketing, Communication et Transformation Digitale', bio: "Coach UDEMY. Parcours de référence : Publicis Communication, Kadea.", photo: '/img/formateur-gracy-omokoso.jpg' },
  { slug: 'roddy-kasongo', nom: 'Roddy Kasongo', titre: 'Consultant spécialiste en Marketing Digital et UX/UI Design', bio: '', photo: '/img/formateur-roddy-kasongo.jpg' },
  { slug: 'grace-mutene', nom: 'Grace Mutene', titre: 'Consultant spécialiste Financier & Administratif', bio: '', photo: '/img/formateur-grace-mutene.jpg' },
  { slug: 'samuel-biselele', nom: 'Samuel Biselele', titre: 'Consultant spécialiste en Automatisation', bio: '', photo: '/img/formateur-samuel-biselele.jpg' },
];

export const FORMATIONS = [
  {
    slug: 'automatisation-intelligence-artificielle',
    titre: 'Automatisation & Intelligence Artificielle',
    accroche: "Faites travailler l'IA et l'automatisation pour vous, dès lundi.",
    programme: 'bootcamp', domaine: 'Intelligence artificielle et automatisation', icone: 'fa-robot',
    image: '/img/mod-ia.jpg',
    objectifs: [
      "Maîtriser les principes de l'automatisation des tâches pour améliorer l'efficacité opérationnelle et la productivité.",
      "Comprendre les bases de l'IA et son application concrète pour l'optimisation des processus d'entreprise.",
    ],
    contenu: [
      "Panorama de l'IA générative et de ses usages en entreprise",
      'Rédiger des prompts efficaces et fiables',
      'Cartographier un processus et repérer ce qui s\'automatise',
      'Construire ses premiers flux automatisés sans coder',
      'Mesurer le temps gagné et le retour sur investissement',
    ],
    public: 'Managers, entrepreneurs, assistants, équipes opérationnelles',
    prerequis: 'Savoir utiliser un ordinateur et internet',
    duree: '1 à 3 jours', prix: 750, consult_min: 2500, consult_max: 5000,
    formateurs: ['samuel-biselele', 'gracy-omokoso'],
  },
  {
    slug: 'marketing-digital',
    titre: 'Marketing Digital',
    accroche: 'Une stratégie digitale qui attire, convertit et se mesure.',
    programme: 'bootcamp', domaine: 'Marketing digital et création de contenu', icone: 'fa-bullhorn',
    image: '/img/mod-marketing.jpg',
    objectifs: [
      'Concevoir et mettre en œuvre une stratégie de marketing digital efficace, intégrant les réseaux sociaux, le SEO et les campagnes publicitaires.',
      'Acquérir les outils pour analyser les performances et optimiser le retour sur investissement des actions marketing en ligne.',
    ],
    contenu: [
      'Définir sa cible, son positionnement et ses objectifs',
      'Réseaux sociaux : ligne éditoriale et calendrier',
      'Les bases du SEO pour être trouvé sur Google',
      'Campagnes publicitaires Meta et Google : du budget au résultat',
      'Tableaux de bord, indicateurs clés et optimisation du ROI',
    ],
    public: 'Entrepreneurs, chargés de communication, commerciaux, étudiants',
    prerequis: 'Aucun',
    duree: '1 à 3 jours', prix: 500, consult_min: 2500, consult_max: 5000,
    formateurs: ['gracy-omokoso', 'roddy-kasongo'],
  },
  {
    slug: 'creation-de-contenu',
    titre: 'Création de Contenu',
    accroche: 'Des contenus qui captivent, du premier mot à la dernière image.',
    programme: 'bootcamp', domaine: 'Marketing digital et création de contenu', icone: 'fa-camera',
    image: '/img/mod-contenu.jpg',
    objectifs: [
      'Développer des compétences en production de contenu visuel et écrit (rédaction web, vidéo, infographies) adapté à différentes plateformes.',
      "Apprendre à utiliser les outils et techniques de storytelling pour captiver et engager une audience.",
    ],
    contenu: [
      'Les codes de chaque plateforme : TikTok, Instagram, Facebook, LinkedIn',
      'Rédaction web et copywriting',
      'Tourner et monter une vidéo courte au smartphone',
      'Créer des visuels et infographies avec des outils simples',
      'Storytelling : structurer un récit qui engage',
    ],
    public: 'Créateurs, community managers, entrepreneurs, étudiants',
    prerequis: 'Un smartphone',
    duree: '1 à 3 jours', prix: 250, consult_min: 2500, consult_max: 5000,
    formateurs: ['roddy-kasongo', 'gracy-omokoso'],
  },
  {
    slug: 'prospection-social-selling',
    titre: 'Prospection 2.0 & Social Selling',
    accroche: 'Trouvez vos clients là où ils passent leur temps : en ligne.',
    programme: 'bootcamp', domaine: 'Entrepreneuriat et prospection moderne', icone: 'fa-handshake',
    image: '/img/mod-prospection.jpg',
    objectifs: [
      'Exploiter les réseaux sociaux pour identifier de nouveaux prospects et construire des relations commerciales durables.',
      'Utiliser les outils de prospection modernes pour optimiser le processus de vente et atteindre les objectifs commerciaux.',
    ],
    contenu: [
      'Optimiser son profil LinkedIn et WhatsApp Business',
      'Identifier et qualifier ses prospects en ligne',
      "Messages d'approche qui obtiennent des réponses",
      'Suivre son pipeline commercial avec un CRM simple',
      'Transformer une conversation en rendez-vous puis en vente',
    ],
    public: 'Commerciaux, entrepreneurs, freelances, équipes de vente',
    prerequis: 'Aucun',
    duree: '1 à 3 jours', prix: 500, consult_min: 2500, consult_max: 5000,
    formateurs: ['gracy-omokoso'],
  },
];

// Sessions d'exemple, a ajuster dans Admin > Catalogue.
export const SESSIONS = [
  { formation: 'marketing-digital', debut: '2027-01-12', fin: '2027-01-14', horaire: '9h à 13h', capacite: 25, format: 'presentiel' },
  { formation: 'automatisation-intelligence-artificielle', debut: '2027-01-26', fin: '2027-01-28', horaire: '9h à 13h', capacite: 20, format: 'presentiel' },
  { formation: 'creation-de-contenu', debut: '2027-02-09', fin: '2027-02-10', horaire: '14h à 18h', capacite: 25, format: 'presentiel' },
  { formation: 'prospection-social-selling', debut: '2027-02-23', fin: '2027-02-25', horaire: '9h à 13h', capacite: 25, format: 'hybride' },
];

export const FAQ = [
  { q: "Je débute complètement. Est-ce pour moi ?", r: "Oui. Nos bootcamps partent des bases et misent sur la pratique : vous appliquez chaque notion pendant la formation, avec un formateur qui vous accompagne." },
  { q: 'Est-ce que je reçois un certificat ?', r: "Oui. À la fin de la formation, vous recevez un certificat MBS vérifiable en ligne grâce à son QR code. Plus de 100 diplômés l'ont déjà obtenu." },
  { q: 'Comment se passe le paiement ?', r: "L'inscription en ligne est gratuite et prend deux minutes. Les frais de formation se règlent en ligne (mobile money ou carte) ou à nos bureaux, en une fois ou avec un acompte." },
  { q: 'Mon entreprise peut-elle former toute une équipe ?', r: "Oui, c'est notre programme Renforcement de capacité. Les modules durent de 1 à 3 jours et s'adaptent à vos objectifs. Demandez un devis en ligne, nous revenons vers vous sous 24 h." },
  { q: 'Que se passe-t-il si je suis interrompu pendant l\'inscription ?', r: 'Chaque étape est enregistrée. Vous reprenez exactement où vous étiez, depuis n\'importe quel téléphone, avec votre numéro WhatsApp.' },
];

// ------------------------------------------------ reglages par defaut
export const DEFAULT_SETTINGS = {
  ecole: ECOLE,
  tarifs: { devise: '$', tva: 16, acompte_pct: 50, mention: 'HT' },
  parrainage: { actif: true, remise_filleul_pct: 10, recompense: '10 % de remise sur votre prochaine formation pour chaque filleul inscrit' },
  certificats: { seuil_presence_pct: 75, signataire: 'La Direction', signataire_titre: 'Modern Business School' },
  automation: {
    actif: true,
    heure_debut: 8, heure_fin: 20,
    max_par_jour: 2,
    relances_incompletes_heures: [1, 24, 72],
    relances_paiement_heures: [24, 96],
    rappels_session_jours: [3, 1],
    b2b_relance_heures: 24,
  },
  integrations: {
    anthropic_key: '', ai_model: 'claude-opus-5-5', ai_actif: true,
    whatsapp_token: '', whatsapp_phone_id: '',
    email_provider: 'brevo', email_key: '', email_from: '', email_from_nom: 'Modern Business School',
    paiement_url: '', webhook_secret: '',
    meta_pixel: '', ga_id: '',
    url_publique: '',
  },
  assistant: {
    nom: 'Ama',
    accueil: "Bonjour ! Je suis Ama, l'assistante virtuelle de Modern Business School. Je peux vous aider à choisir une formation, vous donner les dates et les tarifs, ou vous guider pour l'inscription. Que cherchez-vous ?",
    base_connaissance: '',
  },
  templates: {
    relance_incomplete_1: "Bonjour {{prenom}} 👋 C'est Modern Business School. Votre inscription à « {{formation}} » est presque terminée. Il ne reste que quelques questions : {{lien_reprise}}",
    relance_incomplete_2: "{{prenom}}, votre place pour « {{formation}} » ({{dates}}) vous attend encore. Reprenez exactement où vous étiez, ça prend une minute : {{lien_reprise}}",
    relance_incomplete_3: "Dernier rappel {{prenom}} : il reste {{places}} places pour « {{formation}} ». Si vous avez une question, répondez simplement à ce message. {{lien_reprise}}",
    inscription_confirmee: "Bravo {{prenom}} 🎉 Votre inscription à « {{formation}} » est validée ({{dates}}, {{horaire}}). Montant : {{montant}}. Votre espace : {{lien_espace}}",
    relance_paiement_1: "Bonjour {{prenom}}, pour confirmer votre place à « {{formation}} », il reste {{reste}} à régler. Paiement en ligne en une minute : {{lien_paiement}}",
    relance_paiement_2: "{{prenom}}, les places pour « {{formation}} » partent vite. Réglez {{reste}} pour garder la vôtre : {{lien_paiement}} (ou à nos bureaux).",
    paiement_recu: "Merci {{prenom}} ! Nous avons bien reçu {{montant_paye}}. Reste à payer : {{reste}}. À très vite pour « {{formation}} ».",
    rappel_session: "C'est bientôt {{prenom}} ! « {{formation}} » commence le {{date_debut}} à {{horaire}}, {{lieu}}. Pensez à votre ordinateur ou smartphone chargé. Votre espace : {{lien_espace}}",
    certificat: "Félicitations {{prenom}} 🎓 Votre certificat « {{formation}} » est disponible : {{lien_certificat}}. Partagez-le sur LinkedIn !",
    avis: "{{prenom}}, merci d'avoir suivi « {{formation}} ». Votre avis compte : comment noteriez-vous la formation sur 10 ? Répondez simplement à ce message.",
    b2b_accuse: "Bonjour {{contact}}, merci pour votre demande au nom de {{societe}}. Un conseiller MBS vous contacte sous 24 h pour affiner votre programme. Estimation indicative : {{devis}}.",
    report: "Bonjour {{prenom}}, information importante : la session « {{formation}} » est déplacée au {{dates}}. Votre inscription reste valable. Une question ? Répondez à ce message.",
  },
};
