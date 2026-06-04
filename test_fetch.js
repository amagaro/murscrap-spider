const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('../../../scratch_results.html', 'utf8');
const $ = cheerio.load(html);

console.log("Total items:", $('.bandi-row, .row, li, tr').length);
const items = $('.contenuto, .scheda, .bando, .row');
if (items.length > 0) {
    console.log("Found classes like:", items.first().attr('class'));
} else {
    console.log("Looking for common container...");
    console.log($('div').map((i, el) => $(el).attr('class')).get().slice(0, 20));
}
