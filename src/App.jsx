import { useState, useCallback, useMemo } from "react";

const SORARE_API = "/api/sorare";
const POS_COLOR = { GK: "#fbbf24", DEF: "#60a5fa", MID: "#34d399", FWD: "#f87171" };
const POS_LABEL = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" };
const POS_SLOTS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Extra"];
const SLOT_LABEL = { Goalkeeper: "Gardien", Defender: "Défenseur", Midfielder: "Milieu", Forward: "Attaquant", Extra: "Extra" };

// Clubs par compétition (slugs Sorare validés)
const COMP_CLUBS = {
  "L1": ["paris-saint-germain-fc", "olympique-de-marseille", "as-monaco-fc", "olympique-lyonnais", "stade-rennais-fc", "losc-lille", "rc-lens", "ogc-nice", "girondins-de-bordeaux", "stade-brestois-29"],
  "PL": ["manchester-city-fc", "arsenal-fc", "liverpool-fc", "chelsea-fc", "manchester-united-fc", "tottenham-hotspur-fc", "newcastle-united-fc", "aston-villa-fc", "west-ham-united-fc", "brighton-and-hove-albion-fc"],
  "Liga": ["fc-barcelona", "real-madrid-cf", "atletico-de-madrid", "real-sociedad", "villarreal-cf", "athletic-club", "real-betis-balompie", "sevilla-fc", "rc-celta-de-vigo", "rcd-mallorca"],
  "Bundes": ["fc-bayern-munchen", "borussia-dortmund", "bayer-04-leverkusen", "rb-leipzig", "borussia-monchengladbach", "eintracht-frankfurt", "vfb-stuttgart", "sc-freiburg", "1-fc-union-berlin", "tsg-1899-hoffenheim"],
  "Serie A": ["juventus-fc", "fc-internazionale-milano", "ac-milan", "as-roma", "ssc-napoli", "ss-lazio", "atalanta-bc", "acf-fiorentina", "us-sassuolo-calcio", "torino-fc"],
};

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
            activeClub { name }
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

const CLUB_PLAYERS_QUERY = `
  query ClubPlayers($slug: String!) {
    club(slug: $slug) {
      name
      activePlayers {
        nodes {
          slug
          displayName
          anyPositions
          activeClub { name }
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

function calcDScore(l15, proj, isHome, hasInjury, hasSuspension) {
  if (!l15) return null;
  let score = 0.6 * l15 + 0.4 * (proj || l15);
  if (isHome) score *= 1.05;
  if (hasInjury || hasSuspension) score *= 0.5;
  return Math.round(score);
}

function normalizePlayer(p, rarity = null, cardSlug = null, inGallery = false) {
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

  return {
    slug: p?.slug,
    cardSlug,
    rarity,
    displayName: p?.displayName,
    position: p?.anyPositions?.[0],
    club,
    l15,
    proj,
    isHome,
    opponent,
    gameDate: ng?.date ? new Date(ng.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : null,
    hasInjury,
    hasSuspension,
    dScore: calcDScore(l15, proj, isHome, hasInjury, hasSuspension),
    inGallery,
  };
}

function normalizeCard(c) {
  return normalizePlayer(c.anyPlayer, c.rarityTyped, c.slug, true);
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
  .filter-btn {
    padding: 5px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.3);
    font-family: 'Share Tech Mono', monospace; font-size: 11px; cursor: pointer;
    letter-spacing: 1px; transition: all 0.15s; text-transform: uppercase;
  }
  .filter-btn.active { background: rgba(77,232,255,0.08); border-color: rgba(77,232,255,0.3); color: #4de8ff; }
  .filter-btn.gallery-on { background: rgba(250,204,21,0.1); border-color: rgba(250,204,21,0.4); color: #facc15; }
  .main-btn {
    width: 100%; border: none; border-radius: 12px; padding: 15px;
    font-size: 15px; font-weight: 700; cursor: pointer;
    font-family: 'Rajdhani', sans-serif; letter-spacing: 2px; text-transform: uppercase;
    background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c);
    background-size: 300% auto; animation: holo-shift 3s linear infinite;
    color: #04060f; transition: opacity 0.2s;
  }
  .main-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .main-btn:not(:disabled):hover { filter: brightness(1.15); }
  .scanline-wrap { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
  .scanline {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(77,232,255,0.06), transparent);
    animation: scanline 6s linear infinite;
  }
  .db-table { width: 100%; border-collapse: collapse; font-family: 'Share Tech Mono', monospace; font-size: 12px; }
  .db-table th {
    padding: 8px 10px; text-align: left; color: rgba(255,255,255,0.25);
    font-size: 10px; letter-spacing: 2px; border-bottom: 1px solid rgba(255,255,255,0.06);
    cursor: pointer; white-space: nowrap; user-select: none;
  }
  .db-table th:hover { color: #4de8ff; }
  .db-table th.sorted { color: #4de8ff; }
  .db-table td { padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.7); white-space: nowrap; }
  .db-table tr:hover td { background: rgba(255,255,255,0.03); }
  .db-table tr.in-gallery td { background: rgba(250,204,21,0.03); }
  .dscore-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 12px; }
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
`;

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function DScoreBadge({ value }) {
  if (!value) return <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>;
  const color = value >= 70 ? "#34d399" : value >= 55 ? "#4de8ff" : value >= 40 ? "#fbbf24" : "#f87171";
  return <span className="dscore-badge" style={{ background: color + "18", color, border: `1px solid ${color}33` }}>{value}</span>;
}

