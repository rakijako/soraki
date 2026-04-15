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
