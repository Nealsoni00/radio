import * as cheerio from 'cheerio';

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  return response.text();
}

async function main() {
  const html = await fetchPage('https://www.radioreference.com/db/browse/ctid/201');
  const $ = cheerio.load(html);
  const systems: any[] = [];
  const seenIds = new Set<number>();

  $('a[href*="/db/sid/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/sid\/(\d+)/);
    if (match) {
      const id = parseInt(match[1], 10);
      if (seenIds.has(id)) return;
      seenIds.add(id);
      const name = $(el).text().trim();
      const cell = $(el).closest('td');
      const typeText = cell.find('small').text().trim();
      const isP25 = typeText.toLowerCase().includes('p25');
      systems.push({ id, name, typeText, isP25 });
    }
  });

  console.log('Total systems found:', systems.length);
  console.log('P25 systems:', systems.filter(s => s.isP25).length);
  console.log('Sample systems:');
  systems.slice(0, 15).forEach(s => console.log(s));
}

main().catch(console.error);
