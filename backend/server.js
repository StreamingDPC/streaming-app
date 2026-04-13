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

// Configuración de tu Titan Email (HostGator)
const imapConfig = {
    imap: {
        user: process.env.EMAIL_USER, // Ej: soporte@tudominio.com
        password: process.env.EMAIL_PASSWORD,
        host: 'imap.titan.email',
        port: 993,
        tls: true,
        authTimeout: 3000
    }
};

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
        
        // El código suele estar en un contenedor prominente o texto directo.
        // Buscamos patrones de 4 dígitos en todo el texto de la página.
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
        const connection = await imaps.connect(imapConfig);
        await connection.openBox('INBOX');

        // Buscar correos de las últimas 24 horas dirigidos o reenviados
        const delay = 24 * 3600 * 1000;
        const yesterday = new Date();
        yesterday.setTime(Date.now() - delay);

        const searchCriteria = [
            ['SINCE', yesterday.toISOString()]
        ];

        // Añadimos filtro base por plataforma
        if (platform === 'netflix') {
            searchCriteria.push(['OR', ['FROM', 'netflix.com'], ['SUBJECT', 'Hogar']]);
        } else if (platform === 'disney') {
            searchCriteria.push(['OR', ['FROM', 'disneyplus.com'], ['SUBJECT', 'código']]);
        }

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false
        };

        const messages = await connection.search(searchCriteria, fetchOptions);

        let foundCode = null;

        // Iteramos los mensajes (Del mas reciente al mas antiguo)
        for (let i = messages.length - 1; i >= 0; i--) {
            const item = messages[i];
            const all = item.parts.find(a => a.which === 'TEXT');
            const parsed = await simpleParser(all.body);
            const textContent = (parsed.text || "").toLowerCase();
            const htmlContent = parsed.html || "";

            // Verificar que el correo menciona el email del cliente
            if (textContent.includes(email.toLowerCase()) || htmlContent.toLowerCase().includes(email.toLowerCase()) || parsed.subject.toLowerCase().includes(email.toLowerCase())) {

                if (platform === 'netflix') {
                    // 1. Intentar buscar código directo de 4 números en el texto
                    const codeMatch = textContent.match(/\b\d{4}\b/);
                    if (codeMatch) {
                        foundCode = codeMatch[0];
                        break;
                    }

                    // 2. Si no hay código directo, buscar links de verificación (Nueva Regla Netflix)
                    const $ = cheerio.load(htmlContent);
                    const links = [];
                    $('a').each((i, el) => {
                        const href = $(el).attr('href');
                        if (href && href.includes('netflix.com')) {
                            links.push(href);
                        }
                    });

                    // Buscamos en los links encontrados (especialmente los que tienen tokens largos o palabras clave como 'verify' o 'travel')
                    for (const link of links) {
                        if (link.includes('verify') || link.includes('token') || link.includes('travel')) {
                            const codeFromWeb = await getCodeFromNetflixUrl(link);
                            if (codeFromWeb) {
                                foundCode = codeFromWeb;
                                break;
                            }
                        }
                    }
                    
                    if (foundCode) break;

                } else if (platform === 'disney') {
                    // Buscar un patrón típico de Disney (6 números)
                    const codeMatch = textContent.match(/\b\d{6}\b/);
                    if (codeMatch) {
                        foundCode = codeMatch[0];
                        break;
                    }
                }
            }
        }

        connection.end();

        if (foundCode) {
            return res.json({ success: true, code: foundCode });
        } else {
            return res.status(404).json({ success: false, error: 'Código no encontrado para este correo.' });
        }

    } catch (err) {
        console.error("IMAP Error:", err);
        return res.status(500).json({ success: false, error: 'Error del servidor al buscar en los correos.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servicio Backend ejecutándose en el puerto ${PORT}`);
});
