import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasCellarUser: !!process.env.CELLARTRACKER_USER,
  });
});

// ─── CELLARTRACKER PROXY ──────────────────────────────────────────────────────
// Called by the frontend to load the cave — credentials stay server-side
app.get('/api/cave', async (req, res) => {
  const user = process.env.CELLARTRACKER_USER;
  const pass = process.env.CELLARTRACKER_PASS;

  if (!user || !pass) {
    return res.status(400).json({ error: 'CellarTracker credentials not configured on server.' });
  }

  try {
    const url = `https://www.cellartracker.com/api.asp?User=${encodeURIComponent(user)}&Password=${encodeURIComponent(pass)}&Type=Inventory&Format=xml`;
    const ctResp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!ctResp.ok) throw new Error(`CellarTracker HTTP ${ctResp.status}`);
    const xml = await ctResp.text();
    if (xml.toLowerCase().includes('<e>') || xml.toLowerCase().includes('invalid user')) {
      return res.status(401).json({ error: 'CellarTracker credentials invalid.' });
    }
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    res.status(502).json({ error: `CellarTracker fetch failed: ${e.message}` });
  }
});

// ─── CELLARTRACKER PROXY WITH INLINE CREDENTIALS ──────────────────────────────
// Used when credentials are not configured server-side (user enters them in UI)
app.get('/api/cave-proxy', async (req, res) => {
  const user = req.query.user || process.env.CELLARTRACKER_USER;
  const pass = req.query.pass || process.env.CELLARTRACKER_PASS;

  if (!user || !pass) {
    return res.status(400).json({ error: 'CellarTracker credentials missing.' });
  }

  try {
    const url = `https://www.cellartracker.com/api.asp?User=${encodeURIComponent(user)}&Password=${encodeURIComponent(pass)}&Type=Inventory&Format=xml`;
    const ctResp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!ctResp.ok) throw new Error(`CellarTracker HTTP ${ctResp.status}`);
    const xml = await ctResp.text();
    if (xml.toLowerCase().includes('<e>') || xml.toLowerCase().includes('invalid user')) {
      return res.status(401).json({ error: 'Identifiants CellarTracker incorrects.' });
    }
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (e) {
    res.status(502).json({ error: `CellarTracker fetch failed: ${e.message}` });
  }
});

// ─── ANTHROPIC PROXY ──────────────────────────────────────────────────────────
// Proxies requests to Anthropic — API key never exposed to the browser
app.post('/api/pairing', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured on server.' });
  }

  const { dish, wines } = req.body;
  if (!dish || !wines) {
    return res.status(400).json({ error: 'Missing dish or wines in request body.' });
  }

  const CURRENT_YEAR = new Date().getFullYear();

  const systemPrompt = `Tu es le sommelier en chef des 110 de Taillevent, référence mondiale des accords mets-vins.
Pour chaque plat, tu sélectionnes EXACTEMENT 4 bouteilles, une par catégorie Taillevent.

━━━ LES 4 ACCORDS TAILLEVENT ━━━

1. SÉRÉNITÉ 🕊️ — Le classique rassurant, la référence reconnue de tous.
   Ex : Sauternes sur foie gras, Chablis sur huîtres, grand Bordeaux sur agneau.

2. RÉVÉLATION ✨ — Le coup de cœur du sommelier : vigneron confidentiel, terroir émergent,
   cuvée méconnue qui surpasse sa réputation. Bio/biodynamique privilégié.

3. AUDACE 🎯 — L'accord de contraste ou surprise : un vin qui a priori n'est pas évident
   mais crée une sensation inédite. Cépage rare, région inattendue, accord opposé.
   Jamais la même appellation que Sérénité.

4. PLÉNITUDE 🌕 — Le vin à son apogée exacte maintenant (${CURRENT_YEAR}).
   Priorité aux bouteilles dont drinkTo est proche ou dépassé.

━━━ SOURCES OBLIGATOIRES (via web_search) ━━━
Avant de répondre, cherche :
A) "les 110 de taillevent [plat] accord vin"
B) "chaisdoeuvre.fr [plat] accord vin"
Note les cépages et styles recommandés par ces deux références.

━━━ FORMAT JSON STRICT ━━━
Réponds UNIQUEMENT avec du JSON valide, zéro markdown, zéro backtick.
{
  "dish_analysis": "Profil gustatif du plat, 1-2 phrases",
  "sources_consulted": "Ce que tu as trouvé sur les 110 de Taillevent et Chais d'oeuvre",
  "selected_wines": [
    {
      "id": <number>,
      "taillevent_category": <"serenite"|"revelation"|"audace"|"plenitude">,
      "accord_score": <1-10>,
      "pairing_comment": <"2-3 phrases : pourquoi ce vin, pourquoi cette catégorie">,
      "why_this_vintage": <"1 phrase sur ce millésime">,
      "taillevent_inspiration": <"1 phrase si inspiré des 110 ou Chais d'oeuvre, sinon null">
    }
  ]
}`;

  const userPrompt = `Plat : "${dish}"
Cave (${wines.length} bouteilles) :
${JSON.stringify(wines, null, 2)}
Sélectionne EXACTEMENT 4 vins, un par catégorie Taillevent. Fais tes recherches web d'abord.`;

  try {
    // Stream the response back to the client
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!anthropicResp.ok) {
      const err = await anthropicResp.json();
      return res.status(anthropicResp.status).json({ error: err.error?.message || 'Anthropic error' });
    }

    const data = await anthropicResp.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: `Anthropic fetch failed: ${e.message}` });
  }
});

// ─── STATIC CAVE FALLBACK (My_Bottles.csv embedded as JSON) ─────────────────
// This is served when CellarTracker credentials are not configured
import { readFileSync } from 'fs';

let preloadedWines = [];
try {
  const raw = readFileSync(new URL('./data/wines.json', import.meta.url), 'utf-8');
  preloadedWines = JSON.parse(raw);
  console.log(`   Pre-loaded cave: ${preloadedWines.length} bottles`);
} catch(e) {
  console.warn('   No pre-loaded cave data found (data/wines.json missing)');
}

app.get('/api/cave-fallback', (req, res) => {
  res.json(preloadedWines);
});

// ─── FALLBACK ────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🍷 Cave & Table running on http://localhost:${PORT}`);
  console.log(`   Anthropic key: ${process.env.ANTHROPIC_API_KEY ? '✓ configured' : '✗ missing'}`);
  console.log(`   CellarTracker: ${process.env.CELLARTRACKER_USER ? '✓ configured' : '✗ missing (will use pre-loaded data)'}`);
});
