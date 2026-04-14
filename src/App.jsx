import { useState } from "react";

async function gql(query, variables = {}) {
  const res = await fetch("/api/sorare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  console.log("RAW:", JSON.stringify(data).slice(0, 800));
  return data;
}

const TEST_QUERY = `
  query Test($slug: String!) {
    user(slug: $slug) {
      slug
      cards(first: 5) {
        nodes {
          slug
          rarityTyped
          anyPlayer {
            displayName
            anyPositions
          }
        }
      }
    }
  }
`;

export default function App() {
  const [slug, setSlug] = useState("");
  const [result, setResult] = useState("");

  const test = async () => {
    const data = await gql(TEST_QUERY, { slug });
    setResult(JSON.stringify(data, null, 2));
  };

  return (
    <div style={{ padding: 20, fontFamily: "monospace", background: "#04060f", minHeight: "100vh", color: "#e2e8f0" }}>
      <h1 style={{ color: "#4de8ff" }}>SORAKI — TEST API</h1>
      <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="ton slug" style={{ padding: 10, marginRight: 10, borderRadius: 6, border: "1px solid #333", background: "#111", color: "#fff" }} />
      <button onClick={test} style={{ padding: 10, background: "#4de8ff", border: "none", borderRadius: 6, cursor: "pointer" }}>Tester</button>
      <pre style={{ marginTop: 20, fontSize: 12, color: "#a5f3fc", whiteSpace: "pre-wrap" }}>{result}</pre>
    </div>
  );
}
