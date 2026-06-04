const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
    const res = await axios.get('https://bandi.mur.gov.it/jobs.php/public/cercaJobs?jv_comp_status_id=2-3&bb_type_code=%25&idsettore=%25');
    const $ = cheerio.load(res.data);
    
    // find links to jobs
    const allLinks = $('a').map((i, el) => $(el).attr('href')).get();
    const bandoLinks = allLinks.filter(h => h && (h.includes('bando') || h.includes('id=') || h.includes('job') || h.includes('call')));
    console.log("Filtered links:", bandoLinks.slice(0, 10));
    
    console.log("Table rows:", $('tr').length);
    if($('tr').length > 0) {
        console.log("First row text:", $('tr').eq(1).text().replace(/\s+/g, ' ').trim());
    }
}
test();
