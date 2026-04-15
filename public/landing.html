<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Soraki — Sorare Analytics</title>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #04060f; font-family: 'Rajdhani', sans-serif; overflow-x: hidden; }

@keyframes holo-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes float { 0%, 100% { transform: translateY(0px) rotate(-3deg); } 50% { transform: translateY(-12px) rotate(-3deg); } }
@keyframes float2 { 0%, 100% { transform: translateY(0px) rotate(2deg); } 50% { transform: translateY(-18px) rotate(2deg); } }
@keyframes float3 { 0%, 100% { transform: translateY(0px) rotate(-1deg); } 50% { transform: translateY(-8px) rotate(-1deg); } }
@keyframes float4 { 0%, 100% { transform: translateY(0px) rotate(3deg); } 50% { transform: translateY(-14px) rotate(3deg); } }
@keyframes float5 { 0%, 100% { transform: translateY(0px) rotate(-2deg); } 50% { transform: translateY(-10px) rotate(-2deg); } }
@keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
@keyframes star-twinkle { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }

.holo-text {
  background: linear-gradient(90deg, #ff6ec7, #ff9a3c, #ffe84d, #7dff6b, #4de8ff, #8a7fff, #ff6ec7, #ff9a3c);
  background-size: 300% auto;
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text; animation: holo-shift 4s linear infinite;
}

.holo-border { position: relative; }
.holo-border::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c, #ff6ec7);
  background-size: 300% auto; animation: holo-shift 3s linear infinite;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
}

/* Stars background */
.stars { position: fixed; inset: 0; z-index: 0; overflow: hidden; }
.star { position: absolute; width: 2px; height: 2px; background: #fff; border-radius: 50%; animation: star-twinkle linear infinite; }

/* Scanline */
.scanline-wrap { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 1; }
.scanline { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(77,232,255,0.05), transparent); animation: scanline 8s linear infinite; }

/* NAV */
nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 48px;
  background: rgba(4,6,15,0.85); backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.nav-logo { font-size: 18px; font-weight: 700; letter-spacing: 3px; }
.nav-links { display: flex; gap: 32px; align-items: center; }
.nav-link { color: rgba(255,255,255,0.4); font-family: 'Share Tech Mono', monospace; font-size: 12px; letter-spacing: 2px; text-decoration: none; text-transform: uppercase; transition: color 0.2s; }
.nav-link:hover { color: #4de8ff; }
.nav-cta {
  background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c);
  background-size: 300% auto; animation: holo-shift 3s linear infinite;
  border: none; border-radius: 8px; padding: 10px 24px;
  color: #04060f; font-family: 'Rajdhani', sans-serif; font-weight: 700;
  font-size: 14px; letter-spacing: 2px; cursor: pointer; text-transform: uppercase;
  text-decoration: none; display: inline-block;
}

/* HERO */
.hero {
  position: relative; z-index: 2;
  min-height: 100vh; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 120px 48px 60px; text-align: center;
}

.hero-tag {
  font-family: 'Share Tech Mono', monospace; font-size: 11px; letter-spacing: 4px;
  color: rgba(255,255,255,0.3); text-transform: uppercase; margin-bottom: 16px;
}
.hero-title { font-size: clamp(48px, 8vw, 96px); font-weight: 700; line-height: 1; letter-spacing: 3px; margin-bottom: 16px; }
.hero-sub { font-size: 16px; color: rgba(255,255,255,0.4); font-family: 'Share Tech Mono', monospace; letter-spacing: 1px; margin-bottom: 8px; }
.hero-sub2 { font-size: 13px; color: rgba(255,255,255,0.25); font-family: 'Share Tech Mono', monospace; margin-bottom: 40px; }

