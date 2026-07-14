const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function test() {
  console.log("Testing Apple Music for 'Lida'");
  const apple = await fetchJson('https://itunes.apple.com/search?term=Lida&entity=musicArtist&limit=5');
  console.log("Apple Artists:", apple.results.map(r => r.artistName + ' (ID: ' + r.artistId + ')'));

  const appleSongs = await fetchJson('https://itunes.apple.com/search?term=Lida&entity=song&limit=5');
  console.log("Apple Songs:", appleSongs.results.map(r => r.artistName + ' - ' + r.trackName + ' (' + r.artworkUrl100 + ')'));

  console.log("Testing Deezer for 'Lida'");
  const deezer = await fetchJson('https://api.deezer.com/search/artist?q=Lida');
  console.log("Deezer:", deezer.data.map(r => r.name + ' (Fans: ' + r.nb_fan + ', Picture: ' + r.picture_medium + ')'));
}
test();
