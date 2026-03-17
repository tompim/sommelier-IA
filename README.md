# 🍷 Cave & Table — Accord Mets-Vins

Application d'accords mets-vins basée sur la méthode des **110 de Taillevent** (Sérénité · Révélation · Audace · Plénitude), alimentée par votre cave CellarTracker et Claude AI.

---

## Déploiement en 3 étapes

### Étape 1 — GitHub

```bash
# Dans ce dossier
git init
git add .
git commit -m "Initial commit"

# Créer un repo sur github.com puis :
git remote add origin https://github.com/VOTRE_USERNAME/cave-sommelier.git
git push -u origin main
```

---

### Étape 2 — Render

1. Aller sur **[render.com](https://render.com)** → *New* → **Web Service**
2. Connecter votre repo GitHub
3. Remplir les champs :
   - **Name** : `cave-sommelier` (ou ce que vous voulez)
   - **Runtime** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
4. Cliquer **Create Web Service**

---

### Étape 3 — Variables d'environnement sur Render

Dans votre service Render → onglet **Environment** → ajouter :

| Variable | Valeur | Obligatoire |
|----------|--------|-------------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | ✅ Oui |
| `CELLARTRACKER_USER` | votre login CT | Non (données mars 2026 utilisées sinon) |
| `CELLARTRACKER_PASS` | votre mot de passe CT | Non |

> 💡 Obtenir une clé Anthropic : [console.anthropic.com](https://console.anthropic.com/settings/keys)

---

## Développement local

```bash
# 1. Installer les dépendances
npm install

# 2. Créer votre fichier .env
cp .env.example .env
# Puis éditer .env avec vos valeurs

# 3. Lancer
npm run dev
# → http://localhost:3000
```

---

## Architecture

```
cave-sommelier/
├── server.js          # Express — proxy Anthropic + CellarTracker
├── package.json
├── .env.example       # Template variables d'environnement
├── .gitignore         # .env et node_modules exclus
└── public/
    └── index.html     # Frontend (appelle /api/cave et /api/pairing)
```

**Fonctionnement :**
- Le frontend appelle `/api/cave` → le serveur récupère votre cave CellarTracker avec les identifiants serveur
- Le frontend appelle `/api/pairing` → le serveur appelle Anthropic avec la clé API serveur
- **Aucune clé ni identifiant n'est exposé dans le navigateur**
- Si CellarTracker n'est pas configuré, les 535 bouteilles de mars 2026 sont utilisées en fallback

---

## Structure des données

```
data/
└── wines.json    # 535 bouteilles (Nice LP + Paris) — fallback serveur
public/
└── index.html    # Même données embarquées en fallback navigateur
```

Les deux sont synchronisés. Pour mettre à jour :

## Mise à jour de la cave

Pour mettre à jour les données pré-chargées avec votre cave actuelle :

1. Aller sur **cellartracker.com** → Reports → Export → Tab-Delimited
2. Remplacer le fichier `My_Cellar_txt.tsv` et relancer le script d'injection (ou reconfigurer les variables `CELLARTRACKER_USER`/`PASS` sur Render pour un chargement automatique)