.hero-btns { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 80px; }
.btn-primary {
  background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c);
  background-size: 300% auto; animation: holo-shift 3s linear infinite;
  border: none; border-radius: 12px; padding: 16px 36px;
  color: #04060f; font-family: 'Rajdhani', sans-serif; font-weight: 700;
  font-size: 16px; letter-spacing: 2px; cursor: pointer; text-transform: uppercase;
  text-decoration: none; display: inline-block; transition: filter 0.2s;
}
.btn-primary:hover { filter: brightness(1.15); }
.btn-secondary {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15);
  border-radius: 12px; padding: 16px 36px; color: rgba(255,255,255,0.6);
  font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: 16px;
  letter-spacing: 2px; cursor: pointer; text-transform: uppercase;
  text-decoration: none; display: inline-block; transition: all 0.2s;
}
.btn-secondary:hover { background: rgba(255,255,255,0.08); color: #fff; }

/* CARDS HERO */
.cards-hero {
  display: flex; align-items: flex-end; justify-content: center;
  gap: 16px; margin-bottom: 0; position: relative; width: 100%; max-width: 900px;
}

.player-card {
  background: linear-gradient(160deg, #1a1040 0%, #0d0820 50%, #080412 100%);
  border-radius: 16px; overflow: hidden; position: relative;
  box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.player-card::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(255,110,199,0.15), rgba(77,232,255,0.1), rgba(138,127,255,0.15));
  z-index: 1;
}
.card-sm { width: 130px; height: 185px; animation: float 4s ease-in-out infinite; }
.card-md { width: 155px; height: 220px; animation: float2 3.5s ease-in-out infinite; }
.card-lg { width: 180px; height: 255px; animation: float3 4.5s ease-in-out infinite; z-index: 3; }
.card-sm2 { width: 140px; height: 200px; animation: float4 3.8s ease-in-out infinite; }
.card-sm3 { width: 125px; height: 178px; animation: float5 4.2s ease-in-out infinite; }

.card-gradient {
  position: absolute; bottom: 0; left: 0; right: 0; height: 60%;
  background: linear-gradient(to top, #080412 0%, transparent 100%);
  z-index: 2;
}
.card-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 12px; z-index: 3; }
.card-name { font-size: 14px; font-weight: 700; color: #fff; line-height: 1.1; letter-spacing: 0.5px; }
.card-pos { font-size: 10px; font-family: 'Share Tech Mono', monospace; color: rgba(255,255,255,0.4); margin-top: 2px; }
.card-score { position: absolute; top: 10px; right: 10px; z-index: 3; font-family: 'Share Tech Mono', monospace; font-size: 22px; font-weight: 700; color: #fff; text-shadow: 0 0 12px rgba(77,232,255,0.8); }
.card-rarity-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 3; }

.card-avatar {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 48px; color: rgba(255,255,255,0.1); position: relative; z-index: 1;
}
.card-initials {
  font-size: 32px; font-weight: 700; color: rgba(255,255,255,0.15);
  font-family: 'Rajdhani', sans-serif; letter-spacing: 2px;
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -60%);
  z-index: 1;
}

/* FEATURES */
.features {
  position: relative; z-index: 2;
  padding: 80px 48px; max-width: 1200px; margin: 0 auto;
}
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }

