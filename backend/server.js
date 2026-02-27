require('dotenv').config();
const express = require('express');
const cors = require('cors');
const imaps = require('imap-simple');
const simpleParser = require('mailparser').simpleParser;

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
            const textToSearch = (parsed.text || parsed.html || "").toLowerCase();

            // Verificar que el correo menciona el email del cliente (esto asume que netflix/disney manda al correo respectivo y este es reenviado a titan)
            if (textToSearch.includes(email.toLowerCase()) || parsed.subject.toLowerCase().includes(email.toLowerCase())) {

                if (platform === 'netflix') {
                    // Buscar un patrón de 4 números típico de código de actualización (modificar según el correo real)
                    const codeMatch = textToSearch.match(/\b\d{4}\b/);
                    if (codeMatch) {
                        foundCode = codeMatch[0];
                        break;
                    }
                } else if (platform === 'disney') {
                    // Buscar un patrón típico de Disney (6 números)
                    const codeMatch = textToSearch.match(/\b\d{6}\b/);
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
