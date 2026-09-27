// Builds the README graphics from live GitHub data. Run: GH_TOKEN=... node scripts/build.mjs
// Needs a user token with read:user and repo so private work counts. Fonts are embedded so the SVGs render the same everywhere.
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GH_TOKEN missing");
const LOGIN = "abhyuday10";
const OUT = "assets";
const G = { ground: "#060A18", ink: "#E6ECF5", dim: "#76849F", rule: "#1E2840", cyan: "#3FE0FF", amber: "#FFB02E", bronze: "#B87333" };

const font = (file) => fs.readFileSync(path.join("fonts", file)).toString("base64");
const FONTS = `@font-face{font-family:'Martian Mono';src:url(data:font/woff2;base64,${font("MartianMono.woff2")}) format('woff2')}
@font-face{font-family:'Newsreader';src:url(data:font/woff2;base64,${font("Newsreader.woff2")}) format('woff2')}`;
const mono = `font-family="'Martian Mono', ui-monospace, Menlo, Consolas, monospace"`;
const serif = `font-family="Newsreader, Georgia, serif"`;
const fmt = (n) => n.toLocaleString("en-GB");

async function gh(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": LOGIN, Accept: "application/vnd.github+json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${url} ${r.status} ${await r.text()}`);
  return r.json();
}

// Contributions, last 365 days, private included when the token allows it.
const to = new Date(); const from = new Date(to); from.setDate(from.getDate() - 364);
const q = `{ viewer { contributionsCollection(from:"${from.toISOString()}", to:"${to.toISOString()}") { restrictedContributionsCount contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } commitContributionsByRepository(maxRepositories:100) { repository { isPrivate } contributions { totalCount } } } } }`;
const who = (await gh("https://api.github.com/graphql", { method: "POST", body: JSON.stringify({ query: "{ viewer { login } }" }) })).data.viewer.login;
if (who !== LOGIN) throw new Error(`token belongs to ${who}, not ${LOGIN}; set the PROFILE_TOKEN secret to a user token with read:user and repo`);
const cc = (await gh("https://api.github.com/graphql", { method: "POST", body: JSON.stringify({ query: q }) })).data.viewer.contributionsCollection;
const days = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
const total = cc.contributionCalendar.totalContributions;
const byRepo = cc.commitContributionsByRepository;
const commitsAll = byRepo.reduce((n, r) => n + r.contributions.totalCount, 0);
const commitsPrivate = byRepo.filter((r) => r.repository.isPrivate).reduce((n, r) => n + r.contributions.totalCount, 0);
const privatePct = Math.round((100 * (commitsPrivate + cc.restrictedContributionsCount)) / Math.max(1, commitsAll + cc.restrictedContributionsCount));
const months = new Map();
for (const d of days) months.set(d.date.slice(0, 7), (months.get(d.date.slice(0, 7)) ?? 0) + d.contributionCount);
const monthVals = [...months.values()];
const busiest = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));

// Languages by bytes across every owned repo, forks excluded.
const langs = {};
for (let page = 1; ; page++) {
  const repos = await gh(`https://api.github.com/user/repos?per_page=100&affiliation=owner&page=${page}`);
  if (!repos.length) break;
  for (const r of repos) if (!r.fork) for (const [k, v] of Object.entries(await gh(r.languages_url))) langs[k] = (langs[k] ?? 0) + v;
}
const langTot = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k === "Jupyter Notebook" ? "Notebooks" : k, v / langTot]);

// Kaggle has no public API for these; update by hand when they change.
const KAGGLE = { tier: "Competitions Expert", rank: "rank 2,214 of 217,537", rows: [["Orbit Wars", "60 / 4,729", "silver", G.amber], ["Pokémon TCG", "158 / 6,807", "silver", G.amber], ["Vesuvius ink", "89 / 1,249", "bronze", G.bronze]] };

