const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const HISTORY_FILE = path.join(__dirname, 'history.json');

const TARGETS = [
    { name: 'Ricercatori a tempo determinato', url: 'https://bandi.mur.gov.it/jobs.php/public/cercaJobs' },
    { name: 'Professori', url: 'https://bandi.mur.gov.it/profcalls.php/public/cercaJobs' },
    { name: 'Assegni di Ricerca', url: 'https://bandi.mur.gov.it/contrattidiricerca.php/public/cercaFellowship' },
    { name: 'Incarichi Post-Doc', url: 'https://bandi.mur.gov.it/incarichipostdoc.php/public/cercaFellowship' },
    { name: 'Incarichi di Ricerca', url: 'https://bandi.mur.gov.it/incarichidiricerca.php/public/cercaFellowship' }
];

const SEARCH_CRITERIA = ['08/CEAR-08', 'CEAR-08'];
const TEST_MODE = process.env.TEST_MODE === 'true';

async function fetchBandi() {
    let allResults = [];
    
    for (const target of TARGETS) {
        console.log(`Searching in: ${target.name}`);
        try {
            // jv_comp_status_id=2-3 rappresenta "Aperti" (potrebbe variare su fellowship, ma come base testiamo)
            // Se bb_type_code e idsettore non sono necessari, omettiamoli per pescare più risultati possibili
            // per poi filtrare in JS. Se mancano, verranno presi tutti.
            const res = await axios.get(target.url, {
                params: {
                    jv_comp_status_id: '2-3',
                    bb_type_code: '%',
                    idsettore: '%'
                }
            });
            const $ = cheerio.load(res.data);
            
            // Cerchiamo i link che portano al bando
            const links = $('a').filter((i, el) => {
                const href = $(el).attr('href');
                return href && (href.includes('bando') || href.includes('id=') || href.includes('job') || href.includes('call'));
            });
            
            links.each((i, el) => {
                const href = $(el).attr('href');
                const row = $(el).closest('tr');
                let textContent = '';
                let title = $(el).text().trim() || 'Dettaglio Bando';
                
                if (row.length > 0) {
                    textContent = row.text().replace(/\s+/g, ' ');
                } else {
                    const parent = $(el).parent();
                    textContent = parent.text().replace(/\s+/g, ' ');
                }
                
                // Evita duplicati nella stessa pagina (es. due link allo stesso bando)
                if (!allResults.some(r => r.id === href)) {
                    allResults.push({
                        type: target.name,
                        title: title,
                        url: href.startsWith('http') ? href : `https://bandi.mur.gov.it${href}`,
                        text: textContent,
                        id: href
                    });
                }
            });
            
        } catch (error) {
            console.error(`Error fetching ${target.name}:`, error.message);
        }
    }
    
    return allResults;
}

function filterBandi(bandi) {
    if (TEST_MODE) {
        console.log("TEST_MODE is enabled. Taking first 3 results without filtering by GSD.");
        return bandi.slice(0, 3);
    }
    
    return bandi.filter(bando => {
        const text = bando.text.toUpperCase();
        return SEARCH_CRITERIA.some(criteria => text.includes(criteria.toUpperCase()));
    });
}

function loadHistory() {
    if (fs.existsSync(HISTORY_FILE)) {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
    return [];
}

function saveHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

async function sendEmail(newBandi) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS
        }
    });
    
    let htmlContent = `<h2>Nuovi Bandi MUR Trovati</h2>`;
    htmlContent += `<p>Sono stati trovati ${newBandi.length} nuovi bandi attivi per il GSD 08/CEAR-08:</p>`;
    
    // Group by type
    const grouped = newBandi.reduce((acc, curr) => {
        acc[curr.type] = acc[curr.type] || [];
        acc[curr.type].push(curr);
        return acc;
    }, {});
    
    for (const [type, bandi] of Object.entries(grouped)) {
        htmlContent += `<h3>${type}</h3><ul>`;
        for (const bando of bandi) {
            htmlContent += `<li>
                <strong><a href="${bando.url}">${bando.title}</a></strong><br/>
                <small>${bando.text.substring(0, 300)}...</small>
            </li><br/>`;
        }
        htmlContent += `</ul>`;
    }
    
    let mailOptions = {
        from: `"MURScrap Bot" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER, // sends to self
        subject: TEST_MODE ? `[MURScrap TEST] Trovati ${newBandi.length} bandi` : `[MURScrap] Trovati ${newBandi.length} nuovi bandi per 08/CEAR-08`,
        html: htmlContent
    };
    
    console.log("Invio email in corso...");
    let info = await transporter.sendMail(mailOptions);
    console.log("Email inviata: " + info.response);
}

async function main() {
    console.log("Starting MURScrap spider...");
    const allBandi = await fetchBandi();
    console.log(`Fetched a total of ${allBandi.length} raw results.`);
    
    const matchedBandi = filterBandi(allBandi);
    console.log(`Found ${matchedBandi.length} results matching criteria.`);
    
    if (matchedBandi.length === 0) {
        console.log("Nessun bando trovato. Esco.");
        return;
    }
    
    const history = loadHistory();
    const newBandi = matchedBandi.filter(b => !history.includes(b.id));
    
    console.log(`${newBandi.length} sono nuovi rispetto allo storico.`);
    
    if (newBandi.length > 0) {
        if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
            console.warn("GMAIL_USER e GMAIL_PASS non configurati nel file .env! Salto l'invio email e non aggiorno la history.");
            console.log("New Bandi:", newBandi.map(b => b.title));
        } else {
            try {
                await sendEmail(newBandi);
                // Update history
                const updatedHistory = [...history, ...newBandi.map(b => b.id)];
                saveHistory(updatedHistory);
                console.log("History aggiornata.");
            } catch (err) {
                console.error("Errore nell'invio della email:", err);
            }
        }
    } else {
        console.log("Nessuna email da inviare.");
    }
}

main();
