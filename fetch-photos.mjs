import https from 'https';
import fs from 'fs';
import { execSync } from 'child_process';

const PLAYER_WIKI = {
  messi: 'Lionel Messi',
  ronaldo: 'Cristiano Ronaldo',
  mbappe: 'Kylian Mbappé',
  neymar: 'Neymar',
  haaland: 'Erling Haaland',
  yamal: 'Lamine Yamal',
  lewandowski: 'Robert Lewandowski',
  vinicius: 'Vinícius Júnior',
  salah: 'Mohamed Salah',
  raphinha: 'Raphinha',
  pedri: 'Pedri (footballer)',
  gavi: 'Gavi (footballer)',
  debruyne: 'Kevin De Bruyne',
  bellingham: 'Jude Bellingham',
  modric: 'Luka Modrić',
  dejong: 'Frenkie de Jong',
  valverde: 'Federico Valverde',
  bruno: 'Bruno Fernandes (footballer, born 1994)',
  araujo: 'Ronald Araújo',
  kounde: 'Jules Koundé',
  balde: 'Alejandro Balde',
  vandijk: 'Virgil van Dijk',
  rudiger: 'Antonio Rüdiger',
  dias: 'Rúben Dias',
  taa: 'Trent Alexander-Arnold',
  hakimi: 'Achraf Hakimi',
  cubarsi: 'Pau Cubarsí',
  marquinhos: 'Marquinhos (footballer, born 1994)',
  terstegen: 'Marc-André ter Stegen',
  courtois: 'Thibaut Courtois',
  alisson: 'Alisson Becker',
  donnarumma: 'Gianluigi Donnarumma',
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'MorningApp/1.0' } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const tmpDir = '/tmp/player_photos2';
  execSync(`rm -rf "${tmpDir}"`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Batch 1 (first 20)
  const entries = Object.entries(PLAYER_WIKI);
  const batch1 = entries.slice(0, 20);
  const batch2 = entries.slice(20);

  const titleToThumb = {};

  for (const batch of [batch1, batch2]) {
    const titles = batch.map(([,t]) => t).join('|');
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=pageimages&format=json&pithumbsize=120&pilicense=any`;
    console.log(`Fetching batch (${batch.length} players)...`);
    const data = await fetchJSON(url);

    const normalized = {};
    if (data.query.normalized) data.query.normalized.forEach(n => { normalized[n.from] = n.to; });

    for (const p of Object.values(data.query.pages)) {
      if (p.thumbnail) titleToThumb[p.title] = p.thumbnail.source;
    }
    for (const [from, to] of Object.entries(normalized)) {
      if (titleToThumb[to]) titleToThumb[from] = titleToThumb[to];
    }
  }

  const result = {};

  for (const [id, wikiTitle] of entries) {
    const thumbUrl = titleToThumb[wikiTitle];
    if (!thumbUrl) {
      console.log(`  SKIP ${id}`);
      continue;
    }

    try {
      const origFile = `${tmpDir}/${id}_orig.jpg`;
      const smFile = `${tmpDir}/${id}.jpg`;

      // Use curl for reliable downloading (follows redirects)
      execSync(`curl -sL -o "${origFile}" "${thumbUrl}" -H "User-Agent: MorningApp/1.0"`, { timeout: 10000 });

      const stat = fs.statSync(origFile);
      if (stat.size < 1000) { console.log(`  SKIP ${id} (too small: ${stat.size}b)`); continue; }

      execSync(`sips -s format jpeg -z 80 80 "${origFile}" --out "${smFile}" 2>/dev/null`);
      const b64 = fs.readFileSync(smFile, 'base64');
      result[id] = `data:image/jpeg;base64,${b64}`;
      console.log(`  OK ${id} (${Math.round(b64.length / 1024)}KB)`);
    } catch (e) {
      console.log(`  FAIL ${id}: ${e.message.slice(0, 60)}`);
    }
  }

  const output = 'const PLAYER_PHOTOS=' + JSON.stringify(result) + ';\n';
  fs.writeFileSync('/tmp/player_photos.js', output);
  console.log(`\nDone: ${Object.keys(result).length}/${entries.length} photos`);
  console.log(`Output size: ${Math.round(output.length / 1024)}KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