const W = 830, H = 236;
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${total} contributions in the last year, top languages, Kaggle results">
<style>${FONTS}
.in{opacity:0;animation:in 700ms ease-out forwards}@keyframes in{to{opacity:1}}
.bar{transform:scaleY(0);transform-origin:bottom;animation:up 900ms cubic-bezier(.2,.8,.2,1) forwards}@keyframes up{to{transform:scaleY(1)}}
.w{transform:scaleX(0);transform-origin:left;animation:wide 900ms cubic-bezier(.2,.8,.2,1) forwards}@keyframes wide{to{transform:scaleX(1)}}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${G.ground}" stroke="${G.rule}"/>
<line x1="286" y1="20" x2="286" y2="${H - 20}" stroke="${G.rule}"/><line x1="548" y1="20" x2="548" y2="${H - 20}" stroke="${G.rule}"/>
<g ${mono} class="in">
<text x="28" y="40" font-size="11" fill="${G.dim}" letter-spacing="1.5">LAST 365 DAYS</text>
<text x="28" y="86" font-size="40" fill="${G.cyan}">${fmt(total)}</text>
<text x="28" y="108" font-size="12" fill="${G.ink}">contributions, ${privatePct}% private</text>
<text x="28" y="126" font-size="11" fill="${G.dim}">busiest day ${busiest.contributionCount}, on ${new Date(busiest.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</text>
</g>`;
const max = Math.max(1, ...monthVals);
monthVals.forEach((v, i) => {
  const bw = 14, gap = 4, x = 28 + i * (bw + gap), h = Math.max(2, Math.round((v / max) * 60)), y = 206 - h, last = i === monthVals.length - 1;
  s += `<rect class="bar" x="${x}" y="${y}" width="${bw}" height="${h}" rx="2" fill="${last ? G.amber : G.cyan}" opacity="${last ? 1 : 0.75}" style="animation-delay:${200 + i * 40}ms"/>`;
});
s += `<text x="28" y="222" ${mono} font-size="10" fill="${G.dim}" class="in">by month</text>
<g ${mono} class="in" style="animation-delay:200ms"><text x="314" y="40" font-size="11" fill="${G.dim}" letter-spacing="1.5">LANGUAGES, BY BYTES</text></g>`;
topLangs.forEach(([name, p], i) => {
  const y = 66 + i * 38;
  s += `<g ${mono} class="in" style="animation-delay:${250 + i * 80}ms"><text x="314" y="${y}" font-size="12" fill="${G.ink}">${name}</text><text x="520" y="${y}" font-size="12" fill="${G.dim}" text-anchor="end">${Math.round(p * 100)}%</text><rect x="314" y="${y + 8}" width="206" height="4" rx="2" fill="${G.rule}"/><rect class="w" x="314" y="${y + 8}" width="${Math.max(2, Math.round(206 * p))}" height="4" rx="2" fill="${G.cyan}" style="animation-delay:${300 + i * 80}ms"/></g>`;
});
s += `<g ${mono} class="in" style="animation-delay:400ms"><text x="576" y="40" font-size="11" fill="${G.dim}" letter-spacing="1.5">KAGGLE</text><text x="576" y="70" font-size="12" fill="${G.ink}">${KAGGLE.tier}</text><text x="576" y="88" font-size="11" fill="${G.dim}">${KAGGLE.rank}</text></g>`;
KAGGLE.rows.forEach(([n, r, m, c], i) => {
  const y = 126 + i * 32;
  s += `<g ${mono} class="in" style="animation-delay:${500 + i * 100}ms"><circle cx="581" cy="${y - 4}" r="4" fill="${c}"/><text x="594" y="${y}" font-size="12" fill="${G.ink}">${n}</text><text x="802" y="${y}" font-size="12" fill="${G.cyan}" text-anchor="end">${r}</text><text x="594" y="${y + 15}" font-size="10" fill="${G.dim}">${m}</text></g>`;
});
s += `</svg>`;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "panel.svg"), s);

function card(file, title, sub, num, numLabel) {
  const w = 407, h = 118;
  fs.writeFileSync(path.join(OUT, file), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">
<style>${FONTS}</style>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="${G.ground}" stroke="${G.rule}"/>
<text x="24" y="42" ${serif} font-size="21" fill="${G.ink}">${title}</text>
<text x="24" y="64" ${mono} font-size="10" fill="${G.dim}">${sub}</text>
<text x="24" y="96" ${mono} font-size="20" fill="${G.amber}">${num}</text>
<text x="${24 + num.length * 13.2 + 10}" y="96" ${mono} font-size="11" fill="${G.dim}">${numLabel}</text>
<text x="${w - 24}" y="96" ${mono} font-size="11" fill="${G.cyan}" text-anchor="end">read the writeup →</text>
</svg>`);
}
card("card-pokemon.svg", "A Pokémon bot that beat a Worlds finalist", "One Recipe, Many Experts · entity transformer · self-play", "top 2.3%", "of 6,807 teams");
card("card-orbit.svg", "Self-play RL from scratch on $100 of GPU", "Orbit Wars · real-time strategy · my first RL agent", "60th", "of 4,729 teams");
console.log(`built: ${total} contributions, ${privatePct}% private, languages ${topLangs.map((l) => l[0]).join(", ")}`);
