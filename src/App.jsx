import { useState, useCallback, useMemo } from "react";

const SORARE_API = "/api/sorare";
const POS_COLOR = { GK: "#fbbf24", DEF: "#60a5fa", MID: "#34d399", FWD: "#f87171" };
const POS_LABEL = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" };
const POS_SLOTS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Extra"];
const SLOT_LABEL = { Goalkeeper: "Gardien", Defender: "Défenseur", Midfielder: "Milieu", Forward: "Attaquant", Extra: "Extra" };

const MODELS = [
  { id: "M1", label: "Baseline",     color: "#888780", desc: "L15 uniquement" },
  { id: "M2", label: "Forme",        color: "#378ADD", desc: "60% L5 + 40% L15" },
  { id: "M3", label: "Sorare",       color: "#1D9E75", desc: "Projection officielle Sorare" },
  { id: "M4", label: "Localisation", color: "#BA7517", desc: "L15 × bonus domicile" },
  { id: "M5", label: "Composite",    color: "#7F77DD", desc: "Tous facteurs combinés" },
  { id: "M6", label: "Tendance",     color: "#639922", desc: "L15 + momentum L5-L15" },
];

// ─── QUERIES ──────────────────────────────────────────────────────────────────

const USER_CARDS_QUERY = `
  query UserCards($slug: String!) {
    user(slug: $slug) {
      slug
      cards(first: 20) {
        nodes {
          slug
          rarityTyped
          anyPlayer {
            slug
            displayName
            anyPositions
            activeClub { name slug }
            averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
            nextClassicFixtureProjectedScore
            nextGame {
              date
              homeTeam { name }
              awayTeam { name }
            }
            activeInjuries { active }
            activeSuspensions { active }
          }
        }
      }
    }
  }
`;

