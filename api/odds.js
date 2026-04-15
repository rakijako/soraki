export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ODDS_API_KEY non configurée' });

  try {
    const url = `https://api.the-odds-api.com/v4/sports/soccer_epl/odds?regions=uk&markets=h2h,totals&oddsFormat=decimal&apiKey=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    // Headers utiles
    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');

    return res.status(200).json({ data, remaining, used });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