function PosBadge({ pos }) {
  const label = POS_LABEL[pos] || "?";
  const color = POS_COLOR[label] || "#888";
  return <span style={{ background: color + "18", color, border: `1px solid ${color}33`, borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{label}</span>;
}

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

// ─── DATABASE PAGE ────────────────────────────────────────────────────────────

function DatabasePage() {
  const [players, setPlayers] = useState([]);
  const [galleryMap, setGalleryMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [sortCol, setSortCol] = useState("dScore");
  const [sortDir, setSortDir] = useState("desc");
  const [posFilter, setPosFilter] = useState("all");
  const [compFilter, setCompFilter] = useState("L1");
  const [search, setSearch] = useState("");
  const [galleryOnly, setGalleryOnly] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [loadedComp, setLoadedComp] = useState(null);

  const loadGallery = async (userSlug) => {
    if (!userSlug) return {};
    const gData = await gql(USER_CARDS_QUERY, { slug: userSlug.trim().toLowerCase() });
    const map = {};
    if (gData?.data?.user) {
      (gData.data.user.cards?.nodes || []).forEach(c => {
        const p = normalizeCard(c);
        map[p.slug] = p;
      });
    }
    return map;
  };

  const loadCompetition = useCallback(async (comp, userSlug) => {
    setLoading(true); setError(""); setPlayers([]);
    const clubSlugs = COMP_CLUBS[comp] || [];
    const gallery = await loadGallery(userSlug);
    setGalleryMap(gallery);

    const all = [];
    for (let i = 0; i < clubSlugs.length; i++) {
      const clubSlug = clubSlugs[i];
      setLoadingMsg(`Chargement ${i + 1}/${clubSlugs.length} — ${clubSlug.replace(/-/g, " ")}...`);
      try {
        const data = await gql(CLUB_PLAYERS_QUERY, { slug: clubSlug });
        if (data?.errors?.length) continue;
        const nodes = data?.data?.club?.activePlayers?.nodes || [];
        nodes.forEach(p => {
          const norm = normalizePlayer(p);
          if (gallery[norm.slug]) {
            norm.inGallery = true;
            norm.rarity = gallery[norm.slug].rarity;
          }
          all.push(norm);
        });
        // Pause pour respecter le rate limit
        await new Promise(r => setTimeout(r, 1600));
      } catch (e) {
        console.error("Erreur club", clubSlug, e);
      }
    }

    setPlayers(all);
    setLoadedComp(comp);
    setLoading(false);
    setLoadingMsg("");
  }, []);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sortArrow = (col) => sortCol === col ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  const filtered = useMemo(() => {
    let list = [...players];
    if (galleryOnly) list = list.filter(p => p.inGallery);
    if (posFilter !== "all") list = list.filter(p => p.position === posFilter);
    if (search) list = list.filter(p =>
      p.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      p.club?.toLowerCase().includes(search.toLowerCase())
    );
    list.sort((a, b) => {
      const va = a[sortCol] ?? -1;
      const vb = b[sortCol] ?? -1;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return list.slice(0, 150);
  }, [players, galleryOnly, posFilter, search, sortCol, sortDir]);

  return (
    <div style={{ minHeight: "100vh", background: "#04060f", fontFamily: "'Rajdhani', sans-serif", paddingBottom: 40 }}>

      {/* Toolbar */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 57, background: "rgba(4,6,15,0.97)", backdropFilter: "blur(20px)", zIndex: 90 }}>

        {/* Slug + bouton charger */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <input className="soraki-input" type="text" placeholder="slug Sorare (optionnel)" value={slugInput} onChange={e => setSlugInput(e.target.value)} style={{ width: 200 }} />
          <button className="filter-btn" style={{ padding: "8px 16px" }}
            onClick={() => loadCompetition(compFilter, slugInput)} disabled={loading}>
            {loading ? loadingMsg || "..." : "Charger"}
          </button>
          <button className={`filter-btn ${galleryOnly ? "gallery-on" : ""}`}
            onClick={() => setGalleryOnly(g => !g)}>
            ★ Ma galerie {Object.keys(galleryMap).length > 0 ? `(${Object.keys(galleryMap).length})` : ""}
          </button>
          <div style={{ flex: 1 }} />
          <input className="soraki-input" type="text" placeholder="Recherche joueur ou club..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
        </div>

        {/* Compétitions */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {Object.keys(COMP_CLUBS).map(c => (
            <button key={c} className={`filter-btn ${compFilter === c ? "active" : ""}`}
              onClick={() => setCompFilter(c)}>
              {c}
            </button>
          ))}
        </div>

        {/* Postes */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", "Goalkeeper", "Defender", "Midfielder", "Forward"].map(p => (
            <button key={p} className={`filter-btn ${posFilter === p ? "active" : ""}`}
              onClick={() => setPosFilter(p)}>
              {p === "all" ? "Tous" : POS_LABEL[p]}
            </button>
          ))}
          {filtered.length > 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, fontFamily: "'Share Tech Mono', monospace", alignSelf: "center", marginLeft: 8 }}>{filtered.length} joueurs</span>}
        </div>

        {error && <div style={{ color: "#fca5a5", fontSize: 12, fontFamily: "'Share Tech Mono', monospace", marginTop: 8 }}>{error}</div>}
      </div>

      {/* Empty state */}
      {!loading && players.length === 0 && (
        <div style={{ textAlign: "center", paddingTop: 80, color: "rgba(255,255,255,0.2)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13, lineHeight: 2 }}>
          Sélectionne une compétition<br />Entre ton slug (optionnel) pour voir ta galerie<br />Clique sur Charger
        </div>
      )}

      {/* Table */}
      {players.length > 0 && (
        <div style={{ overflowX: "auto", padding: "0 24px", marginTop: 16 }}>
          <table className="db-table">
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Pos</th>
                <th>Club</th>
                <th className={sortCol === "l15" ? "sorted" : ""} onClick={() => handleSort("l15")}>L15{sortArrow("l15")}</th>
                <th>Match</th>
                <th className={sortCol === "proj" ? "sorted" : ""} onClick={() => handleSort("proj")}>Proj{sortArrow("proj")}</th>
                <th className={sortCol === "dScore" ? "sorted" : ""} onClick={() => handleSort("dScore")}>D-Score{sortArrow("dScore")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.slug || i} className={p.inGallery ? "in-gallery" : ""}>
                  <td>
                    <span style={{ color: "#e2e8f0", fontFamily: "'Rajdhani', sans-serif", fontSize: 14, fontWeight: 600 }}>
                      {p.inGallery && <span style={{ color: "#facc15", marginRight: 4 }}>★</span>}
                      {p.displayName}
                      {p.hasInjury && <span style={{ marginLeft: 4 }}>🤕</span>}
                      {p.hasSuspension && <span style={{ marginLeft: 4 }}>🟥</span>}
                    </span>
                  </td>
                  <td><PosBadge pos={p.position} /></td>
                  <td style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{p.club}</td>
                  <td style={{ color: "#4de8ff", fontWeight: 700 }}>{p.l15 ? p.l15.toFixed(0) : "—"}</td>
                  <td style={{ fontSize: 11 }}>
                    {p.opponent ? (
                      <span>
                        <span style={{ color: p.isHome ? "#34d399" : "#f87171" }}>{p.isHome ? "DOM" : "EXT"}</span>
                        <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 4px" }}>·</span>
                        <span style={{ color: "rgba(255,255,255,0.5)" }}>{p.opponent}</span>
                        <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 4 }}>{p.gameDate}</span>
                      </span>
                    ) : <span style={{ color: "#f87171" }}>NG</span>}
                  </td>
                  <td style={{ color: "#8a7fff" }}>{p.proj ? `▶ ${p.proj.toFixed(0)}` : "—"}</td>
                  <td><DScoreBadge value={p.dScore} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

      {/* NAV */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", position: "sticky", top: 0, background: "rgba(4,6,15,0.97)", backdropFilter: "blur(20px)", zIndex: 100 }}>
        <span className="holo-text" style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, marginRight: 8 }}>◈ SORAKI</span>
        <button className={`nav-btn ${page === "optimizer" ? "active" : ""}`} onClick={() => setPage("optimizer")}>SO5 OPTIMIZER</button>
        <button className={`nav-btn ${page === "database" ? "active" : ""}`} onClick={() => setPage("database")}>DATABASE</button>
      </div>

      {page === "optimizer" && <OptimizerPage />}
      {page === "database" && <DatabasePage />}
    </div>
  );
}
