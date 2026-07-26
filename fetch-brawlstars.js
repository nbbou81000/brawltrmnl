/**
 * Fetch Brawl Stars stats via le proxy RoyaleAPI (contourne le whitelisting IP
 * de l'API officielle Supercell, incompatible avec les IP dynamiques de GH Actions).
 *
 * Env vars requises (à mettre en secrets GitHub) :
 *  - BS_API_KEY   : ta clé API générée sur developer.brawlstars.com
 *  - BS_PLAYER_TAG: tag du joueur, SANS le "#" (ex: 2PP0JQPLY)
 *  - BS_CLUB_TAG  : (optionnel) tag du club, SANS le "#"
 *
 * Sortie : data.json à la racine du repo (à adapter selon ton hosting GH Pages)
 */

const BASE_URL = "https://bsproxy.royaleapi.dev/v1";

const API_KEY = process.env.BS_API_KEY;
const PLAYER_TAG = process.env.BS_PLAYER_TAG;
const CLUB_TAG = process.env.BS_CLUB_TAG || null;

if (!API_KEY || !PLAYER_TAG) {
  console.error("Missing BS_API_KEY or BS_PLAYER_TAG env vars");
  process.exit(1);
}

async function bsFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brawl Stars API error ${res.status} on ${path}: ${body}`);
  }
  return res.json();
}

function modeLabel(battle) {
  return (
    battle?.event?.mode ||
    battle?.battle?.mode ||
    "unknown"
  );
}

function battleResult(battle) {
  const b = battle.battle || {};
  if (typeof b.trophyChange === "number") {
    if (b.trophyChange > 0) return "victoire";
    if (b.trophyChange < 0) return "défaite";
    return "égalité";
  }
  if (b.result) {
    // showdown etc renvoient parfois directement result
    if (b.result === "victory") return "victoire";
    if (b.result === "defeat") return "défaite";
    return "égalité";
  }
  return "?";
}

async function main() {
  const tag = encodeURIComponent(`#${PLAYER_TAG}`);
  const player = await bsFetch(`/players/${tag}`);
  const battlelog = await bsFetch(`/players/${tag}/battlelog`);

  const topBrawlers = [...player.brawlers]
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 6)
    .map((b) => ({
      name: b.name,
      trophies: b.trophies,
      highestTrophies: b.highestTrophies,
      power: b.power,
      rank: b.rank,
    }));

  const recentBattles = battlelog.items.slice(0, 5).map((item) => ({
    time: item.battleTime,
    mode: modeLabel(item),
    result: battleResult(item),
    trophyChange: item.battle?.trophyChange ?? null,
  }));

  let club = null;
  if (player.club?.tag) {
    const clubData = await bsFetch(
      `/clubs/${encodeURIComponent(player.club.tag)}`
    );
    club = {
      name: clubData.name,
      trophies: clubData.trophies,
      members: clubData.members?.length ?? null,
      requiredTrophies: clubData.requiredTrophies,
    };
  } else if (CLUB_TAG) {
    const clubData = await bsFetch(
      `/clubs/${encodeURIComponent(`#${CLUB_TAG}`)}`
    );
    club = {
      name: clubData.name,
      trophies: clubData.trophies,
      members: clubData.members?.length ?? null,
      requiredTrophies: clubData.requiredTrophies,
    };
  }

  const data = {
    updatedAt: new Date().toISOString(),
    player: {
      name: player.name,
      tag: player.tag,
      trophies: player.trophies,
      highestTrophies: player.highestTrophies,
      expLevel: player.expLevel,
      soloVictories: player["3vs3Victories"] ?? player.threeVsThreeVictories,
      duoVictories: player.duoVictories,
      victories3v3: player["3vs3Victories"],
    },
    club,
    topBrawlers,
    recentBattles,
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile("data.json", JSON.stringify(data, null, 2));
  console.log("data.json écrit avec succès");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
