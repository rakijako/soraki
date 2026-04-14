import { useState, useCallback } from "react";

const SORARE_API = "/api/sorare";
const POS_COLOR = { GK: "#fbbf24", DEF: "#60a5fa", MID: "#34d399", FWD: "#f87171" };
const POS_LABEL = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" };
const POS_SLOTS = ["Goalkeeper", "Defender", "Midfielder", "Forward", "Extra"];
const SLOT_LABEL = { Goalkeeper: "Gardien", Defender: "Défenseur", Midfielder: "Milieu", Forward: "Attaquant", Extra: "Extra" };

const CARDS_QUERY = `
  query UserCards($slug: String!) {
    user(slug: $slug) {
      slug
      cards(first: 20) {
        nodes {
          slug
          rarityTyped
          anyPlayer {
            displayName
            anyPositions
            activeClub { name }
            averageScore(type: LAST_FIFTEEN_SO5_AVERAGE_SCORE)
            nextGame {
              date
              homeTeam { name }
              awayTeam { name }
            }
            nextClassicFixtureProjectedScore
            activeInjuries { active }
            activeSuspensions { active }
          }
        }
      }
    }
  }
`;

async function gql(query, variables = {}) {
  const res = await fetch(SORARE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

function normalizeCard(c) {
  const ng = c.anyPlayer?.nextGame;
  const home = ng?.homeTeam?.name;
  const away = ng?.awayTeam?.name;
  const club = c.anyPlayer?.activeClub?.name;
  const isHome = home === club;
  const opponent = isHome ? away : home;

  return {
    slug: c.slug,
    rarity: c.rarityTyped,
    player: {
      displayName: c.anyPlayer?.displayName,
      position: c.anyPlayer?.anyPositions?.[0],
      activeClub: c.anyPlayer?.activeClub,
      averageScore: c.anyPlayer?.averageScore,
      projectedScore: c.anyPlayer?.nextClassicFixtureProjectedScore,
      nextGame: ng ? {
        date: ng.date ? new Date(ng.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : null,
        opponent,
        isHome,
      } : null,
      hasInjury: (c.anyPlayer?.activeInjuries || []).some(i => i.active),
      hasSuspension: (c.anyPlayer?.activeSuspensions || []).some(s => s.active),
    },
  };
}

function optimizeLineup(cards) {
  const byPos = { Goalkeeper: [], Defender: [], Midfielder: [], Forward: [], Extra: [] };
  cards.forEach((c) => {
    const pos = c.player?.position;
    if (pos && byPos[pos]) byPos[pos].push(c);
    if (pos && pos !== "Goalkeeper") byPos.Extra.push(c);
  });
  Object.keys(byPos).forEach((p) =>
    byPos[p].sort((a, b) => (b.player?.averageScore || 0) - (a.player?.averageScore || 0))
  );
  const used = new Set();
  const lineup = {};
  for (const slot of ["Goalkeeper", "Defender", "Midfielder", "Forward"]) {
    const pick = byPos[slot].find((c) => !used.has(c.slug));
    if (pick) { lineup[slot] = pick; used.add(pick.slug); }
  }
  const extra = byPos.Extra.find((c) => !used.has(c.slug));
  if (extra) { lineup.Extra = extra; used.add(extra.slug); }
  const players = Object.values(lineup).filter(Boolean);
  const sumL15 = players.reduce((s, c) => s + (c.player?.averageScore || 0), 0);
  const clubCounts = players.reduce((acc, c) => {
    const cl = c.player?.activeClub?.name;
    if (cl) acc[cl] = (acc[cl] || 0) + 1;
    return acc;
  }, {});
  const maxClub = Math.max(0, ...Object.values(clubCounts));
  return { lineup, sumL15, capBonus: sumL15 < 260 ? 4 : 0, multiClubBonus: maxClub <= 2 ? 2 : 0 };
}

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
  .card-chip {
    background: rgba(255,255,255,0.025);
    border-radius: 12px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .card-chip:hover { background: rgba(255,255,255,0.05); transform: translateX(4px); }
  .card-chip.captain { border-color: transparent; }
  .rarity-filter-btn {
    border-radius: 8px;
    padding: 5px 12px;
    font-size: 11px;
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.15s;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.3);
  }
  .rarity-filter-btn.active {
    background: rgba(77,232,255,0.08);
    border-color: rgba(77,232,255,0.3);
    color: #4de8ff;
  }
  .main-btn {
    width: 100%;
    border: none;
    border-radius: 12px;
    padding: 15px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    font-family: 'Rajdhani', sans-serif;
    letter-spacing: 2px;
    text-transform: uppercase;
    background: linear-gradient(135deg, #ff6ec7, #4de8ff, #8a7fff, #ff9a3c);
    background-size: 300% auto;
    animation: holo-shift 3s linear infinite;
    color: #04060f;
    transition: opacity 0.2s;
  }
  .main-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .main-btn:not(:disabled):hover { filter: brightness(1.15); }
  .scanline-wrap { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
  .scanline {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(77,232,255,0.06), transparent);
    animation: scanline 6s linear infinite;
  }
  input:focus { outline: none; border-color: rgba(77,232,255,0.4) !important; }
`;

function CardChip({ card, isCaptain, onSetCaptain }) {
  if (!card) return (
    <div style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 18px", color: "rgba(255,255,255,0.18)", fontSize: 13, fontStyle: "italic", fontFamily: "'Share Tech Mono', monospace" }}>— aucune carte —</div>
  );
  const pos = card.player?.position;
  const posLabel = POS_LABEL[pos] || "EXT";
  const color = POS_COLOR[posLabel] || "#888";
  const score = card.player?.averageScore ? card.player.averageScore.toFixed(1) : "—";
  const rarityColor = { unique: "#f59e0b", super_rare: "#c084fc", rare: "#ef4444", limited: "#f97316", common: "#6b7280" }[card.rarity?.toLowerCase()] || "#6b7280";

  return (
    <div className={`card-chip holo-border ${isCaptain ? "captain" : ""}`} onClick={() => onSetCaptain(card.slug)}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: rarityColor, boxShadow: `0 0 8px ${rarityColor}` }} />
      <span style={{ background: color + "14", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace", flexShrink: 0, textShadow: `0 0 8px ${color}` }}>{posLabel}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: isCaptain ? "transparent" : "#e2e8f0", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.5, ...(isCaptain ? { background: "linear-gradient(90deg,#ff6ec7,#4de8ff,#8a7fff,#ff9a3c,#ff6ec7)", backgroundSize: "300% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "holo-shift 3s linear infinite" } : {}) }}>
          {card.player?.displayName}{isCaptain && <span style={{ marginLeft: 6, WebkitTextFillColor: "initial", color: "#facc15" }}>👑</span>}
        </div>
        <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, fontFamily: "'Share Tech Mono', monospace" }}>{card.player?.activeClub?.name || "—"}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace", color: "#4de8ff", textShadow: "0 0 12px rgba(77,232,255,0.6)" }}>{score}</div>
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, letterSpacing: 1 }}>L15</div>
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

export default function SorareSO5() {
  const [slug, setSlug] = useState("");
  const [step, setStep] = useState("home");
  const [error, setError] = useState("");
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [captain, setCaptain] = useState(null);
  const [rarityFilter, setRarityFilter] = useState("all");

  const run = useCallback(async (currentSlug, filter) => {
    setError("");
    setStep("loading");
    try {
      const data = await gql(CARDS_QUERY, { slug: currentSlug.trim().toLowerCase() });
      if (data?.errors?.length) throw new Error(data.errors[0].message);
      if (!data?.data?.user) throw new Error("Slug introuvable — vérifie ton pseudo Sorare.");
      const raw = (data.data.user.cards?.nodes || [])
        .map(normalizeCard)
        .filter(c => c.player?.position && c.player?.displayName);
      if (!raw.length) throw new Error("Aucune carte trouvée pour ce compte.");
      setCards(raw);
      const filtered = filter === "all" ? raw : raw.filter(c => c.rarity?.toLowerCase() === filter);
      const res = optimizeLineup(filtered);
      setResult(res);
      setCaptain(res.lineup["Forward"]?.slug || res.lineup["Midfielder"]?.slug || null);
      setStep("result");
    } catch (e) {
      setError(e.message || "Erreur inattendue.");
      setStep("home");
    }
  }, []);

  const handleFilter = (f) => {
    setRarityFilter(f);
    const filtered = f === "all" ? cards : cards.filter(c => c.rarity?.toLowerCase() === f);
    const res = optimizeLineup(filtered);
    setResult(res);
    setCaptain(res.lineup["Forward"]?.slug || res.lineup["Midfielder"]?.slug || null);
  };

  const wrap = { minHeight: "100vh", background: "#04060f", fontFamily: "'Rajdhani', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative" };
  const panel = { background: "rgba(6,10,22,0.95)", backdropFilter: "blur(30px)", borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 520, boxShadow: "0 0 80px rgba(77,232,255,0.05), 0 40px 100px rgba(0,0,0,0.8)", position: "relative", zIndex: 1 };

  if (step === "home") return (
    <div style={wrap}>
      <style>{CSS}</style>
      <div className="scanline-wrap"><div className="scanline" /></div>
      <div className="holo-border" style={panel}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: 5, color: "rgba(255,255,255,0.25)", fontFamily: "'Share Tech Mono', monospace", marginBottom: 8 }}>◈ SORAKI v1.0</div>
          <h1 className="holo-text" style={{ fontSize: 38, fontWeight: 700, lineHeight: 1, letterSpacing: 2 }}>SO5 OPTIMIZER</h1>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.28)", marginTop: 8, fontFamily: "'Share Tech Mono', monospace", lineHeight: 1.6 }}>Génère ta compo optimale sans mot de passe</div>
        </div>
        {error && (
          <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 13, marginBottom: 16, fontFamily: "'Share Tech Mono', monospace" }}>{error}</div>
        )}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 8, letterSpacing: 3, fontFamily: "'Share Tech Mono', monospace" }}>SLUG SORARE</div>
        <input
          style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "13px 16px", color: "#e2e8f0", fontSize: 15, fontFamily: "'Share Tech Mono', monospace", letterSpacing: 1, transition: "border-color 0.2s" }}
          placeholder="ex: rakijako"
          value={slug}
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
      <style>{CSS}</style>
      <div className="scanline-wrap"><div className="scanline" /></div>
      <div style={{ width: 44, height: 44, border: "2px solid rgba(255,255,255,0.05)", borderTop: "2px solid #4de8ff", borderRadius: "50%", animation: "spin 0.7s linear infinite", boxShadow: "0 0 20px rgba(77,232,255,0.3)" }} />
      <div className="holo-text" style={{ fontSize: 13, letterSpacing: 3, fontFamily: "'Share Tech Mono', monospace" }}>ANALYSE EN COURS</div>
    </div>
  );

  if (step === "result" && result) {
    const { lineup, sumL15, capBonus, multiClubBonus } = result;
    const totalBonus = capBonus + multiClubBonus;
    return (
      <div style={{ ...wrap, alignItems: "flex-start", paddingTop: 40, paddingBottom: 40 }}>
        <style>{CSS}</style>
        <div className="scanline-wrap"><div className="scanline" /></div>
        <div className="holo-border" style={{ ...panel, maxWidth: 560 }}>
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
