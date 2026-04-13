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
        console.log(`[DEBUG] Nueva solicitud: ${email} para ${platform}`);
        
        // 1. Obtener cuentas
        const dbResponse = await axios.get(`${FIREBASE_DB_URL}/emailAccounts.json`);
        const accountsData = dbResponse.data;

        if (!accountsData) {
            console.log("[DEBUG] No hay cuentas en Firebase");
            return res.status(404).json({ success: false, error: 'No hay cuentas de correo configuradas en Firebase.' });
        }

        const accounts = Object.values(accountsData).filter(a => a && a.email && a.password);
        let foundCode = null;

        console.log(`[DEBUG] Procesando ${accounts.length} cuentas...`);

        for (const account of accounts) {
            console.log(`[DEBUG] Conectando a ${account.email}...`);
            
            const imapConfig = {
                imap: {
                    user: account.email,
                    password: account.password,
                    host: account.email.includes('gmail.com') ? 'imap.gmail.com' : 'imap.titan.email',
                    port: 993,
                    tls: true,
                    authTimeout: 10000,
                    tlsOptions: { rejectUnauthorized: false }
                }
            };

            let connection = null;
            try {
                connection = await imaps.connect(imapConfig);
                await connection.openBox('INBOX');
                
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const imapDate = `${yesterday.getDate()}-${monthNames[yesterday.getMonth()]}-${yesterday.getFullYear()}`;

                const searchCriteria = [['SINCE', imapDate]];
                
                // Filtro optimizado
                const platformLower = platform.toLowerCase();
                if (platformLower.includes('netflix')) {
                    searchCriteria.push(['OR', ['FROM', 'netflix.com'], ['SUBJECT', 'Netflix']]);
                } else if (platformLower.includes('disney')) {
                    searchCriteria.push(['OR', ['FROM', 'disney'], ['SUBJECT', 'Disney']]);
                }

                let messages = await connection.search(searchCriteria, { bodies: ['HEADER', 'TEXT'], markSeen: false });

                // Fallback para Gmail: All Mail
                if (messages.length === 0 && account.email.includes('gmail.com')) {
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

                console.log(`[DEBUG] ${messages.length} mensajes en ${account.email}`);

                for (let i = messages.length - 1; i >= 0; i--) {
                    const item = messages[i];
                    const all = item.parts.find(a => a.which === 'TEXT');
                    const parsed = await simpleParser(all.body);
                    
                    const subject = (parsed.subject || "").toLowerCase();
                    const textContent = (parsed.text || "").toLowerCase();
                    const htmlContent = parsed.html || "";
                    const fromText = (parsed.from && parsed.from.text) ? parsed.from.text.toLowerCase() : "";
                    const recipientText = (parsed.to && parsed.to.text) ? parsed.to.text.toLowerCase() : "";
                    const targetEmail = email.toLowerCase();

                    const isFromPlatform = subject.includes(platformLower) || fromText.includes(platformLower);
                    const mentionsEmail = textContent.includes(targetEmail) || 
                                         recipientText.includes(targetEmail) || 
                                         htmlContent.toLowerCase().includes(targetEmail);

                    if (isFromPlatform || mentionsEmail) {
                        console.log(`[DEBUG] ¡Match! Subject: ${parsed.subject}`);
                        if (platformLower.includes('netflix')) {
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
                        } else if (platformLower.includes('disney')) {
                            const codeMatch = textContent.match(/\b\d{6}\b/);
                            if (codeMatch) {
                                foundCode = codeMatch[0];
                            }
                        }
                    }
                    if (foundCode) break;
                }
            } catch (innerErr) {
                console.error(`[DEBUG] Error en ${account.email}:`, innerErr.message);
            } finally {
                if (connection) connection.end();
            }
            if (foundCode) break;
        }

        if (foundCode) {
            console.log(`[DEBUG] ÉXITO: Código ${foundCode}`);
            return res.json({ success: true, code: foundCode });
        } else {
            return res.status(404).json({ success: false, error: 'Código no encontrado. Revisa si el correo ya llegó o si faltan cuentas por vincular.' });
        }

    } catch (err) {
        console.error("General Backend Error:", err);
        // Devolvemos el error real para diagnóstico temporal del usuario
        return res.status(500).json({ success: false, error: err.message || 'Error desconocido del servidor.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servicio Backend ejecutándose en el puerto ${PORT}`);
});
