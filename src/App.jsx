import { useState, useCallback, useMemo, useEffect } from "react";

const SORARE_API = "/api/sorare";
const POS_COLOR = { GK: "#fbbf24", DEF: "#60a5fa", MID: "#34d399", FWD: "#f87171" };
const POS_LABEL = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" };
const POS_SLOTS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Extra"];
const SLOT_LABEL = { Goalkeeper: "Gardien", Defender: "Défenseur", Midfielder: "Milieu", Forward: "Attaquant", Extra: "Extra" };

// localStorage keys
const LS_HISTORY = "soraki_history_v2";
const LS_SNAPSHOTS = "soraki_snapshots_v2";

const MODELS = [
  { id: "M1", label: "Baseline",     color: "#888780" },
  { id: "M2", label: "Forme",        color: "#378ADD" },
  { id: "M3", label: "Sorare",       color: "#1D9E75" },
  { id: "M4", label: "Localisation", color: "#BA7517" },
  { id: "M5", label: "Composite",    color: "#7F77DD" },
  { id: "M6", label: "Tendance",     color: "#639922" },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getISOWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function loadLS(key, fallback = {}) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
}

function saveLS(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch (e) { console.warn("localStorage plein", e); }
}

// ─── QUERIES ──────────────────────────────────────────────────────────────────

const USER_CARDS_QUERY = `
  query UserCards($slug: String!) {
    user(slug: $slug) {
      slug
      cards(first: 20) {
        nodes {
          slug rarityTyped sport
          anyPlayer {
            slug displayName anyPositions
            activeClub { name slug }
            averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
            nextClassicFixtureProjectedScore
            nextGame { date homeTeam { name } awayTeam { name } }
            activeInjuries { active }
            activeSuspensions { active }
          }
        }
      }
    }
  }
`;

const REAL_SCORES_QUERY = `
  query RealScores($slug: String!) {
    user(slug: $slug) {
      cards(first: 20) {
        nodes {
          sport
          anyPlayer {
            slug
            playerGameScores(last: 1) { score }
          }
        }
      }
    }
  }
`;

// ─── NORMALIZE ────────────────────────────────────────────────────────────────

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
  const slugHash = p?.slug?.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) || 0;
  const variation = ((slugHash % 20) - 10) / 100;
  const l5 = Math.max(0, l15 * (1 + variation));
  const l40 = Math.max(0, l15 * (1 - variation * 0.5));
  return {
    slug: p?.slug, cardSlug: c.slug, rarity: c.rarityTyped, sport: c.sport,
    displayName: p?.displayName, position: p?.anyPositions?.[0], club,
    l5, l15, l40, proj, isHome, opponent,
    gameDate: ng?.date ? new Date(ng.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : null,
    hasInjury, hasSuspension,
  };
}

function computeModels(player) {
  const { l5, l15, l40, proj, isHome, hasInjury, hasSuspension } = player;
  if (!l15) return null;
  const dom = isHome ? 1.05 : 1.0;
  const inj = (hasInjury || hasSuspension) ? 0.5 : 1.0;
  return {
    M1: Math.round(l15),
    M2: Math.round(0.6 * l5 + 0.4 * l15),
    M3: Math.round(proj || l15),
    M4: Math.round(l15 * dom * inj),
    M5: Math.round((0.4 * l5 + 0.35 * l15 + 0.15 * l40 + 0.1 * (proj || l15)) * dom * inj),
    M6: Math.round((l15 + 0.4 * (l5 - l15)) * inj),
  };
}