.feature-card {
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px; padding: 28px; transition: all 0.3s; cursor: pointer;
  text-decoration: none; display: block;
}
.feature-card:hover { background: rgba(255,255,255,0.05); transform: translateY(-4px); border-color: rgba(77,232,255,0.2); }
.feature-icon { font-size: 24px; margin-bottom: 16px; display: block; }
.feature-tag { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 3px; color: rgba(255,255,255,0.25); text-transform: uppercase; margin-bottom: 8px; }
.feature-title { font-size: 22px; font-weight: 700; color: #f1f5f9; letter-spacing: 1px; margin-bottom: 10px; }
.feature-desc { font-size: 13px; color: rgba(255,255,255,0.35); font-family: 'Share Tech Mono', monospace; line-height: 1.7; }
.feature-list { margin-top: 16px; display: flex; flex-direction: column; gap: 6px; }
.feature-item { font-size: 12px; font-family: 'Share Tech Mono', monospace; color: rgba(255,255,255,0.3); display: flex; align-items: center; gap: 8px; }
.feature-item::before { content: '→'; color: #4de8ff; flex-shrink: 0; }
.feature-badge { display: inline-block; font-size: 10px; font-family: 'Share Tech Mono', monospace; padding: 2px 8px; border-radius: 4px; margin-top: 16px; }

/* MODELS SECTION */
.models-section {
  position: relative; z-index: 2;
  padding: 40px 48px 80px; max-width: 1200px; margin: 0 auto;
}
.section-label { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 4px; color: rgba(255,255,255,0.2); text-transform: uppercase; text-align: center; margin-bottom: 12px; }
.section-title { font-size: 36px; font-weight: 700; text-align: center; color: #f1f5f9; letter-spacing: 2px; margin-bottom: 8px; }
.section-sub { font-size: 13px; color: rgba(255,255,255,0.3); font-family: 'Share Tech Mono', monospace; text-align: center; margin-bottom: 40px; }

.models-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
.model-box {
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; padding: 16px 12px; text-align: center;
}
.model-id { font-size: 14px; font-weight: 700; font-family: 'Share Tech Mono', monospace; margin-bottom: 6px; }
.model-name { font-size: 11px; color: rgba(255,255,255,0.3); font-family: 'Share Tech Mono', monospace; margin-bottom: 8px; }
.model-formula { font-size: 10px; color: rgba(255,255,255,0.2); font-family: 'Share Tech Mono', monospace; line-height: 1.5; }

/* CTA BOTTOM */
.cta-section {
  position: relative; z-index: 2;
  padding: 60px 48px 100px; text-align: center;
}
.cta-box {
  max-width: 600px; margin: 0 auto;
  background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 24px; padding: 48px;
}
.cta-title { font-size: 36px; font-weight: 700; letter-spacing: 2px; margin-bottom: 12px; }
.cta-sub { font-size: 13px; color: rgba(255,255,255,0.3); font-family: 'Share Tech Mono', monospace; margin-bottom: 32px; line-height: 1.7; }

/* FOOTER */
footer {
  position: relative; z-index: 2;
  border-top: 1px solid rgba(255,255,255,0.05);
  padding: 24px 48px;
  display: flex; justify-content: space-between; align-items: center;
}
.footer-text { font-family: 'Share Tech Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.2); }

/* Responsive */
@media (max-width: 768px) {
  nav { padding: 12px 20px; }
  .nav-links { gap: 16px; }
  .hero { padding: 100px 20px 40px; }
  .features { padding: 40px 20px; }
  .features-grid { grid-template-columns: 1fr; }
  .models-grid { grid-template-columns: repeat(3, 1fr); }
  .models-section { padding: 40px 20px; }
  .cta-section { padding: 40px 20px 60px; }
  .cards-hero { gap: 8px; }
  .card-sm, .card-sm2, .card-sm3 { display: none; }
  footer { padding: 20px; flex-direction: column; gap: 8px; text-align: center; }
}
</style>
</head>
<body>

<!-- Stars -->
<div class="stars" id="stars"></div>
<div class="scanline-wrap"><div class="scanline"></div></div>

<!-- NAV -->
<nav>
  <div class="nav-logo holo-text">◈ SORAKI</div>
  <div class="nav-links">
    <a href="#features" class="nav-link">Features</a>
    <a href="#modeles" class="nav-link">Modèles</a>
    <a href="/" class="nav-cta">Accéder →</a>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="hero-tag">◈ Sorare Analytics · Gratuit · Sans mot de passe</div>
  <h1 class="hero-title holo-text">SORAKI</h1>
  <p class="hero-sub">L'outil d'analyse Sorare SO5 qui apprend à te connaître</p>
  <p class="hero-sub2">6 modèles prédictifs · Compo optimisée · Scores réels automatiques · Historique persistant</p>

  <div class="hero-btns">
    <a href="/" class="btn-primary">SO5 Optimizer →</a>
    <a href="/" class="btn-secondary">Voir les projections</a>
  </div>

  <!-- Fake player cards -->
  <div class="cards-hero">
    <!-- Card 1 -->
    <div class="player-card card-sm">
      <div class="card-rarity-bar" style="background: linear-gradient(90deg, #ef4444, #dc2626);"></div>
      <div class="card-initials">FM</div>
      <div class="card-gradient"></div>
      <div class="card-score" style="color: #4de8ff;">72</div>
      <div class="card-info">
        <div class="card-name">F. MENDY</div>
        <div class="card-pos">DEF · Real Madrid</div>
      </div>
    </div>

    <!-- Card 2 -->
    <div class="player-card card-md">
      <div class="card-rarity-bar" style="background: linear-gradient(90deg, #f97316, #ea580c);"></div>
      <div class="card-initials">AS</div>
      <div class="card-gradient"></div>
      <div class="card-score" style="color: #4de8ff;">57</div>
      <div class="card-info">
        <div class="card-name">A. SCOTT</div>
        <div class="card-pos">MID · Bournemouth</div>
      </div>
    </div>

    <!-- Card 3 - CENTER HERO -->
    <div class="player-card card-lg holo-border">
      <div class="card-rarity-bar" style="background: linear-gradient(90deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c); background-size: 300% auto; animation: holo-shift 2s linear infinite;"></div>
      <div class="card-initials" style="font-size: 42px; color: rgba(255,255,255,0.2);">MG</div>
      <div class="card-gradient"></div>
      <div class="card-score" style="color: #facc15; font-size: 28px; text-shadow: 0 0 16px rgba(250,204,21,0.8);">88</div>
      <div class="card-info" style="padding: 14px;">
        <div class="card-name" style="font-size: 17px;">M. GILLESPIE</div>
        <div class="card-pos">GK · Newcastle</div>
      </div>
    </div>

    <!-- Card 4 -->
    <div class="player-card card-sm2">
      <div class="card-rarity-bar" style="background: linear-gradient(90deg, #c084fc, #9333ea);"></div>
      <div class="card-initials">DU</div>
      <div class="card-gradient"></div>
      <div class="card-score" style="color: #4de8ff;">43</div>
      <div class="card-info">
        <div class="card-name">D. UDOGIE</div>
        <div class="card-pos">DEF · Tottenham</div>
      </div>
    </div>

    <!-- Card 5 -->
    <div class="player-card card-sm3">
      <div class="card-rarity-bar" style="background: linear-gradient(90deg, #6b7280, #4b5563);"></div>
      <div class="card-initials">SC</div>
      <div class="card-gradient"></div>
      <div class="card-score" style="color: #4de8ff;">46</div>
      <div class="card-info">
        <div class="card-name">S. CHUKWUEZE</div>
        <div class="card-pos">FWD · Fulham</div>
      </div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="features" id="features">
  <div class="features-grid">

    <!-- SO5 Optimizer -->
    <a href="/" class="feature-card holo-border">
      <span class="feature-icon">⚡</span>
      <div class="feature-tag">Feature 01</div>
      <div class="feature-title">SO5 OPTIMIZER</div>
      <div class="feature-desc">Génère ta meilleure compo automatiquement depuis ta galerie Sorare.</div>
      <div class="feature-list">
        <div class="feature-item">Optimisation par score L15</div>
        <div class="feature-item">Détection bonus Cap + Multi-Club</div>
        <div class="feature-item">DOM / EXT · Prochain match</div>
        <div class="feature-item">Projection officielle Sorare</div>
        <div class="feature-item">Filtre par rareté</div>
      </div>
      <div class="feature-badge" style="background: rgba(77,232,255,0.08); color: #4de8ff; border: 1px solid rgba(77,232,255,0.2);">Gratuit · Sans mot de passe</div>
    </a>

    <!-- Projections -->
    <a href="/" class="feature-card holo-border">
      <span class="feature-icon">📊</span>
      <div class="feature-tag">Feature 02</div>
      <div class="feature-title">PROJECTIONS</div>
      <div class="feature-desc">6 modèles prédictifs en compétition sur tes cartes football réelles.</div>
      <div class="feature-list">
        <div class="feature-item">Snapshot pré-GW automatique</div>
        <div class="feature-item">Scores réels récupérés post-GW</div>
        <div class="feature-item">MAE par modèle · Convergence</div>
        <div class="feature-item">Historique persistant local</div>
        <div class="feature-item">Zéro doublon · Semaine ISO</div>
      </div>
      <div class="feature-badge" style="background: rgba(127,119,221,0.08); color: #8a7fff; border: 1px solid rgba(127,119,221,0.2);">Apprend chaque GW</div>
    </a>

    <!-- Database -->
    <a href="/" class="feature-card" style="border-color: rgba(255,255,255,0.05);">
      <span class="feature-icon">🗄️</span>
      <div class="feature-tag">Feature 03 · Bientôt</div>
      <div class="feature-title">DATABASE</div>
      <div class="feature-desc">Base de données complète des joueurs des 5 grands championnats.</div>
      <div class="feature-list">
        <div class="feature-item" style="color: rgba(255,255,255,0.2);">L5 / L10 / L15 / L40 réels</div>
        <div class="feature-item" style="color: rgba(255,255,255,0.2);">D-Score propriétaire</div>
        <div class="feature-item" style="color: rgba(255,255,255,0.2);">Filtre par compétition / poste</div>
        <div class="feature-item" style="color: rgba(255,255,255,0.2);">Surbrillance galerie perso</div>
        <div class="feature-item" style="color: rgba(255,255,255,0.2);">Tri par colonne</div>
      </div>
      <div class="feature-badge" style="background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.08);">Disponible avec clé API</div>
    </a>

  </div>
</section>

<!-- MODELS -->
<section class="models-section" id="modeles">
  <div class="section-label">Intelligence artificielle</div>
  <h2 class="section-title">6 MODÈLES EN COMPÉTITION</h2>
  <p class="section-sub">Chaque semaine, les modèles projettent tes joueurs. Le meilleur converge vers la réalité.</p>

  <div class="models-grid">
    <div class="model-box" style="border-color: rgba(136,135,128,0.2);">
      <div class="model-id" style="color: #888780;">M1</div>
      <div class="model-name">Baseline</div>
      <div class="model-formula">score = L15</div>
    </div>
    <div class="model-box" style="border-color: rgba(55,138,221,0.2);">
      <div class="model-id" style="color: #378ADD;">M2</div>
      <div class="model-name">Forme</div>
      <div class="model-formula">0.6·L5 + 0.4·L15</div>
    </div>
    <div class="model-box" style="border-color: rgba(29,158,117,0.2);">
      <div class="model-id" style="color: #1D9E75;">M3</div>
      <div class="model-name">Sorare</div>
      <div class="model-formula">projection officielle</div>
    </div>
    <div class="model-box" style="border-color: rgba(186,117,23,0.2);">
      <div class="model-id" style="color: #BA7517;">M4</div>
      <div class="model-name">Localisation</div>
      <div class="model-formula">L15 × dom/ext</div>
    </div>
    <div class="model-box holo-border">
      <div class="model-id holo-text">M5</div>
      <div class="model-name">Composite</div>
      <div class="model-formula">α·L5 + β·L15 + γ·dom + δ·adv</div>
    </div>
    <div class="model-box" style="border-color: rgba(99,153,34,0.2);">
      <div class="model-id" style="color: #639922;">M6</div>
      <div class="model-name">Tendance</div>
      <div class="model-formula">L15 + λ·(L5−L15)</div>
    </div>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <div class="cta-box holo-border">
    <h2 class="cta-title holo-text">PRÊT À OPTIMISER ?</h2>
    <p class="cta-sub">Entre ton slug Sorare et génère ta meilleure compo SO5 en quelques secondes.<br>Gratuit · Sans mot de passe · Sans inscription.</p>
    <a href="/" class="btn-primary">Accéder à Soraki →</a>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="footer-text">◈ SORAKI · Outil non officiel · Non affilié à Sorare</div>
  <div class="footer-text">Fait avec ❤ par rakijako</div>
</footer>

<script>
// Generate stars
const starsContainer = document.getElementById('stars');
for (let i = 0; i < 120; i++) {
  const star = document.createElement('div');
  star.className = 'star';
  star.style.left = Math.random() * 100 + '%';
  star.style.top = Math.random() * 100 + '%';
  star.style.opacity = Math.random() * 0.6 + 0.1;
  star.style.width = Math.random() * 2 + 1 + 'px';
  star.style.height = star.style.width;
  star.style.animationDuration = (Math.random() * 4 + 2) + 's';
  star.style.animationDelay = (Math.random() * 4) + 's';
  starsContainer.appendChild(star);
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
  });
});
</script>
</body>
</html>
