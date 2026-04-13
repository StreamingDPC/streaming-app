require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const FIREBASE_DB_URL = "https://streamingdpc-7e7fa-default-rtdb.firebaseio.com";

/**
 * Intenta obtener el código de 4 dígitos desde una URL de Netflix
 */
async function getCodeFromNetflixUrl(url) {
    try {
        console.log("Visitando URL de Netflix:", url);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        const pageText = $('body').text();
        const codeMatch = pageText.match(/\b\d{4}\b/);
        
        if (codeMatch) {
            console.log("Código encontrado en la web:", codeMatch[0]);
            return codeMatch[0];
        }
    } catch (error) {
        console.error("Error al visitar la URL de Netflix:", error.message);
    }
    return null;
}

app.post('/api/get-code', async (req, res) => {
    const { email, platform } = req.body;

    if (!email || !platform) {
        return res.status(400).json({ error: 'Email y plataforma son requeridos.' });
    }

    try {
        console.log("Consultando cuentas de correo en Firebase...");
        const dbResponse = await axios.get(`${FIREBASE_DB_URL}/emailAccounts.json`);
        const accountsData = dbResponse.data;

        if (!accountsData) {
            return res.status(404).json({ success: false, error: 'No hay cuentas de correo configuradas.' });
        }

        const accounts = Object.values(accountsData).filter(a => a && a.email && a.password);
        let foundCode = null;

        console.log(`Iniciando búsqueda en ${accounts.length} cuentas configuradas...`);

        // 2. Probar con cada cuenta (Secuencial para evitar bloqueos de IP y saturación)
        for (const account of accounts) {
            console.log(`Checando cuenta: ${account.email}...`);
            
            const imapConfig = {
                imap: {
                    user: account.email,
                    password: account.password,
                    host: account.email.includes('gmail.com') ? 'imap.gmail.com' : 'imap.titan.email',
                    port: 993,
                    tls: true,
                    authTimeout: 8000,
                    tlsOptions: { rejectUnauthorized: false }
                }
            };

            let connection = null;
            try {
                connection = await imaps.connect(imapConfig);
                
                // Prioridad 1: Siempre intentar INBOX primero (es lo más común)
                await connection.openBox('INBOX');
                
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const imapDate = `${yesterday.getDate()}-${monthNames[yesterday.getMonth()]}-${yesterday.getFullYear()}`;

                const searchCriteria = [['SINCE', imapDate]];
                
                if (platform === 'netflix') {
                    searchCriteria.push(['OR', ['FROM', 'netflix.com'], ['SUBJECT', 'Netflix']]);
                } else if (platform === 'disney') {
                    searchCriteria.push(['OR', ['FROM', 'disney'], ['SUBJECT', 'Disney']]);
                }

                let messages = await connection.search(searchCriteria, { bodies: ['HEADER', 'TEXT'], markSeen: false });

                // Prioridad 2: Si no hay nada en INBOX y es Gmail, probar en "All Mail" o "Todos"
                if (messages.length === 0 && account.email.includes('gmail.com')) {
                    console.log("Nada en INBOX, probando en All Mail...");
                    const boxes = await connection.getBoxes();
                    const gmailBox = boxes['[Gmail]'] || boxes['[gmail]'];
                    let folderToOpen = null;
                    if (gmailBox && gmailBox.children) {
                        if (gmailBox.children['All Mail']) folderToOpen = '[Gmail]/All Mail';
                        else if (gmailBox.children['Todos']) folderToOpen = '[Gmail]/Todos';
                    }
                    if (folderToOpen) {
                        await connection.openBox(folderToOpen);
                        messages = await connection.search(searchCriteria, { bodies: ['HEADER', 'TEXT'], markSeen: false });
                    }
                }

                for (let i = messages.length - 1; i >= 0; i--) {
                    const item = messages[i];
                    const all = item.parts.find(a => a.which === 'TEXT');
                    const parsed = await simpleParser(all.body);
                    const subject = (parsed.subject || "").toLowerCase();
                    const textContent = (parsed.text || "").toLowerCase();
                    const htmlContent = parsed.html || "";
                    const recipientText = (parsed.to && parsed.to.text) ? parsed.to.text.toLowerCase() : "";
                    const fromText = parsed.from ? parsed.from.text.toLowerCase() : "";

                    const isFromPlatform = subject.includes(platform) || fromText.includes(platform);
                    const mentionsEmail = textContent.includes(email.toLowerCase()) || 
                                         recipientText.includes(email.toLowerCase()) || 
                                         htmlContent.toLowerCase().includes(email.toLowerCase());

                    if (isFromPlatform || mentionsEmail) {
                        if (platform === 'netflix') {
                            const codeMatch = textContent.match(/\b\d{4}\b/);
                            if (codeMatch && (textContent.includes('código') || textContent.includes('access') || subject.includes('netflix'))) {
                                foundCode = codeMatch[0];
                            } else {
                                const $ = cheerio.load(htmlContent);
                                const links = [];
                                $('a').each((j, el) => {
                                    const href = $(el).attr('href');
                                    if (href && href.includes('netflix.com')) links.push(href);
                                });

                                for (const link of links) {
                                    if (link.includes('verify') || link.includes('token') || link.includes('travel') || link.includes('update-primary-location')) {
                                        const code = await getCodeFromNetflixUrl(link);
                                        if (code) {
                                            foundCode = code;
                                            break;
                                        }
                                    }
                                }
                            }
                        } else if (platform === 'disney') {
                            const codeMatch = textContent.match(/\b\d{6}\b/);
                            if (codeMatch) {
                                foundCode = codeMatch[0];
                            }
                        }
                    }
                    if (foundCode) break;
                }
                connection.end();
            } catch (err) {
                if (connection) connection.end();
                console.error(`Error en cuenta ${account.email}:`, err.message);
            }
            if (foundCode) break;
        }

        if (foundCode) {
            return res.json({ success: true, code: foundCode });
        } else {
            return res.status(404).json({ success: false, error: 'Código no encontrado en ninguna cuenta vinculada.' });
        }

    } catch (err) {
        console.error("General Backend Error:", err);
        return res.status(500).json({ success: false, error: 'Error del servidor. Por favor reintenta en un momento.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servicio Backend ejecutándose en el puerto ${PORT}`);
});