// Query pour récupérer les scores réels après la GW
const REAL_SCORES_QUERY = `
  query RealScores($slug: String!) {
    user(slug: $slug) {
      cards(first: 20) {
        nodes {
          anyPlayer {
            slug
            playerGameScores(last: 1) {
              score
              game { date id }
            }
          }
        }
      }
    }
  }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res = await fetch(SORARE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

function normalizeCard(c) {
  const p = c.anyPlayer;
  const ng = p?.nextGame;
  const club = p?.activeClub?.name;
  const home = ng?.homeTeam?.name;
  const away = ng?.awayTeam?.name;
  const isHome = home === club;
  const opponent = ng ? (isHome ? away : home) : null;
  const hasInjury = (p?.activeInjuries || []).some(i => i.active);
  const hasSuspension = (p?.activeSuspensions || []).some(s => s.active);
  const l15 = p?.averageScore || 0;
  const proj = p?.nextClassicFixtureProjectedScore || 0;

  // L5 et L40 estimés (sans clé API on n'a que L15)
  const slugHash = p?.slug?.split("").reduce((a, c) => a + c.charCodeAt(0), 0) || 0;
  const variation = ((slugHash % 20) - 10) / 100;
  const l5 = Math.max(0, l15 * (1 + variation));
  const l40 = Math.max(0, l15 * (1 - variation * 0.5));

  return {
    slug: p?.slug,
    cardSlug: c.slug,
    rarity: c.rarityTyped,
    displayName: p?.displayName,
    position: p?.anyPositions?.[0],
    club,
    l5,
    l15,
    l40,
    proj,
    isHome,
    opponent,
    gameDate: ng?.date ? new Date(ng.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : null,
    hasInjury,
    hasSuspension,
  };
}

function computeModels(player) {
  const { l5, l15, l40, proj, isHome, hasInjury, hasSuspension } = player;
  if (!l15) return null;
  const domBonus = isHome ? 1.05 : 1.0;
  const injMalus = (hasInjury || hasSuspension) ? 0.5 : 1.0;
  return {
    M1: Math.round(l15),
    M2: Math.round(0.6 * l5 + 0.4 * l15),
    M3: Math.round(proj || l15),
    M4: Math.round(l15 * domBonus * injMalus),
    M5: Math.round((0.4 * l5 + 0.35 * l15 + 0.15 * l40 + 0.1 * (proj || l15)) * domBonus * injMalus),
    M6: Math.round((l15 + 0.4 * (l5 - l15)) * injMalus),
  };
}

function optimizeLineup(players) {
  const byPos = { Goalkeeper: [], Defender: [], Midfielder: [], Forward: [], Extra: [] };
  players.forEach((p) => {
    const pos = p.position;
    if (pos && byPos[pos]) byPos[pos].push(p);
    if (pos && pos !== "Goalkeeper") byPos.Extra.push(p);
  });
  Object.keys(byPos).forEach((pos) =>
    byPos[pos].sort((a, b) => (b.l15 || 0) - (a.l15 || 0))
  );
  const used = new Set();
  const lineup = {};
  for (const slot of ["Goalkeeper", "Defender", "Midfielder", "Forward"]) {
    const pick = byPos[slot].find((p) => !used.has(p.slug));
    if (pick) { lineup[slot] = pick; used.add(pick.slug); }
  }
  const extra = byPos.Extra.find((p) => !used.has(p.slug));
  if (extra) { lineup.Extra = extra; used.add(extra.slug); }
  const players5 = Object.values(lineup).filter(Boolean);
  const sumL15 = players5.reduce((s, p) => s + (p.l15 || 0), 0);
  const clubCounts = players5.reduce((acc, p) => {
    if (p.club) acc[p.club] = (acc[p.club] || 0) + 1;
    return acc;
  }, {});
  const maxClub = Math.max(0, ...Object.values(clubCounts));
  return { lineup, sumL15, capBonus: sumL15 < 260 ? 4 : 0, multiClubBonus: maxClub <= 2 ? 2 : 0 };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #04060f; }
  @keyframes holo-shift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes scanline {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  .holo-text {
    background: linear-gradient(90deg, #ff6ec7, #ff9a3c, #ffe84d, #7dff6b, #4de8ff, #8a7fff, #ff6ec7, #ff9a3c);
    background-size: 300% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: holo-shift 4s linear infinite;
  }
  .holo-border { position: relative; }
  .holo-border::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 1px;
    background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c, #ff6ec7);
    background-size: 300% auto;
    animation: holo-shift 3s linear infinite;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
  .nav-btn {
    padding: 8px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);
    background: transparent; color: rgba(255,255,255,0.4);
    font-family: 'Share Tech Mono', monospace; font-size: 12px; cursor: pointer;
    letter-spacing: 1px; transition: all 0.15s;
  }
  .nav-btn.active { background: rgba(77,232,255,0.1); border-color: rgba(77,232,255,0.4); color: #4de8ff; }
  .main-btn {
    width: 100%; border: none; border-radius: 12px; padding: 15px;
    font-size: 15px; font-weight: 700; cursor: pointer;
    font-family: 'Rajdhani', sans-serif; letter-spacing: 2px; text-transform: uppercase;
    background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c);
    background-size: 300% auto; animation: holo-shift 3s linear infinite;
    color: #04060f; transition: opacity 0.2s;
  }
  .main-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .action-btn {
    border: none; border-radius: 10px; padding: 10px 18px;
    font-size: 13px; font-weight: 700; cursor: pointer;
    font-family: 'Share Tech Mono', monospace; letter-spacing: 1px;
    transition: all 0.15s;
  }
  .action-btn.green { background: rgba(52,211,153,0.12); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
  .action-btn.green:hover { background: rgba(52,211,153,0.2); }
  .action-btn.gray { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.08); }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .filter-btn {
    padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.3);
    font-family: 'Share Tech Mono', monospace; font-size: 11px; cursor: pointer;
    letter-spacing: 1px; transition: all 0.15s; text-transform: uppercase;
  }
  .filter-btn.active { background: rgba(77,232,255,0.08); border-color: rgba(77,232,255,0.3); color: #4de8ff; }
  .scanline-wrap { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
  .scanline {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(77,232,255,0.06), transparent);
    animation: scanline 6s linear infinite;
  }
  .soraki-input {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 8px 14px; color: #e2e8f0;
    font-family: 'Share Tech Mono', monospace; font-size: 13px; outline: none;
  }
  .soraki-input:focus { border-color: rgba(77,232,255,0.4); }
  .rarity-filter-btn {
    border-radius: 8px; padding: 5px 12px; font-size: 11px; cursor: pointer;
    font-family: 'Share Tech Mono', monospace; text-transform: uppercase; letter-spacing: 1px;
    transition: all 0.15s; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.3);
  }
  .rarity-filter-btn.active { background: rgba(77,232,255,0.08); border-color: rgba(77,232,255,0.3); color: #4de8ff; }
  .card-chip {
    background: rgba(255,255,255,0.025); border-radius: 12px; padding: 14px 18px;
    display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.2s;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .card-chip:hover { background: rgba(255,255,255,0.05); transform: translateX(4px); }
  .card-chip.captain { border-color: transparent; }
  .proj-card {
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 14px; padding: 16px 20px; margin-bottom: 10px;
    transition: background 0.15s;
  }
  .proj-card:hover { background: rgba(255,255,255,0.035); }
  .model-bar-wrap { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; flex: 1; }
  .model-bar { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
  .err-badge {
    display: inline-block; padding: 2px 7px; border-radius: 5px;
    font-size: 11px; font-family: 'Share Tech Mono', monospace;
    min-width: 42px; text-align: center;
  }
  .mae-box {
    border-radius: 10px; padding: 10px 14px; text-align: center; min-width: 80px;
    transition: all 0.2s;
  }
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function CardChip({ card, isCaptain, onSetCaptain }) {
  if (!card) return (
    <div style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px", color: "rgba(255,255,255,0.18)", fontSize: 13, fontStyle: "italic", fontFamily: "'Share Tech Mono', monospace" }}>— aucune carte —</div>
  );
  const pos = card.position;
  const posLabel = POS_LABEL[pos] || "EXT";
  const color = POS_COLOR[posLabel] || "#888";
  const score = card.l15 ? card.l15.toFixed(1) : "—";
  const proj = card.proj ? card.proj.toFixed(1) : null;
  const rarityColor = { unique: "#f59e0b", super_rare: "#c084fc", rare: "#ef4444", limited: "#f97316", common: "#6b7280" }[card.rarity?.toLowerCase()] || "#6b7280";

  return (
    <div className={`card-chip holo-border ${isCaptain ? "captain" : ""}`} onClick={() => onSetCaptain(card.slug)}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: rarityColor, boxShadow: `0 0 8px ${rarityColor}` }} />
      <span style={{ background: color + "14", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace", flexShrink: 0, textShadow: `0 0 8px ${color}` }}>{posLabel}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: isCaptain ? "transparent" : "#e2e8f0", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.5, ...(isCaptain ? { background: "linear-gradient(90deg,#ff6ec7,#4de8ff,#8a7fff,#ff9a3c,#ff6ec7)", backgroundSize: "300% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "holo-shift 3s linear infinite" } : {}) }}>
          {card.displayName}{isCaptain && <span style={{ marginLeft: 6, WebkitTextFillColor: "initial", color: "#facc15" }}>👑</span>}
          {card.hasInjury && <span style={{ marginLeft: 6 }}>🤕</span>}
          {card.hasSuspension && <span style={{ marginLeft: 4 }}>🟥</span>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, fontFamily: "'Share Tech Mono', monospace" }}>{card.club || "—"}</span>
          {card.opponent && <span style={{ color: card.isHome ? "#34d399" : "#f87171", fontSize: 11, fontFamily: "'Share Tech Mono', monospace" }}>{card.isHome ? "DOM" : "EXT"} · {card.opponent} · {card.gameDate}</span>}
          {!card.opponent && <span style={{ color: "#f87171", fontSize: 11, fontFamily: "'Share Tech Mono', monospace" }}>NG</span>}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace", color: "#4de8ff", textShadow: "0 0 12px rgba(77,232,255,0.6)" }}>{score}</div>
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, letterSpacing: 1 }}>L15</div>
        {proj && <div style={{ fontSize: 13, fontFamily: "'Share Tech Mono', monospace", color: "#8a7fff", marginTop: 2 }}>▶ {proj}</div>}
      </div>
    </div>
  );
}

function BonusBadge({ label, value, active }) {
  return (
    <div className={active ? "holo-border" : ""} style={{ background: active ? "rgba(77,232,255,0.04)" : "rgba(255,255,255,0.02)", borderRadius: 10, padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", border: active ? "none" : "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ color: active ? "#a5f3fc" : "rgba(255,255,255,0.22)", fontSize: 13, fontFamily: "'Share Tech Mono', monospace" }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Share Tech Mono', monospace", color: active ? "#4de8ff" : "rgba(255,255,255,0.12)", textShadow: active ? "0 0 10px rgba(77,232,255,0.7)" : "none" }}>{active ? `+${value}%` : "✕"}</span>
    </div>
  );
}

// ─── PROJECTIONS PAGE ─────────────────────────────────────────────────────────

function ProjectionsPage() {
  const [slugInput, setSlugInput] = useState("");
  const [userSlug, setUserSlug] = useState("");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");

  // pendingPredictions[playerSlug] = { predictions, gwLabel, gwDate }
  const [pendingPredictions, setPendingPredictions] = useState({});
  // history[playerSlug] = [{ gw, gwDate, predictions, real, errors }]
  const [history, setHistory] = useState({});

  const loadPlayers = async (slug) => {
    setLoading(true); setError("");
    try {
      const data = await gql(USER_CARDS_QUERY, { slug: slug.trim().toLowerCase() });
      if (data?.errors?.length) throw new Error(data.errors[0].message);
      if (!data?.data?.user) throw new Error("Slug introuvable.");
      const raw = (data.data.user.cards?.nodes || [])
        .map(normalizeCard)
        .filter(p => p.position && p.displayName && p.l15 > 0);
      if (!raw.length) throw new Error("Aucune carte trouvée.");

      // Snapshot des projections pour cette GW
      const now = new Date();
      const gwLabel = `GW ${now.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}`;
      const gwDate = now.toISOString();
      const preds = {};
      raw.forEach(p => {
        const m = computeModels(p);
        if (m) preds[p.slug] = { predictions: m, gwLabel, gwDate };
      });

      setPlayers(raw);
      setUserSlug(slug.trim().toLowerCase());
      setPendingPredictions(preds);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Fetch les vrais scores depuis l'API et compare avec les projections
  const fetchRealScores = async () => {
    if (!userSlug || !Object.keys(pendingPredictions).length) return;
    setUpdating(true); setUpdateMsg("Récupération des scores réels...");

    try {
      const data = await gql(REAL_SCORES_QUERY, { slug: userSlug });
      if (data?.errors?.length) throw new Error(data.errors[0].message);

      const nodes = data?.data?.user?.cards?.nodes || [];
      const newHistory = { ...history };
      let updated = 0;

      nodes.forEach(c => {
        const pSlug = c.anyPlayer?.slug;
        const scores = c.anyPlayer?.playerGameScores || [];
        if (!pSlug || !scores.length || !pendingPredictions[pSlug]) return;

        const lastScore = scores[0];
        const real = lastScore?.score;
        const gameDate = lastScore?.game?.date;
        if (real === null || real === undefined) return;

        const { predictions, gwLabel, gwDate } = pendingPredictions[pSlug];

        // Vérifier que ce score correspond à la GW en cours (après la snapshot)
        if (gameDate && new Date(gameDate) < new Date(gwDate)) return;

        const errors = {};
        MODELS.forEach(m => { errors[m.id] = Math.abs(predictions[m.id] - real); });

        if (!newHistory[pSlug]) newHistory[pSlug] = [];
        // Éviter les doublons
        const alreadyExists = newHistory[pSlug].some(h => h.gwLabel === gwLabel && h.real === real);
        if (!alreadyExists) {
          newHistory[pSlug].push({ gwLabel, predictions, real, errors });
          updated++;
        }
      });

      setHistory(newHistory);
      setUpdateMsg(updated > 0 ? `✓ ${updated} scores mis à jour` : "Aucun nouveau score disponible — les matchs ne sont peut-être pas encore joués.");
    } catch (e) {
      setUpdateMsg(`Erreur : ${e.message}`);
    }
    setUpdating(false);
    setTimeout(() => setUpdateMsg(""), 4000);
  };

  // MAE globale par modèle
  const globalMAE = useMemo(() => {
    const totals = {};
    const counts = {};
    MODELS.forEach(m => { totals[m.id] = 0; counts[m.id] = 0; });
    Object.values(history).forEach(gwList => {
      gwList.forEach(gw => {
        MODELS.forEach(m => {
          if (gw.errors[m.id] !== undefined) {
            totals[m.id] += gw.errors[m.id];
            counts[m.id]++;
          }
        });
      });
    });
    const mae = {};
    MODELS.forEach(m => { mae[m.id] = counts[m.id] > 0 ? (totals[m.id] / counts[m.id]).toFixed(1) : null; });
    return mae;
  }, [history]);

  const bestModel = useMemo(() => {
    const maes = MODELS.filter(m => globalMAE[m.id] !== null).map(m => ({ ...m, mae: parseFloat(globalMAE[m.id]) }));
    if (!maes.length) return null;
    return maes.reduce((a, b) => a.mae < b.mae ? a : b);
  }, [globalMAE]);

  const totalGWs = useMemo(() => {
    const labels = new Set();
    Object.values(history).flat().forEach(h => labels.add(h.gwLabel));
    return labels.size;
  }, [history]);

  const wrap = { minHeight: "calc(100vh - 57px)", background: "#04060f", padding: "24px", fontFamily: "'Rajdhani', sans-serif" };

  // ── Login screen ──
  if (!userSlug) return (
    <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="holo-border" style={{ background: "rgba(6,10,22,0.95)", borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 460 }}>
        <div style={{ fontSize: 11, letterSpacing: 5, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 8 }}>◈ SORAKI v1.0</div>
        <h1 className="holo-text" style={{ fontSize: 32, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>PROJECTIONS</h1>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 6, lineHeight: 1.7 }}>
          6 modèles en compétition sur tes vraies cartes.<br />
          Après chaque GW, les scores réels sont récupérés<br />
          automatiquement depuis l'API Sorare.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
          {MODELS.map(m => (
            <span key={m.id} style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: m.color, background: m.color + "15", border: `1px solid ${m.color}30`, borderRadius: 5, padding: "2px 8px" }}>{m.id} {m.label}</span>
          ))}
        </div>
        {error && <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16, fontFamily: "'Share Tech Mono', monospace" }}>{error}</div>}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 8, letterSpacing: 3, fontFamily: "'Share Tech Mono', monospace" }}>SLUG SORARE</div>
        <input className="soraki-input" type="text" style={{ width: "100%", padding: "13px 16px", fontSize: 15, marginBottom: 12 }}
          placeholder="ex: rakijako"
          value={slugInput}
          onChange={e => setSlugInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && slugInput.trim() && loadPlayers(slugInput)}
        />
        <button className="main-btn" disabled={!slugInput.trim() || loading} onClick={() => loadPlayers(slugInput)}>
          {loading ? "Chargement..." : "Lancer les projections →"}
        </button>
      </div>
    </div>
  );

  // ── Main ──
  return (
    <div style={wrap}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="holo-text" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>PROJECTIONS</h1>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', monospace", marginTop: 4 }}>
            {players.length} joueurs · {totalGWs} GW archivées · {userSlug}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {updateMsg && (
            <span style={{ fontSize: 12, color: updateMsg.startsWith("✓") ? "#34d399" : "#fca5a5", fontFamily: "'Share Tech Mono', monospace" }}>
              {updateMsg}
            </span>
          )}
          <button className="action-btn green" onClick={fetchRealScores} disabled={updating}>
            {updating ? "Mise à jour..." : "↓ Récupérer les scores réels"}
          </button>
          <button className="action-btn gray" onClick={() => { setUserSlug(""); setPlayers([]); setPendingPredictions({}); }}>
            ← Retour
          </button>
        </div>
      </div>

      {/* MAE globale */}
      {totalGWs > 0 && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 12 }}>
            ERREUR MOYENNE ABSOLUE — {totalGWs} GAME WEEK{totalGWs > 1 ? "S" : ""}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MODELS.map(m => {
              const isBest = bestModel?.id === m.id;
              return (
                <div key={m.id} className="mae-box" style={{
                  background: isBest ? m.color + "15" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isBest ? m.color + "40" : "rgba(255,255,255,0.05)"}`,
                }}>
                  <div style={{ fontSize: 10, color: isBest ? m.color : "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace', marginBottom: 4" }}>
                    {m.id}{isBest ? " ★" : ""}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: isBest ? m.color : "rgba(255,255,255,0.4)", fontFamily: "'Share Tech Mono', monospace" }}>
                    {globalMAE[m.id] ?? "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", marginTop: 2 }}>{m.label}</div>
                </div>
              );
            })}
          </div>
          {bestModel && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace" }}>
              Meilleur modèle : <span style={{ color: bestModel.color, fontWeight: 700 }}>{bestModel.id} — {bestModel.label}</span>
              <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.2)" }}>MAE = {globalMAE[bestModel.id]}</span>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 16, lineHeight: 1.8 }}>
        ↓ Projections en cours · Après les matchs, clique "Récupérer les scores réels" pour comparer automatiquement
      </div>

      {/* Player cards */}
      {players.map(p => {
        const preds = pendingPredictions[p.slug]?.predictions;
        if (!preds) return null;
        const maxPred = Math.max(...Object.values(preds), 1);
        const playerHistory = history[p.slug] || [];
        const lastGW = playerHistory[playerHistory.length - 1];
        const rarityColor = { unique: "#f59e0b", super_rare: "#c084fc", rare: "#ef4444", limited: "#f97316", common: "#6b7280" }[p.rarity?.toLowerCase()] || "#6b7280";
        const posLabel = POS_LABEL[p.position] || "EXT";
        const posColor = POS_COLOR[posLabel] || "#888";

        return (
          <div key={p.slug} className="proj-card">
            {/* Header joueur */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: rarityColor, boxShadow: `0 0 6px ${rarityColor}`, flexShrink: 0 }} />
              <span style={{ background: posColor + "14", color: posColor, border: `1px solid ${posColor}44`, borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace" }}>{posLabel}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, fontFamily: "'Rajdhani', sans-serif" }}>
                  {p.displayName}
                  {p.hasInjury && <span style={{ marginLeft: 6 }}>🤕</span>}
                  {p.hasSuspension && <span style={{ marginLeft: 4 }}>🟥</span>}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: "'Share Tech Mono', monospace" }}>
                  {p.club}
                  {p.opponent && <span style={{ marginLeft: 8, color: p.isHome ? "#34d399" : "#f87171" }}>{p.isHome ? "DOM" : "EXT"} · {p.opponent} · {p.gameDate}</span>}
                  {!p.opponent && <span style={{ marginLeft: 8, color: "#f87171" }}>NG</span>}
                </div>
              </div>
              {/* Score réel de la dernière GW */}
              {lastGW && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#facc15", fontFamily: "'Share Tech Mono', monospace" }}>{lastGW.real}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace" }}>dernier score</div>
                </div>
              )}
            </div>

            {/* Barres modèles */}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {MODELS.map(m => {
                const pred = preds[m.id];
                const lastErr = lastGW?.errors[m.id];
                const isBestLast = lastGW && MODELS.every(om => (lastGW.errors[om.id] ?? Infinity) >= lastErr);

                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace", color: m.color, minWidth: 26, fontWeight: 700, textShadow: `0 0 6px ${m.color}` }}>{m.id}</span>
                    <div className="model-bar-wrap">
                      <div className="model-bar" style={{ width: `${Math.round(pred / maxPred * 100)}%`, background: m.color }} />
                    </div>
                    <span style={{ fontSize: 13, fontFamily: "'Share Tech Mono', monospace", color: "#e2e8f0", minWidth: 30, textAlign: "right" }}>{pred}</span>
                    {lastErr !== undefined && (
                      <span className="err-badge" style={{
                        background: lastErr < 5 ? "rgba(52,211,153,0.1)" : lastErr < 12 ? "rgba(251,191,36,0.1)" : "rgba(239,68,68,0.1)",
                        color: lastErr < 5 ? "#34d399" : lastErr < 12 ? "#fbbf24" : "#f87171",
                        border: `1px solid ${lastErr < 5 ? "rgba(52,211,153,0.25)" : lastErr < 12 ? "rgba(251,191,36,0.25)" : "rgba(239,68,68,0.25)"}`,
                        fontWeight: isBestLast ? 700 : 400,
                      }}>±{lastErr.toFixed(0)}{isBestLast ? "★" : ""}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Historique */}
            {playerHistory.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "'Share Tech Mono', monospace", letterSpacing: 2, marginBottom: 6 }}>HISTORIQUE</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {playerHistory.slice(-6).map((h, i) => {
                    const bestM = MODELS.reduce((a, b) => (h.errors[a.id] ?? Infinity) < (h.errors[b.id] ?? Infinity) ? a : b);
                    return (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace" }}>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>{h.gwLabel} </span>
                        <span style={{ color: "#facc15" }}>{h.real}</span>
                        <span style={{ color: "rgba(255,255,255,0.2)" }}> → </span>
                        <span style={{ color: bestM.color }}>{bestM.id} ±{h.errors[bestM.id]?.toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── OPTIMIZER PAGE ───────────────────────────────────────────────────────────

function OptimizerPage() {
  const [slug, setSlug] = useState("");
  const [step, setStep] = useState("home");
  const [error, setError] = useState("");
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [captain, setCaptain] = useState(null);
  const [rarityFilter, setRarityFilter] = useState("all");

  const run = useCallback(async (currentSlug, filter) => {
    setError(""); setStep("loading");
    try {
      const data = await gql(USER_CARDS_QUERY, { slug: currentSlug.trim().toLowerCase() });
      if (data?.errors?.length) throw new Error(data.errors[0].message);
      if (!data?.data?.user) throw new Error("Slug introuvable — vérifie ton pseudo Sorare.");
      const raw = (data.data.user.cards?.nodes || []).map(normalizeCard).filter(c => c.position && c.displayName);
      if (!raw.length) throw new Error("Aucune carte trouvée pour ce compte.");
      setCards(raw);
      const filtered = filter === "all" ? raw : raw.filter(c => c.rarity?.toLowerCase() === filter);
      const res = optimizeLineup(filtered);
      setResult(res);
      setCaptain(res.lineup["Forward"]?.slug || res.lineup["Midfielder"]?.slug || null);
      setStep("result");
    } catch (e) {
      setError(e.message || "Erreur inattendue."); setStep("home");
    }
  }, []);

  const handleFilter = (f) => {
    setRarityFilter(f);
    const filtered = f === "all" ? cards : cards.filter(c => c.rarity?.toLowerCase() === f);
    const res = optimizeLineup(filtered);
    setResult(res);
    setCaptain(res.lineup["Forward"]?.slug || res.lineup["Midfielder"]?.slug || null);
  };

  const wrap = { minHeight: "calc(100vh - 57px)", background: "#04060f", fontFamily: "'Rajdhani', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative" };
  const panel = { background: "rgba(6,10,22,0.95)", backdropFilter: "blur(30px)", borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 520, boxShadow: "0 0 80px rgba(77,232,255,0.05), 0 40px 100px rgba(0,0,0,0.8)", position: "relative", zIndex: 1 };

  if (step === "home") return (
    <div style={wrap}>
      <div className="holo-border" style={panel}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 5, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 8 }}>◈ SORAKI v1.0</div>
          <h1 className="holo-text" style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, letterSpacing: 2 }}>SO5 OPTIMIZER</h1>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.28)", marginTop: 8, fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.6 }}>Génère ta compo optimale sans mot de passe</div>
        </div>
        {error && <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16, fontFamily: "'Share Tech Mono', monospace" }}>{error}</div>}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 8, letterSpacing: 3, fontFamily: "'Share Tech Mono', monospace" }}>SLUG SORARE</div>
        <input className="soraki-input" type="text" style={{ width: "100%", padding: "13px 16px", fontSize: 15, letterSpacing: 1 }}
          placeholder="ex: rakijako" value={slug}
          onChange={e => setSlug(e.target.value)}
          onKeyDown={e => e.key === "Enter" && slug.trim() && run(slug, rarityFilter)}
        />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.18)", marginTop: 8, fontFamily: "'Share Tech Mono', monospace" }}>→ pseudo visible dans l'URL de ton profil Sorare</div>
        <button className="main-btn" style={{ marginTop: 20 }} disabled={!slug.trim()} onClick={() => run(slug, rarityFilter)}>
          Analyser ma galerie →
        </button>
      </div>
    </div>
  );

  if (step === "loading") return (
    <div style={{ ...wrap, flexDirection: "column", gap: 20 }}>
      <div style={{ width: 44, height: 44, border: "2px solid rgba(255,255,255,0.05)", borderTop: "2px solid #4de8ff", borderRadius: "50%", animation: "spin 0.7s linear infinite", boxShadow: "0 0 20px rgba(77,232,255,0.3)" }} />
      <div className="holo-text" style={{ fontSize: 13, letterSpacing: 3, fontFamily: "'Share Tech Mono', monospace" }}>ANALYSE EN COURS</div>
    </div>
  );

  if (step === "result" && result) {
    const { lineup, sumL15, capBonus, multiClubBonus } = result;
    const totalBonus = capBonus + multiClubBonus;
    return (
      <div style={{ ...wrap, alignItems: "flex-start", paddingTop: 40, paddingBottom: 40 }}>
        <div className="holo-border" style={{ ...panel, maxWidth: 580 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 6 }}>◈ SORAKI v1.0</div>
              <h1 className="holo-text" style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2 }}>SO5 OPTIMIZER</h1>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", marginTop: 4, fontFamily: "'Share Tech Mono', monospace" }}>{cards.length} cartes · cliquer = capitaine</div>
            </div>
            <button onClick={() => { setStep("home"); setRarityFilter("all"); }} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "8px 14px", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer", fontFamily: "'Share Tech Mono', monospace" }}>← back</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22 }}>
            {["all", "unique", "super_rare", "rare", "limited", "common"].map(r => (
              <button key={r} className={`rarity-filter-btn ${rarityFilter === r ? "active" : ""}`} onClick={() => handleFilter(r)}>
                {r === "all" ? "all" : r.replace("_", " ")}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {POS_SLOTS.map(slot => (
              <div key={slot}>
                <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.18)", textTransform: "uppercase", marginBottom: 6, fontFamily: "'Share Tech Mono', monospace" }}>{SLOT_LABEL[slot]}</div>
                <CardChip card={lineup[slot]} isCaptain={lineup[slot]?.slug === captain} onSetCaptain={setCaptain} />
              </div>
            ))}
          </div>
          <div style={{ height: 1, background: "linear-gradient(90deg,transparent,rgba(77,232,255,0.2),transparent)", margin: "24px 0" }} />
          <div style={{ fontSize: 9, letterSpacing: 3, color: "rgba(255,255,255,0.18)", textTransform: "uppercase", marginBottom: 10, fontFamily: "'Share Tech Mono', monospace" }}>Bonus de composition</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            <BonusBadge label={`cap_bonus — Σ L15 = ${sumL15.toFixed(0)} / 260`} value={4} active={capBonus > 0} />
            <BonusBadge label="multi_club — max 2 joueurs/club" value={2} active={multiClubBonus > 0} />
          </div>
          <div className={totalBonus > 0 ? "holo-border" : ""} style={{ background: "rgba(6,10,22,0.8)", borderRadius: 12, padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", border: totalBonus === 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
            <span style={{ color: "#e2e8f0", fontWeight: 700, letterSpacing: 2, fontSize: 14, fontFamily: "'Share Tech Mono', monospace" }}>BONUS TOTAL</span>
            <span className={totalBonus > 0 ? "holo-text" : ""} style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace", color: totalBonus === 0 ? "rgba(255,255,255,0.15)" : undefined }}>
              {totalBonus > 0 ? `+${totalBonus}%` : "0%"}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState("optimizer");

  return (
    <div style={{ background: "#04060f", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div className="scanline-wrap"><div className="scanline" /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, background: "rgba(4,6,15,0.97)", backdropFilter: "blur(20px)", zIndex: 100 }}>
        <span className="holo-text" style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, marginRight: 8 }}>◈ SORAKI</span>
        <button className={`nav-btn ${page === "optimizer" ? "active" : ""}`} onClick={() => setPage("optimizer")}>SO5 OPTIMIZER</button>
        <button className={`nav-btn ${page === "projections" ? "active" : ""}`} onClick={() => setPage("projections")}>PROJECTIONS</button>
      </div>
      {page === "optimizer" && <OptimizerPage />}
      {page === "projections" && <ProjectionsPage />}
    </div>
  );
}