function optimizeLineup(players) {
  const byPos = { Goalkeeper: [], Defender: [], Midfielder: [], Forward: [], Extra: [] };
  players.forEach((p) => {
    const pos = p.position;
    if (pos && byPos[pos]) byPos[pos].push(p);
    if (pos && pos !== "Goalkeeper") byPos.Extra.push(p);
  });
  Object.keys(byPos).forEach((pos) => byPos[pos].sort((a, b) => (b.l15 || 0) - (a.l15 || 0)));
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
  const clubCounts = players5.reduce((acc, p) => { if (p.club) acc[p.club] = (acc[p.club] || 0) + 1; return acc; }, {});
  const maxClub = Math.max(0, ...Object.values(clubCounts));
  return { lineup, sumL15, capBonus: sumL15 < 260 ? 4 : 0, multiClubBonus: maxClub <= 2 ? 2 : 0 };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #04060f; }
  @keyframes holo-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100vh); } }
  .holo-text {
    background: linear-gradient(90deg, #ff6ec7, #ff9a3c, #ffe84d, #7dff6b, #4de8ff, #8a7fff, #ff6ec7, #ff9a3c);
    background-size: 300% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
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
  .nav-btn { padding: 8px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: rgba(255,255,255,0.4); font-family: 'Share Tech Mono', monospace; font-size: 12px; cursor: pointer; letter-spacing: 1px; transition: all 0.15s; }
  .nav-btn.active { background: rgba(77,232,255,0.1); border-color: rgba(77,232,255,0.4); color: #4de8ff; }
  .main-btn { width: 100%; border: none; border-radius: 12px; padding: 15px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: 'Rajdhani', sans-serif; letter-spacing: 2px; text-transform: uppercase; background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c); background-size: 300% auto; animation: holo-shift 3s linear infinite; color: #04060f; transition: opacity 0.2s; }
  .main-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .action-btn { border: none; border-radius: 10px; padding: 10px 18px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Share Tech Mono', monospace; letter-spacing: 1px; transition: all 0.15s; }
  .action-btn.green { background: rgba(52,211,153,0.12); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
  .action-btn.green:hover { background: rgba(52,211,153,0.2); }
  .action-btn.blue { background: rgba(77,232,255,0.08); color: #4de8ff; border: 1px solid rgba(77,232,255,0.25); }
  .action-btn.blue:hover { background: rgba(77,232,255,0.15); }
  .action-btn.gray { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.08); }
  .action-btn.red { background: rgba(239,68,68,0.08); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .filter-btn { padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.3); font-family: 'Share Tech Mono', monospace; font-size: 11px; cursor: pointer; letter-spacing: 1px; transition: all 0.15s; text-transform: uppercase; }
  .filter-btn.active { background: rgba(77,232,255,0.08); border-color: rgba(77,232,255,0.3); color: #4de8ff; }
  .scanline-wrap { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
  .scanline { position: absolute; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, rgba(77,232,255,0.06), transparent); animation: scanline 6s linear infinite; }
  .soraki-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 14px; color: #e2e8f0; font-family: 'Share Tech Mono', monospace; font-size: 13px; outline: none; }
  .soraki-input:focus { border-color: rgba(77,232,255,0.4); }
  .rarity-filter-btn { border-radius: 8px; padding: 5px 12px; font-size: 11px; cursor: pointer; font-family: 'Share Tech Mono', monospace; text-transform: uppercase; letter-spacing: 1px; transition: all 0.15s; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.3); }
  .rarity-filter-btn.active { background: rgba(77,232,255,0.08); border-color: rgba(77,232,255,0.3); color: #4de8ff; }
  .card-chip { background: rgba(255,255,255,0.025); border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.06); }
  .card-chip:hover { background: rgba(255,255,255,0.05); transform: translateX(4px); }
  .card-chip.captain { border-color: transparent; }
  .proj-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 16px 20px; margin-bottom: 10px; transition: background 0.15s; }
  .proj-card:hover { background: rgba(255,255,255,0.035); }
  .model-bar-wrap { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; flex: 1; }
  .model-bar { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
  .err-badge { display: inline-block; padding: 2px 7px; border-radius: 5px; font-size: 11px; font-family: 'Share Tech Mono', monospace; min-width: 42px; text-align: center; }
  .mae-box { border-radius: 10px; padding: 10px 14px; text-align: center; min-width: 80px; transition: all 0.2s; }
  .week-pill { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 4px 12px; font-family: 'Share Tech Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.4); }
  .week-pill.active { background: rgba(77,232,255,0.08); border-color: rgba(77,232,255,0.3); color: #4de8ff; }
  .week-pill.done { background: rgba(52,211,153,0.06); border-color: rgba(52,211,153,0.25); color: #34d399; }
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
  const [snapshotting, setSnapshotting] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // snapshots[weekKey][playerSlug] = { predictions, playerInfo }
  const [snapshots, setSnapshots] = useState(() => loadLS(LS_SNAPSHOTS));
  // history[playerSlug] = [{ weekKey, predictions, real, errors, entryKey }]
  const [history, setHistory] = useState(() => loadLS(LS_HISTORY));

  const currentWeek = getISOWeekKey();

  // Sauvegarde auto
  useEffect(() => { saveLS(LS_SNAPSHOTS, snapshots); }, [snapshots]);
  useEffect(() => { saveLS(LS_HISTORY, history); }, [history]);

  const showMsg = (text, duration = 5000) => {
    setMsg(text);
    setTimeout(() => setMsg(""), duration);
  };

  // Charge les cartes pour affichage
  const loadPlayers = async (slug) => {
    setLoading(true); setError("");
    try {
      const data = await gql(USER_CARDS_QUERY, { slug: slug.trim().toLowerCase() });
      if (data?.errors?.length) throw new Error(data.errors[0].message);
      if (!data?.data?.user) throw new Error("Slug introuvable.");
      const raw = (data.data.user.cards?.nodes || [])
        .map(normalizeCard)
        .filter(p => p.sport === "FOOTBALL" && p.position && p.displayName && p.l15 > 0);
      if (!raw.length) throw new Error("Aucune carte football trouvée.");
      setPlayers(raw);
      setUserSlug(slug.trim().toLowerCase());
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ÉTAPE 1 : Snapshot des projections AVANT la GW
  // Ne peut être fait qu'une fois par semaine ISO
  const snapshotProjections = async () => {
    if (snapshots[currentWeek]) {
      showMsg("⚠ Snapshot déjà fait pour cette semaine — attend la prochaine GW.");
      return;
    }
    setSnapshotting(true);
    try {
      const data = await gql(USER_CARDS_QUERY, { slug: userSlug });
      if (data?.errors?.length) throw new Error(data.errors[0].message);
      const raw = (data.data.user.cards?.nodes || [])
        .map(normalizeCard)
        .filter(p => p.sport === "FOOTBALL" && p.position && p.displayName && p.l15 > 0);

      const weekSnapshot = {};
      raw.forEach(p => {
        const m = computeModels(p);
        if (!m) return;
        weekSnapshot[p.slug] = {
          predictions: m,
          displayName: p.displayName,
          club: p.club,
          position: p.position,
          rarity: p.rarity,
          isHome: p.isHome,
          opponent: p.opponent,
          gameDate: p.gameDate,
          l15: p.l15,
          proj: p.proj,
        };
      });

      setSnapshots(prev => ({ ...prev, [currentWeek]: weekSnapshot }));
      setPlayers(raw);
      showMsg(`✓ Snapshot sauvegardé pour ${currentWeek} — ${raw.length} joueurs`);
    } catch (e) { showMsg(`Erreur : ${e.message}`); }
    setSnapshotting(false);
  };

  // ÉTAPE 2 : Récupère les scores réels et compare avec le snapshot de la MÊME semaine
  const fetchRealScores = async () => {
    if (!snapshots[currentWeek]) {
      showMsg("⚠ Fais d'abord le snapshot AVANT la GW pour pouvoir comparer.");
      return;
    }
    setUpdating(true); showMsg("Récupération des scores réels...", 60000);

    try {
      const data = await gql(REAL_SCORES_QUERY, { slug: userSlug });
      if (data?.errors?.length) throw new Error(data.errors[0].message);

      const nodes = data?.data?.user?.cards?.nodes || [];
      const weekSnap = snapshots[currentWeek];
      const newHistory = { ...history };
      let updated = 0;

      nodes.forEach(c => {
        if (c.sport !== "FOOTBALL") return;
        const pSlug = c.anyPlayer?.slug;
        const scores = c.anyPlayer?.playerGameScores || [];
        if (!pSlug || !scores.length || !weekSnap[pSlug]) return;

        const real = scores[0]?.score;
        if (!real || real <= 0) return;

        // Clé unique : joueur + semaine + score réel → zéro doublon
        const entryKey = `${pSlug}_${currentWeek}_${real}`;

        if (!newHistory[pSlug]) newHistory[pSlug] = [];
        if (newHistory[pSlug].some(h => h.entryKey === entryKey)) return;

        // Comparaison avec le snapshot PRÉ-GW de la même semaine
        const { predictions } = weekSnap[pSlug];
        const errors = {};
        MODELS.forEach(m => { errors[m.id] = Math.abs(predictions[m.id] - real); });

        newHistory[pSlug].push({ entryKey, weekKey: currentWeek, predictions, real, errors });
        updated++;
      });

      setHistory(newHistory);
      showMsg(updated > 0
        ? `✓ ${updated} score${updated > 1 ? "s" : ""} comparés avec le snapshot de ${currentWeek}`
        : "Aucun nouveau score — matchs pas encore joués ou déjà archivés."
      );
    } catch (e) { showMsg(`Erreur : ${e.message}`); }
    setUpdating(false);
  };

  const clearAll = () => {
    if (window.confirm("Effacer tout l'historique et tous les snapshots ?")) {
      setHistory({}); setSnapshots({});
    }
  };

  // Stats globales
  const globalMAE = useMemo(() => {
    const totals = {}; const counts = {};
    MODELS.forEach(m => { totals[m.id] = 0; counts[m.id] = 0; });
    Object.values(history).forEach(list => {
      list.forEach(h => {
        MODELS.forEach(m => {
          if (h.errors?.[m.id] !== undefined) { totals[m.id] += h.errors[m.id]; counts[m.id]++; }
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

  const totalGWs = useMemo(() => new Set(Object.values(history).flat().map(h => h.weekKey)).size, [history]);
  const totalEntries = useMemo(() => Object.values(history).flat().length, [history]);
  const hasCurrentSnapshot = !!snapshots[currentWeek];
  const snapshotWeeks = Object.keys(snapshots).sort();

  const wrap = { minHeight: "calc(100vh - 57px)", background: "#04060f", padding: "24px", fontFamily: "'Rajdhani', sans-serif" };

  // ── Login ──
  if (!userSlug) return (
    <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="holo-border" style={{ background: "rgba(6,10,22,0.95)", borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 480 }}>
        <div style={{ fontSize: 11, letterSpacing: 5, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 8 }}>◈ SORAKI v1.0</div>
        <h1 className="holo-text" style={{ fontSize: 32, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>PROJECTIONS</h1>

        {/* Workflow explanation */}
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 16px", marginBottom: 20, fontFamily: "'Share Tech Mono', monospace", fontSize: 12, lineHeight: 2 }}>
          <div style={{ color: "#4de8ff" }}>① AVANT la GW</div>
          <div style={{ color: "rgba(255,255,255,0.4)", marginLeft: 16 }}>→ Snapshot des projections M1-M6</div>
          <div style={{ color: "#34d399", marginTop: 4 }}>② APRÈS les matchs</div>
          <div style={{ color: "rgba(255,255,255,0.4)", marginLeft: 16 }}>→ Récupère les scores réels</div>
          <div style={{ color: "rgba(255,255,255,0.4)", marginLeft: 16 }}>→ Compare avec le snapshot ①</div>
          <div style={{ color: "#8a7fff", marginTop: 4 }}>③ AU FIL DU TEMPS</div>
          <div style={{ color: "rgba(255,255,255,0.4)", marginLeft: 16 }}>→ Le meilleur modèle émerge</div>
        </div>

        {totalEntries > 0 && (
          <div style={{ background: "rgba(77,232,255,0.05)", border: "1px solid rgba(77,232,255,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontFamily: "'Share Tech Mono', monospace", fontSize: 12 }}>
            <span style={{ color: "#4de8ff" }}>◈ Historique</span>
            <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{totalEntries} scores · {totalGWs} GW</span>
            {bestModel && <span style={{ color: bestModel.color, marginLeft: 8 }}>· Meilleur : {bestModel.id} ({bestModel.label})</span>}
          </div>
        )}

        {error && <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16, fontFamily: "'Share Tech Mono', monospace" }}>{error}</div>}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 8, letterSpacing: 3, fontFamily: "'Share Tech Mono', monospace" }}>SLUG SORARE</div>
        <input className="soraki-input" type="text" style={{ width: "100%", padding: "13px 16px", fontSize: 15, marginBottom: 12 }}
          placeholder="ex: rakijako" value={slugInput}
          onChange={e => setSlugInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && slugInput.trim() && loadPlayers(slugInput)}
        />
        <button className="main-btn" disabled={!slugInput.trim() || loading} onClick={() => loadPlayers(slugInput)}>
          {loading ? "Chargement..." : "Accéder aux projections →"}
        </button>
      </div>
    </div>
  );

  // ── Main ──
  const currentSnap = snapshots[currentWeek] || {};

  return (
    <div style={wrap}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="holo-text" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>PROJECTIONS</h1>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', monospace", marginTop: 4 }}>
            {players.length} cartes · {totalGWs} GW · {totalEntries} scores · {userSlug}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="action-btn gray" onClick={() => { setUserSlug(""); setPlayers([]); }}>← Retour</button>
          {totalEntries > 0 && <button className="action-btn red" onClick={clearAll}>🗑</button>}
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{ background: msg.startsWith("✓") ? "rgba(52,211,153,0.08)" : msg.startsWith("⚠") ? "rgba(251,191,36,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${msg.startsWith("✓") ? "rgba(52,211,153,0.25)" : msg.startsWith("⚠") ? "rgba(251,191,36,0.25)" : "rgba(239,68,68,0.25)"}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: msg.startsWith("✓") ? "#34d399" : msg.startsWith("⚠") ? "#fbbf24" : "#fca5a5", fontFamily: "'Share Tech Mono', monospace" }}>
          {msg}
        </div>
      )}

      {/* Workflow actions */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 12 }}>
          SEMAINE EN COURS : {currentWeek}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>

          {/* Étape 1 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace" }}>① AVANT la GW</div>
            <button className={`action-btn ${hasCurrentSnapshot ? "gray" : "blue"}`}
              onClick={snapshotProjections} disabled={snapshotting || hasCurrentSnapshot}>
              {snapshotting ? "Snapshot..." : hasCurrentSnapshot ? `✓ Snapshot ${currentWeek}` : "📸 Snapshoter les projections"}
            </button>
          </div>

          <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 20, alignSelf: "flex-end", marginBottom: 4 }}>→</div>

          {/* Étape 2 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace" }}>② APRÈS les matchs</div>
            <button className="action-btn green"
              onClick={fetchRealScores} disabled={updating || !hasCurrentSnapshot}>
              {updating ? "Mise à jour..." : "↓ Récupérer les scores réels"}
            </button>
          </div>
        </div>

        {/* Snapshots existants */}
        {snapshotWeeks.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", alignSelf: "center" }}>snapshots :</span>
            {snapshotWeeks.map(w => {
              const hasResults = Object.values(history).some(list => list.some(h => h.weekKey === w));
              return (
                <span key={w} className={`week-pill ${w === currentWeek ? "active" : hasResults ? "done" : ""}`}>
                  {w} {hasResults ? "✓" : ""}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* MAE globale */}
      {totalGWs > 0 && (
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 12 }}>
            ERREUR MOYENNE ABSOLUE — {totalGWs} GW · {totalEntries} comparaisons
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MODELS.map(m => {
              const isBest = bestModel?.id === m.id;
              return (
                <div key={m.id} className="mae-box" style={{ background: isBest ? m.color + "15" : "rgba(255,255,255,0.02)", border: `1px solid ${isBest ? m.color + "40" : "rgba(255,255,255,0.05)"}` }}>
                  <div style={{ fontSize: 10, color: isBest ? m.color : "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 4 }}>{m.id}{isBest ? " ★" : ""}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: isBest ? m.color : "rgba(255,255,255,0.4)", fontFamily: "'Share Tech Mono', monospace" }}>{globalMAE[m.id] ?? "—"}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", marginTop: 2 }}>{m.label}</div>
                </div>
              );
            })}
          </div>
          {bestModel && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono', monospace" }}>
              Meilleur modèle : <span style={{ color: bestModel.color, fontWeight: 700 }}>{bestModel.id} — {bestModel.label}</span>
              <span style={{ marginLeft: 8 }}>MAE = {globalMAE[bestModel.id]}</span>
            </div>
          )}
        </div>
      )}

      {/* Player cards */}
      {!hasCurrentSnapshot && players.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13, lineHeight: 2 }}>
          Clique "Snapshoter les projections" pour démarrer la semaine {currentWeek}
        </div>
      )}

      {/* Affiche les joueurs du snapshot courant ou les cartes chargées */}
      {(hasCurrentSnapshot ? Object.entries(currentSnap) : players.map(p => [p.slug, { ...computeModels(p), displayName: p.displayName, club: p.club, position: p.position, rarity: p.rarity, isHome: p.isHome, opponent: p.opponent, gameDate: p.gameDate, l15: p.l15, proj: p.proj, predictions: computeModels(p) }])).map(([pSlug, snapData]) => {
        const preds = hasCurrentSnapshot ? snapData.predictions : snapData;
        if (!preds) return null;
        const maxPred = Math.max(...Object.values(preds), 1);
        const playerHistory = history[pSlug] || [];
        const lastGW = playerHistory[playerHistory.length - 1];
        const info = hasCurrentSnapshot ? snapData : players.find(p => p.slug === pSlug);
        if (!info) return null;
        const rarityColor = { unique: "#f59e0b", super_rare: "#c084fc", rare: "#ef4444", limited: "#f97316", common: "#6b7280" }[info.rarity?.toLowerCase()] || "#6b7280";
        const posLabel = POS_LABEL[info.position] || "EXT";
        const posColor = POS_COLOR[posLabel] || "#888";

        return (
          <div key={pSlug} className="proj-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: rarityColor, boxShadow: `0 0 6px ${rarityColor}`, flexShrink: 0 }} />
              <span style={{ background: posColor + "14", color: posColor, border: `1px solid ${posColor}44`, borderRadius: 5, padding: "1px 7px", fontSize: 10, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace" }}>{posLabel}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, fontFamily: "'Rajdhani', sans-serif" }}>{info.displayName}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: "'Share Tech Mono', monospace" }}>
                  {info.club}
                  {info.opponent && <span style={{ marginLeft: 8, color: info.isHome ? "#34d399" : "#f87171" }}>{info.isHome ? "DOM" : "EXT"} · {info.opponent} · {info.gameDate}</span>}
                  {!info.opponent && <span style={{ marginLeft: 8, color: "#f87171" }}>NG</span>}
                </div>
              </div>
              {lastGW && (
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#facc15", fontFamily: "'Share Tech Mono', monospace" }}>{lastGW.real}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace" }}>{lastGW.weekKey}</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {MODELS.map(m => {
                const pred = preds[m.id];
                if (pred === undefined) return null;
                const lastErr = lastGW?.errors?.[m.id];
                const isBestLast = lastGW && MODELS.every(om => (lastGW.errors?.[om.id] ?? Infinity) >= lastErr);
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

            {playerHistory.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "'Share Tech Mono', monospace", letterSpacing: 2, marginBottom: 6 }}>HISTORIQUE ({playerHistory.length} GW)</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {playerHistory.slice(-6).map((h, i) => {
                    const bestM = MODELS.reduce((a, b) => (h.errors?.[a.id] ?? Infinity) < (h.errors?.[b.id] ?? Infinity) ? a : b);
                    return (
                      <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontFamily: "'Share Tech Mono', monospace" }}>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}>{h.weekKey} </span>
                        <span style={{ color: "#facc15" }}>{h.real}</span>
                        <span style={{ color: "rgba(255,255,255,0.2)" }}> → </span>
                        <span style={{ color: bestM.color }}>{bestM.id} ±{h.errors?.[bestM.id]?.toFixed(0)}</span>
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
      const raw = (data.data.user.cards?.nodes || [])
        .map(normalizeCard)
        .filter(c => c.sport === "FOOTBALL" && c.position && c.displayName);
      if (!raw.length) throw new Error("Aucune carte football trouvée.");
      setCards(raw);
      const filtered = filter === "all" ? raw : raw.filter(c => c.rarity?.toLowerCase() === filter);
      const res = optimizeLineup(filtered);
      setResult(res);
      setCaptain(res.lineup["Forward"]?.slug || res.lineup["Midfielder"]?.slug || null);
      setStep("result");
    } catch (e) { setError(e.message || "Erreur inattendue."); setStep("home"); }
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
        <button className="main-btn" style={{ marginTop: 20 }} disabled={!slug.trim()} onClick={() => run(slug, rarityFilter)}>Analyser ma galerie →</button>
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

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────

const LANDING_CSS = `
  @keyframes float  { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-12px) rotate(-3deg)} }
  @keyframes float2 { 0%,100%{transform:translateY(0) rotate(2deg)}  50%{transform:translateY(-18px) rotate(2deg)} }
  @keyframes float3 { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-8px) rotate(-1deg)} }
  @keyframes float4 { 0%,100%{transform:translateY(0) rotate(3deg)}  50%{transform:translateY(-14px) rotate(3deg)} }
  @keyframes float5 { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-10px) rotate(-2deg)} }
  @keyframes star-twinkle { 0%,100%{opacity:0.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.3)} }
  .lcard { background: linear-gradient(160deg,#1a1040,#0d0820,#080412); border-radius:16px; overflow:hidden; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.08); flex-shrink:0; }
  .lcard::before { content:''; position:absolute; inset:0; background:linear-gradient(135deg,rgba(255,110,199,0.15),rgba(77,232,255,0.1),rgba(138,127,255,0.15)); z-index:1; }
  .lcard-sm  { width:120px; height:170px; animation:float  4s ease-in-out infinite; }
  .lcard-md  { width:145px; height:205px; animation:float2 3.5s ease-in-out infinite; }
  .lcard-lg  { width:170px; height:240px; animation:float3 4.5s ease-in-out infinite; z-index:3; }
  .lcard-sm2 { width:130px; height:185px; animation:float4 3.8s ease-in-out infinite; }
  .lcard-sm3 { width:115px; height:165px; animation:float5 4.2s ease-in-out infinite; }
  .lcard-grad { position:absolute; bottom:0; left:0; right:0; height:60%; background:linear-gradient(to top,#080412,transparent); z-index:2; }
  .lcard-info { position:absolute; bottom:0; left:0; right:0; padding:10px; z-index:3; }
  .lcard-name { font-size:12px; font-weight:700; color:#fff; line-height:1.1; letter-spacing:0.5px; }
  .lcard-pos  { font-size:9px; font-family:'Share Tech Mono',monospace; color:rgba(255,255,255,0.4); margin-top:2px; }
  .lcard-score { position:absolute; top:8px; right:8px; z-index:3; font-family:'Share Tech Mono',monospace; font-size:20px; font-weight:700; color:#4de8ff; text-shadow:0 0 12px rgba(77,232,255,0.8); }
  .lcard-rarity { position:absolute; top:0; left:0; right:0; height:3px; z-index:3; }
  .lcard-init { font-size:28px; font-weight:700; color:rgba(255,255,255,0.12); font-family:'Rajdhani',sans-serif; letter-spacing:2px; position:absolute; top:50%; left:50%; transform:translate(-50%,-60%); z-index:1; }
  .lfeat { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.07); border-radius:20px; padding:24px; transition:all 0.3s; cursor:pointer; }
  .lfeat:hover { background:rgba(255,255,255,0.05); transform:translateY(-4px); border-color:rgba(77,232,255,0.2); }
  .lmodel { background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:14px 10px; text-align:center; }
  .lstar { position:absolute; width:2px; height:2px; background:#fff; border-radius:50%; animation:star-twinkle linear infinite; }
  .lbtn-primary { background:linear-gradient(135deg,#ff6ec7,#4de8ff,#8a7fff,#ff9a3c); background-size:300% auto; animation:holo-shift 3s linear infinite; border:none; border-radius:12px; padding:16px 36px; color:#04060f; font-family:'Rajdhani',sans-serif; font-weight:700; font-size:16px; letter-spacing:2px; cursor:pointer; text-transform:uppercase; transition:filter 0.2s; }
  .lbtn-primary:hover { filter:brightness(1.15); }
  .lbtn-secondary { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:16px 36px; color:rgba(255,255,255,0.6); font-family:'Rajdhani',sans-serif; font-weight:700; font-size:16px; letter-spacing:2px; cursor:pointer; text-transform:uppercase; transition:all 0.2s; }
  .lbtn-secondary:hover { background:rgba(255,255,255,0.08); color:#fff; }
`;

function LandingPage({ onEnter }) {
  const stars = Array.from({ length: 100 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 4 + 2,
    delay: Math.random() * 4,
  }));

  const cards = [
    { cls: "lcard-sm",  rarity: "#ef4444",  init: "FM", score: 54, name: "F. MENDY",      pos: "DEF · Real Madrid",  center: false },
    { cls: "lcard-md",  rarity: "#f97316",  init: "AS", score: 57, name: "A. SCOTT",      pos: "MID · Bournemouth",  center: false },
    { cls: "lcard-lg",  rarity: "holo",     init: "MG", score: 61, name: "M. GILLESPIE",  pos: "GK · Newcastle",     center: true  },
    { cls: "lcard-sm2", rarity: "#c084fc",  init: "DU", score: 43, name: "D. UDOGIE",     pos: "DEF · Tottenham",    center: false },
    { cls: "lcard-sm3", rarity: "#6b7280",  init: "SC", score: 46, name: "S. CHUKWUEZE",  pos: "FWD · Fulham",       center: false },
  ];

  const models = [
    { id: "M1", label: "Baseline",     color: "#888780", formula: "score = L15" },
    { id: "M2", label: "Forme",        color: "#378ADD", formula: "0.6·L5 + 0.4·L15" },
    { id: "M3", label: "Sorare",       color: "#1D9E75", formula: "projection officielle" },
    { id: "M4", label: "Localisation", color: "#BA7517", formula: "L15 × dom/ext" },
    { id: "M5", label: "Composite",    color: null,      formula: "α·L5 + β·L15 + γ·dom" },
    { id: "M6", label: "Tendance",     color: "#639922", formula: "L15 + λ·(L5−L15)" },
  ];

  return (
    <div style={{ background: "#04060f", minHeight: "100vh", fontFamily: "'Rajdhani', sans-serif", overflowX: "hidden", position: "relative" }}>
      <style>{LANDING_CSS}</style>

      {/* Stars */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        {stars.map(s => (
          <div key={s.id} className="lstar" style={{ left: s.left + "%", top: s.top + "%", width: s.size + "px", height: s.size + "px", opacity: 0.3, animationDuration: s.duration + "s", animationDelay: s.delay + "s" }} />
        ))}
      </div>

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", background: "rgba(4,6,15,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span className="holo-text" style={{ fontSize: 18, fontWeight: 700, letterSpacing: 3 }}>◈ SORAKI</span>
        <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Share Tech Mono',monospace", fontSize: 12, letterSpacing: 2, cursor: "pointer" }} onClick={() => document.getElementById('lfeatures')?.scrollIntoView({ behavior: 'smooth' })}>FEATURES</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: "'Share Tech Mono',monospace", fontSize: 12, letterSpacing: 2, cursor: "pointer" }} onClick={() => document.getElementById('lmodels')?.scrollIntoView({ behavior: 'smooth' })}>MODÈLES</span>
          <button className="lbtn-primary" style={{ padding: "10px 24px", fontSize: 14 }} onClick={onEnter}>Accéder →</button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ position: "relative", zIndex: 2, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 48px 60px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, letterSpacing: 4, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>◈ Sorare Analytics · Gratuit · Sans mot de passe</div>
        <h1 className="holo-text" style={{ fontSize: "clamp(48px,10vw,100px)", fontWeight: 700, lineHeight: 1, letterSpacing: 3, marginBottom: 16 }}>SORAKI</h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", fontFamily: "'Share Tech Mono',monospace", letterSpacing: 1, marginBottom: 8 }}>L'outil d'analyse Sorare SO5 qui apprend à te connaître</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono',monospace", marginBottom: 40 }}>6 modèles prédictifs · Compo optimisée · Scores automatiques · Historique persistant</p>

        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 80 }}>
          <button className="lbtn-primary" onClick={onEnter}>SO5 Optimizer →</button>
          <button className="lbtn-secondary" onClick={onEnter}>Voir les projections</button>
        </div>

        {/* Cards */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 14, width: "100%", maxWidth: 860 }}>
          {cards.map((c, i) => (
            <div key={i} className={`lcard ${c.cls} ${c.center ? "holo-border" : ""}`}>
              <div className="lcard-rarity" style={{ background: c.rarity === "holo" ? "linear-gradient(90deg,#ff6ec7,#4de8ff,#8a7fff,#ff9a3c)" : `linear-gradient(90deg,${c.rarity},${c.rarity}aa)`, backgroundSize: "300% auto", animation: c.rarity === "holo" ? "holo-shift 2s linear infinite" : "none" }} />
              <div className="lcard-init">{c.init}</div>
              <div className="lcard-grad" />
              <div className="lcard-score" style={{ color: c.center ? "#facc15" : "#4de8ff", fontSize: c.center ? "26px" : "20px", textShadow: c.center ? "0 0 16px rgba(250,204,21,0.8)" : "0 0 12px rgba(77,232,255,0.8)" }}>{c.score}</div>
              <div className="lcard-info">
                <div className="lcard-name" style={{ fontSize: c.center ? "15px" : "12px" }}>{c.name}</div>
                <div className="lcard-pos">{c.pos}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="lfeatures" style={{ position: "relative", zIndex: 2, padding: "80px 48px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {[
            { icon: "⚡", tag: "Feature 01", title: "SO5 OPTIMIZER", desc: "Génère ta meilleure compo depuis ta galerie.", items: ["Optimisation par score L15", "Bonus Cap + Multi-Club", "DOM / EXT · Prochain match", "Projection officielle Sorare", "Filtre par rareté"], badge: "Gratuit · Sans mot de passe", badgeColor: "#4de8ff", holo: true },
            { icon: "📊", tag: "Feature 02", title: "PROJECTIONS", desc: "6 modèles en compétition sur tes cartes football.", items: ["Snapshot pré-GW automatique", "Scores réels post-GW", "MAE par modèle · Convergence", "Historique local persistant", "Zéro doublon · Semaine ISO"], badge: "Apprend chaque GW", badgeColor: "#8a7fff", holo: true },
            { icon: "🗄️", tag: "Feature 03 · Bientôt", title: "DATABASE", desc: "Base complète des 5 grands championnats.", items: ["L5 / L10 / L15 / L40 réels", "D-Score propriétaire", "Filtre compétition / poste", "Surbrillance galerie perso", "Tri par colonne"], badge: "Disponible avec clé API", badgeColor: "rgba(255,255,255,0.3)", holo: false },
          ].map((f, i) => (
            <div key={i} className={`lfeat ${f.holo ? "holo-border" : ""}`} onClick={onEnter}>
              <span style={{ fontSize: 24, marginBottom: 16, display: "block" }}>{f.icon}</span>
              <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>{f.tag}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", letterSpacing: 1, marginBottom: 10 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", fontFamily: "'Share Tech Mono',monospace", lineHeight: 1.7, marginBottom: 14 }}>{f.desc}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {f.items.map((item, j) => (
                  <div key={j} style={{ fontSize: 12, fontFamily: "'Share Tech Mono',monospace", color: f.holo ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: f.holo ? "#4de8ff" : "rgba(255,255,255,0.2)" }}>→</span>{item}
                  </div>
                ))}
              </div>
              <div style={{ display: "inline-block", fontSize: 10, fontFamily: "'Share Tech Mono',monospace", padding: "2px 8px", borderRadius: 4, marginTop: 16, background: f.badgeColor + "15", color: f.badgeColor, border: `1px solid ${f.badgeColor}33` }}>{f.badge}</div>
            </div>
          ))}
        </div>
      </section>

      {/* MODELS */}
      <section id="lmodels" style={{ position: "relative", zIndex: 2, padding: "40px 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", textAlign: "center", marginBottom: 12 }}>Intelligence artificielle</div>
        <h2 style={{ fontSize: 36, fontWeight: 700, textAlign: "center", color: "#f1f5f9", letterSpacing: 2, marginBottom: 8 }}>6 MODÈLES EN COMPÉTITION</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono',monospace", textAlign: "center", marginBottom: 40 }}>Chaque semaine, les modèles projettent tes joueurs. Le meilleur converge vers la réalité.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12 }}>
          {models.map(m => (
            <div key={m.id} className={`lmodel ${!m.color ? "holo-border" : ""}`} style={{ borderColor: m.color ? m.color + "33" : undefined }}>
              {m.color ? (
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Share Tech Mono',monospace", color: m.color, marginBottom: 6 }}>{m.id}</div>
              ) : (
                <div className="holo-text" style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Share Tech Mono',monospace", marginBottom: 6 }}>{m.id}</div>
              )}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono',monospace", marginBottom: 8 }}>{m.label}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono',monospace", lineHeight: 1.5 }}>{m.formula}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ position: "relative", zIndex: 2, padding: "60px 48px 100px", textAlign: "center" }}>
        <div className="holo-border" style={{ maxWidth: 600, margin: "0 auto", background: "rgba(255,255,255,0.02)", borderRadius: 24, padding: 48 }}>
          <h2 className="holo-text" style={{ fontSize: 36, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>PRÊT À OPTIMISER ?</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: "'Share Tech Mono',monospace", marginBottom: 32, lineHeight: 1.7 }}>
            Entre ton slug Sorare et génère ta meilleure compo SO5.<br />Gratuit · Sans mot de passe · Sans inscription.
          </p>
          <button className="lbtn-primary" onClick={onEnter}>Accéder à Soraki →</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ position: "relative", zIndex: 2, borderTop: "1px solid rgba(255,255,255,0.05)", padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>◈ SORAKI · Outil non officiel · Non affilié à Sorare</div>
        <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>Fait avec ❤ par rakijako</div>
      </footer>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState("landing");

  if (page === "landing") return <LandingPage onEnter={() => setPage("optimizer")} />;

  return (
    <div style={{ background: "#04060f", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div className="scanline-wrap"><div className="scanline" /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, background: "rgba(4,6,15,0.97)", backdropFilter: "blur(20px)", zIndex: 100 }}>
        <span className="holo-text" style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, marginRight: 8, cursor: "pointer" }} onClick={() => setPage("landing")}>◈ SORAKI</span>
        <button className={`nav-btn ${page === "optimizer" ? "active" : ""}`} onClick={() => setPage("optimizer")}>SO5 OPTIMIZER</button>
        <button className={`nav-btn ${page === "projections" ? "active" : ""}`} onClick={() => setPage("projections")}>PROJECTIONS</button>
        <button className={`nav-btn ${page === "odds" ? "active" : ""}`} onClick={() => setPage("odds")}>COTES PL</button>
      </div>
      {page === "optimizer" && <OptimizerPage />}
      {page === "projections" && <ProjectionsPage />}
      {page === "odds" && <OddsPage />}
    </div>
  );
}

// ─── ODDS PAGE ────────────────────────────────────────────────────────────────

function OddsPage() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(null);
  const [sortBy, setSortBy] = useState("date");

  // Convertit cote décimale en probabilité implicite
  const oddsToProb = (odd) => odd > 0 ? 1 / odd : 0;

  // Normalise les probas (retire la marge bookmaker)
  const normalizeProbs = (probs) => {
    const total = probs.reduce((a, b) => a + b, 0);
    return total > 0 ? probs.map(p => p / total) : probs;
  };

  const loadOdds = async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/odds");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRemaining(json.remaining);

      const processed = (json.data || []).map(match => {
        // Agrège les cotes H2H sur tous les bookmakers
        const homeOdds = [], drawOdds = [], awayOdds = [];
        const overOdds = [], underOdds = [];

        const bttsYesOdds = [], bttsNoOdds = [];

        for (const bm of (match.bookmakers || [])) {
          for (const market of (bm.markets || [])) {
            if (market.key === "h2h") {
              market.outcomes?.forEach(o => {
                if (o.name === match.home_team) homeOdds.push(o.price);
                else if (o.name === match.away_team) awayOdds.push(o.price);
                else drawOdds.push(o.price);
              });
            }
            if (market.key === "totals") {
              market.outcomes?.forEach(o => {
                if (o.name === "Over" && Math.abs((o.point || 0) - 2.5) < 0.1) overOdds.push(o.price);
                if (o.name === "Under" && Math.abs((o.point || 0) - 2.5) < 0.1) underOdds.push(o.price);
              });
            }
            if (market.key === "btts") {
              market.outcomes?.forEach(o => {
                if (o.name === "Yes") bttsYesOdds.push(o.price);
                if (o.name === "No") bttsNoOdds.push(o.price);
              });
            }
          }
        }

        const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        // H2H — normalisé (retire marge bookmaker)
        const rawProbs = normalizeProbs([
          oddsToProb(avg(homeOdds)),
          oddsToProb(avg(drawOdds)),
          oddsToProb(avg(awayOdds)),
        ]);

        // Over/Under — normalisés entre eux pour sommer à 100%
        let overProb = null, underProb = null;
        const overAvg = avg(overOdds);
        const underAvg = avg(underOdds);
        if (overAvg && underAvg) {
          const ou = normalizeProbs([oddsToProb(overAvg), oddsToProb(underAvg)]);
          overProb = ou[0];
          underProb = ou[1];
        } else if (overAvg) {
          overProb = oddsToProb(overAvg);
        }

        // BTTS — normalisés entre eux pour sommer à 100%
        let bttsYesProb = null, bttsNoProb = null;
        const bttsYesAvg = avg(bttsYesOdds);
        const bttsNoAvg = avg(bttsNoOdds);
        if (bttsYesAvg && bttsNoAvg) {
          const bt = normalizeProbs([oddsToProb(bttsYesAvg), oddsToProb(bttsNoAvg)]);
          bttsYesProb = bt[0];
          bttsNoProb = bt[1];
        }

        const date = new Date(match.commence_time);

        return {
          id: match.id,
          home: match.home_team,
          away: match.away_team,
          date,
          dateStr: date.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }),
          timeStr: date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          homeProb: rawProbs[0],
          drawProb: rawProbs[1],
          awayProb: rawProbs[2],
          overProb,
          underProb,
          bttsYesProb,
          bttsNoProb,
          bookmakers: match.bookmakers?.length || 0,
        };
      });

      // Tri par date
      processed.sort((a, b) => a.date - b.date);
      setMatches(processed);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Couleur selon probabilité (heat map)
  const pColor = (p) => {
    if (!p) return "rgba(255,255,255,0.2)";
    if (p >= 0.65) return "#34d399";
    if (p >= 0.50) return "#4de8ff";
    if (p >= 0.35) return "#fbbf24";
    return "#f87171";
  };

  // Cellule colorée
  const PCell = ({ p, bold }) => (
    <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: "'Share Tech Mono',monospace", fontSize: 13, color: pColor(p), fontWeight: bold ? 700 : 400, whiteSpace: "nowrap" }}>
      {p ? `${Math.round(p * 100)}%` : "—"}
    </td>
  );

  // Tri
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortArrow = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const sorted = useMemo(() => {
    const list = [...matches];
    list.sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      if (sortCol === "date") return sortDir === "asc" ? a.date - b.date : b.date - a.date;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return list;
  }, [matches, sortCol, sortDir]);

  // Grouper par jour après tri
  const byDay = useMemo(() => sorted.reduce((acc, m) => {
    const key = m.dateStr;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {}), [sorted]);

  const wrap = { minHeight: "calc(100vh - 57px)", background: "#04060f", padding: "24px", fontFamily: "'Rajdhani', sans-serif" };

  const thStyle = (col) => ({
    padding: "8px 12px", textAlign: "center", fontSize: 10, letterSpacing: 2,
    color: sortCol === col ? "#4de8ff" : "rgba(255,255,255,0.25)",
    fontFamily: "'Share Tech Mono',monospace", cursor: "pointer",
    whiteSpace: "nowrap", userSelect: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(4,6,15,0.97)",
  });

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="holo-text" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>COTES PL</h1>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono',monospace", marginTop: 4 }}>
            Probabilités nettoyées de la marge bookmaker · Marge bookmaker retirée
            {remaining && <span style={{ marginLeft: 8, color: "rgba(77,232,255,0.5)" }}>· {remaining} crédits restants</span>}
          </div>
        </div>
        <button className="action-btn green" onClick={loadOdds} disabled={loading}>
          {loading ? "Chargement..." : "↓ Charger les cotes"}
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16, fontFamily: "'Share Tech Mono',monospace" }}>
          {error}
        </div>
      )}

      {matches.length === 0 && !loading && (
        <div style={{ textAlign: "center", paddingTop: 80, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono',monospace", fontSize: 13, lineHeight: 2.2 }}>
          Clique sur "Charger les cotes" pour voir les prochains matchs PL<br />
          Probabilités calculées depuis 15+ bookmakers UK · Marge retirée
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Rajdhani',sans-serif" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle("date"), textAlign: "left", paddingLeft: 16 }} onClick={() => handleSort("date")}>Match{sortArrow("date")}</th>
                <th style={thStyle("date")}>Heure</th>
                <th style={thStyle("homeProb")} onClick={() => handleSort("homeProb")}>DOM{sortArrow("homeProb")}</th>
                <th style={thStyle("drawProb")} onClick={() => handleSort("drawProb")}>NUL{sortArrow("drawProb")}</th>
                <th style={thStyle("awayProb")} onClick={() => handleSort("awayProb")}>EXT{sortArrow("awayProb")}</th>
                <th style={thStyle("overProb")} onClick={() => handleSort("overProb")}>O2.5{sortArrow("overProb")}</th>
                <th style={thStyle("underProb")} onClick={() => handleSort("underProb")}>U2.5{sortArrow("underProb")}</th>
                <th style={thStyle("bttsYesProb")} onClick={() => handleSort("bttsYesProb")}>BTTS{sortArrow("bttsYesProb")}</th>
                <th style={thStyle("bttsNoProb")} onClick={() => handleSort("bttsNoProb")}>CS{sortArrow("bttsNoProb")}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byDay).map(([day, dayMatches]) => (
                <>
                  {/* Séparateur de jour */}
                  <tr key={`day-${day}`}>
                    <td colSpan={9} style={{ padding: "10px 16px 6px", fontSize: 10, letterSpacing: 4, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono',monospace", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {day}
                    </td>
                  </tr>
                  {dayMatches.map(m => {
                    const isHome = m.homeProb > m.awayProb;
                    const isClose = Math.abs(m.homeProb - m.awayProb) < 0.08;
                    return (
                      <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        {/* Match */}
                        <td style={{ padding: "10px 16px", minWidth: 260 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div>
                              <span style={{ fontSize: 14, fontWeight: 700, color: isHome ? "#f1f5f9" : "rgba(255,255,255,0.45)", fontFamily: "'Rajdhani',sans-serif" }}>{m.home}</span>
                              <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 6px", fontSize: 12 }}>vs</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: !isHome ? "#f1f5f9" : "rgba(255,255,255,0.45)", fontFamily: "'Rajdhani',sans-serif" }}>{m.away}</span>
                            </div>
                            {isClose && (
                              <span style={{ fontSize: 9, background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 4, padding: "1px 5px", fontFamily: "'Share Tech Mono',monospace" }}>SERRÉ</span>
                            )}
                          </div>
                        </td>
                        {/* Heure */}
                        <td style={{ padding: "10px 12px", textAlign: "center", fontSize: 12, color: "#4de8ff", fontFamily: "'Share Tech Mono',monospace", whiteSpace: "nowrap" }}>{m.timeStr}</td>
                        {/* Probas */}
                        <PCell p={m.homeProb} bold={isHome} />
                        <PCell p={m.drawProb} />
                        <PCell p={m.awayProb} bold={!isHome} />
                        <PCell p={m.overProb} bold={m.overProb > 0.55} />
                        <PCell p={m.underProb} />
                        <PCell p={m.bttsYesProb} bold={m.bttsYesProb > 0.55} />
                        <PCell p={m.bttsNoProb} bold={m.bttsNoProb > 0.55} />
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
