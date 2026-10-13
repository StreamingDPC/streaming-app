/**
 * =====================================================================
 *  🤖 StreamingDPC — Bot Local de Activación de TV (IP Residencial)
 * =====================================================================
 *  ▸ Corre en tu PC, con tu IP de casa → Netflix no lo bloquea.
 *  ▸ Escucha en http://localhost:3099
 *  ▸ La contraseña se lee de Firebase y NUNCA se muestra al cliente ni al vendedor.
 *
 *  INSTALACIÓN (una sola vez):
 *    1. Abre una terminal (CMD o PowerShell) en esta carpeta
 *    2. Ejecuta:  npm install
 *    3. Ejecuta:  node local-bot.js
 *    4. Deja la ventana abierta mientras uses la app
 *
 *  Para que arranque automáticamente con Windows:
 *    Crea un acceso directo a este archivo en:
 *    C:\Users\TU_USUARIO\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
 * =====================================================================
 */

require('dotenv').config();
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

// ── Puppeteer con Stealth (usa Chrome instalado en tu PC) ──────────────────
const { addExtra } = require('puppeteer-extra');
const puppeteerCore = require('puppeteer-core');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ── Encontrar Chrome instalado automáticamente ─────────────────────────────
const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.CHROME_PATH || ''
].filter(Boolean);

function getChromePath() {
    const fs = require('fs');
    for (const p of chromePaths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// ── Firebase ───────────────────────────────────────────────────────────────
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://streamingdpc-7e7fa-default-rtdb.firebaseio.com';

// ── Servidor Express ───────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = 3099;

// ── Health check ───────────────────────────────────────────────────────────
app.get('/status', (req, res) => {
    res.json({ online: true, source: 'local-bot', time: new Date().toISOString() });
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Al arrancar: registrar y mantener URL pública de ngrok en Firebase ──────
let currentRegisteredNgrokUrl = null;

async function registerNgrokUrl() {
    try {
        const resp = await axios.get('http://localhost:4040/api/tunnels', { timeout: 3000 });
        const tunnels = resp.data && resp.data.tunnels;
        if (tunnels && tunnels.length > 0) {
            const https = tunnels.find(t => t.proto === 'https') || tunnels[0];
            const publicUrl = https.public_url;
            if (publicUrl && publicUrl !== currentRegisteredNgrokUrl) {
                await axios.put(`${FIREBASE_DB_URL}/config/botUrl.json`, JSON.stringify(publicUrl));
                currentRegisteredNgrokUrl = publicUrl;
                console.log(`[BOT] 🌐 URL pública ngrok registrada en Firebase: ${publicUrl}`);
                console.log(`[BOT] ✅ Clientes desde celular y redes externas listos para activar TV.`);
            }
            return publicUrl;
        }
    } catch (e) {
        // ngrok no disponible en este ciclo
    }
    return null;
}

// Mantener vivo y sincronizado el enlace de ngrok continuamente cada 15 segundos
setInterval(registerNgrokUrl, 15000);

// ── Al cerrar el bot: limpiar la URL de Firebase ───────────────────────────
async function clearBotUrl() {
    try {
        await axios.delete(`${FIREBASE_DB_URL}/config/botUrl.json`);
        console.log('[BOT] 🧹 URL pública eliminada de Firebase.');
    } catch (e) { /* silencioso */ }
}

// ── Función reutilizable: buscar contraseña de Netflix en Firebase ─────────
async function findNetflixPassword(targetEmail) {
    const email = targetEmail.toLowerCase().trim();

    // 1. Buscar en clientSales
    try {
        const resp = await axios.get(`${FIREBASE_DB_URL}/clientSales.json`);
        const data = resp.data;
        if (data) {
            for (const phone of Object.keys(data)) {
                const salesArr = Array.isArray(data[phone]) ? data[phone] : Object.values(data[phone]);
                for (const sale of salesArr) {
                    if (!sale?.items) continue;
                    const items = Array.isArray(sale.items) ? sale.items : Object.values(sale.items);
                    for (const item of items) {
                        if (!item?.specificEmails) continue;
                        const screens = Array.isArray(item.specificEmails) ? item.specificEmails : Object.values(item.specificEmails);
                        for (const s of screens) {
                            if (s?.email?.toLowerCase().trim() === email &&
                                s?.platform?.toLowerCase().includes('netflix') && s?.pass) {
                                console.log(`[BOT] ✅ Pass encontrado en clientSales (${phone})`);
                                return s.pass.trim();
                            }
                        }
                    }
                }
            }
        }
    } catch (e) { console.warn('[BOT] clientSales error:', e.message); }

    // 2. Buscar en sellerSales
    try {
        const resp = await axios.get(`${FIREBASE_DB_URL}/sellerSales.json`);
        const data = resp.data;
        if (data) {
            for (const seller of Object.keys(data)) {
                const salesArr = Array.isArray(data[seller]) ? data[seller] : Object.values(data[seller]);
                for (const sale of salesArr) {
                    if (!sale?.items) continue;
                    const items = Array.isArray(sale.items) ? sale.items : Object.values(sale.items);
                    for (const item of items) {
                        if (!item?.specificEmails) continue;
                        const screens = Array.isArray(item.specificEmails) ? item.specificEmails : Object.values(item.specificEmails);
                        for (const s of screens) {
                            if (s?.email?.toLowerCase().trim() === email &&
                                s?.platform?.toLowerCase().includes('netflix') && s?.pass) {
                                console.log(`[BOT] ✅ Pass encontrado en sellerSales (${seller})`);
                                return s.pass.trim();
                            }
                        }
                    }
                }
            }
        }
    } catch (e) { console.warn('[BOT] sellerSales error:', e.message); }

    return null;
}



// ── Cola de Activación Concurrente ─────────────────────────────────────────
const activationQueue = [];
let isProcessingQueue = false;

// Estado público de la cola
app.get('/api/queue-status', (req, res) => {
    const queueLength = activationQueue.length;
    const isBusy = isProcessingQueue;
    const estimatedSeconds = (queueLength + (isBusy ? 1 : 0)) * 32;
    res.json({
        success: true,
        isBusy,
        queueLength,
        estimatedSeconds
    });
});

// Función que procesa la cola elemento por elemento
async function processQueue() {
    if (isProcessingQueue || activationQueue.length === 0) return;
    isProcessingQueue = true;

    while (activationQueue.length > 0) {
        const item = activationQueue[0];
        try {
            if (item.platform === 'hbomax_tv') {
                console.log(`\n[BOT-QUEUE] ⏳ Procesando turno HBO Max TV: ${item.email} (Quedan en cola: ${activationQueue.length - 1})`);
                const result = await doActivateHboTv(item.email, item.tvCode);
                item.resolve(result);
            } else {
                console.log(`\n[BOT-QUEUE] ⏳ Procesando turno Netflix TV: ${item.email} (Quedan en cola: ${activationQueue.length - 1})`);
                const result = await doActivateTv(item.email, item.tvCode);
                item.resolve(result);
            }
        } catch (err) {
            item.reject(err);
        } finally {
            activationQueue.shift(); // Remover el completado
        }
    }

    isProcessingQueue = false;
}

// ── ENDPOINT PRINCIPAL: Activar Netflix TV (Pasa por la cola ordenada) ──────
app.post('/api/activate-tv', async (req, res) => {
    const { email, tvCode } = req.body;

    if (!email || !tvCode) {
        return res.status(400).json({ success: false, error: 'Email y código de TV son requeridos.' });
    }

    // Colocar en la cola de espera para evitar colisiones
    const queuePromise = new Promise((resolve, reject) => {
        activationQueue.push({ platform: 'netflix_tv', email, tvCode, resolve, reject, time: Date.now() });
    });

    // Iniciar procesamiento en background si no estaba corriendo
    processQueue();

    try {
        const result = await queuePromise;
        return res.json(result);
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message || 'Error en la activación del bot local.'
        });
    }
});

// ── ENDPOINT: Activar HBO Max TV ───────────────────────────────────────────
app.post('/api/activate-hbomax-tv', async (req, res) => {
    const { email, tvCode } = req.body;

    if (!email || !tvCode) {
        return res.status(400).json({ success: false, error: 'Email y código de TV son requeridos.' });
    }

    const queuePromise = new Promise((resolve, reject) => {
        activationQueue.push({ platform: 'hbomax_tv', email, tvCode, resolve, reject, time: Date.now() });
    });

    processQueue();

    try {
        const result = await queuePromise;
        return res.json(result);
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message || 'Error en la activación de HBO Max en el bot local.'
        });
    }
});

// ── LÓGICA DE ACTIVACIÓN CON CHROME (Segundo Plano) ────────────────────────
async function doActivateTv(email, tvCode) {
    let browser = null;
    try {
        console.log(`\n[BOT] ════════════════════════════════════`);
        console.log(`[BOT] Activando TV: ${email} → código: ${tvCode}`);

        // 1. Buscar contraseña
        const netflixPass = await findNetflixPassword(email);
        if (!netflixPass) {
            return {
                success: false,
                error: `No se encontró la contraseña de Netflix para ${email}. Verifica que esté en la configuración de pantallas de la venta.`
            };
        }
        console.log(`[BOT] 🔑 Contraseña lista (oculta). Iniciando Chrome en segundo plano...`);

        // 2. Lanzar Chrome local en segundo plano (fuera de la pantalla para no interrumpir al usuario)
        const chromePath = getChromePath();
        if (!chromePath) {
            return {
                success: false,
                error: 'Google Chrome no está instalado en esta PC. Instala Chrome e intenta de nuevo.'
            };
        }

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: false,  // false para que Netflix detecte navegación 100% humana y real
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--disable-backgrounding-occluded-windows',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--window-position=50,50', // Ventana visible en pantalla para supervisar el proceso
                '--window-size=1100,750'
            ]
        });

        const page = await browser.newPage();

        // Simular navegador real
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1280, height: 800 });

        // Ocultar webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 3. Iniciar sesión en Netflix (SIEMPRE primero ingresar con la cuenta requerida)
        console.log(`[BOT] 🌐 Navegando a netflix.com/login para iniciar sesión (${email})...`);
        await page.goto('https://www.netflix.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(1500);

        let currentUrl = page.url();
        console.log(`[BOT] 🔗 URL detectada: ${currentUrl}`);

        // 4. Escribir email (soporte para múltiples selectores de Netflix)
        const emailSelectors = [
            'input[name="userLoginId"]',
            'input[data-uia="login-field"]',
            'input[autocomplete="email"]',
            'input[type="email"]',
            'input[id*="userLoginId"]'
        ];

        let emailInput = null;
        for (const sel of emailSelectors) {
            emailInput = await page.$(sel);
            if (emailInput) break;
        }

        if (!emailInput) {
            try {
                await page.waitForSelector('input[name="userLoginId"], input[data-uia="login-field"], input[type="email"], input[type="text"]', { visible: true, timeout: 8000 });
                emailInput = await page.$('input[name="userLoginId"], input[data-uia="login-field"], input[type="email"], input[type="text"]');
            } catch (e) {
                console.log(`[BOT] ⚠️ Selector estándar de email no apareció en ${page.url()}`);
            }
        }

        if (!emailInput) {
            const ss = await page.screenshot({ encoding: 'base64' });
            await browser.close();
            return {
                success: false,
                error: `Netflix no mostró el campo de correo en ${page.url()}.`,
                screenshot: `data:image/png;base64,${ss}`
            };
        }

        await sleep(500);
        await emailInput.click({ clickCount: 3 });
        await emailInput.type(email, { delay: 90 });
        console.log(`[BOT] ✉️  Email escrito: ${email}`);

        // 5. Presionar Enter para avanzar
        console.log('[BOT] 🔄 Presionando Enter para continuar...');
        await sleep(800);
        await page.keyboard.press('Enter');
        console.log('[BOT] ⏳ Esperando pantalla de código o contraseña de Netflix...');
        await sleep(4000);

        // Detectar si Netflix pidió contraseña directamente o código OTP
        let passInput = await page.$('input[name="password"], input[type="password"]');
        let askedForPassword = false;
        if (passInput) {
            const box = await passInput.boundingBox();
            if (box && box.width > 0 && box.height > 0) {
                askedForPassword = true;
            }
        }

        if (askedForPassword && netflixPass) {
            console.log('[BOT] 🔒 Netflix solicitó contraseña. Escribiendo contraseña...');
            await passInput.click({ clickCount: 3 });
            await passInput.type(netflixPass.replace(/\s+/g, ''), { delay: 75 });
            await sleep(500);
            await page.keyboard.press('Enter');
            console.log('[BOT] ⏳ Esperando validación de contraseña...');
            await sleep(4000);
        } else {
            // 6. Leer código de inicio de sesión OTP (PIN) enviado al correo
            console.log('[BOT] 📨 Solicitando al backend el código de acceso (PIN)...');
            let loginCode = null;
            const BACKEND_URL = 'https://streaming-backend-ce1u.onrender.com';

            for (let attempt = 1; attempt <= 8; attempt++) {
                try {
                    console.log(`[BOT] 🔍 Intento ${attempt}/8 de lectura del correo...`);
                    const codeResp = await axios.post(`${BACKEND_URL}/api/get-code`, {
                        email: email,
                        platform: 'logincode'
                    }, { timeout: 15000 });

                    if (codeResp.data && codeResp.data.code) {
                        loginCode = codeResp.data.code.toString().replace(/\D/g, '').substring(0, 4);
                        console.log(`[BOT] ✅ Código (PIN) recibido: ${loginCode}`);
                        break;
                    }
                } catch (e) {
                    console.log(`[BOT] ⚠️  Intento ${attempt} falló: ${e.message}`);
                }
                if (attempt < 8) {
                    await sleep(5000);
                }
            }

            if (!loginCode) {
                const ss = await page.screenshot({ encoding: 'base64' });
                await browser.close();
                return {
                    success: false,
                    error: 'No se pudo leer el código de inicio de sesión del correo. Inténtalo de nuevo en 1 minuto.',
                    screenshot: `data:image/png;base64,${ss}`
                };
            }

            // 7. Escribir el código en los inputs
            console.log(`[BOT] ⌨️  Escribiendo código de acceso (PIN): ${loginCode}`);
            await sleep(1000);

            const codeInputs = await page.$$('input[type="text"], input[type="tel"], input[aria-label], input[autocomplete="one-time-code"], input:not([name])');
            if (codeInputs.length >= 4) {
                for (let i = 0; i < Math.min(4, loginCode.length); i++) {
                    await codeInputs[i].click();
                    await sleep(200);
                    await codeInputs[i].type(loginCode[i], { delay: 150 });
                }
            } else {
                await page.keyboard.type(loginCode, { delay: 200 });
            }

            console.log('[BOT] ⏳ Esperando validación del código...');
            await sleep(4000);
        }

        const afterLoginUrl = page.url();
        console.log(`[BOT] 🔗 URL tras login: ${afterLoginUrl}`);

        if (afterLoginUrl.includes('/login') && !afterLoginUrl.includes('/tv8')) {
            const errText = await page.evaluate(() => document.body.innerText.substring(0, 200));
            const ss = await page.screenshot({ encoding: 'base64' });
            await browser.close();
            return {
                success: false,
                error: `Netflix rechazó el acceso: "${errText}"`,
                screenshot: `data:image/png;base64,${ss}`
            };
        }

        // 8. Navegar a netflix.com/tv8 con sesión activa
        console.log('[BOT] 📺 Navegando a netflix.com/tv8 con sesión activa...');
        await page.goto('https://www.netflix.com/tv8', { waitUntil: 'networkidle2', timeout: 25000 });
        await sleep(2000);

        // 10. Ingresar el código de activación de TV (8 dígitos)
        const codeDigits = tvCode.replace(/[^0-9]/g, '');
        console.log(`[BOT] 🔢 Ingresando código de activación en TV: ${codeDigits}`);

        const singleInput = await page.$('input[type="text"], input[type="tel"], input[type="number"]');
        if (singleInput) {
            await singleInput.click({ clickCount: 3 });
            await singleInput.type(codeDigits, { delay: 100 });
        } else {
            const inputs = await page.$$('input');
            for (let i = 0; i < inputs.length && i < codeDigits.length; i++) {
                await inputs[i].click();
                await inputs[i].type(codeDigits[i], { delay: 80 });
            }
        }

        // 11. Confirmar activación
        console.log('[BOT] ✅ Confirmando activación...');
        await sleep(800);
        const submitBtn = await page.$('button[type="submit"], button.nf-btn-primary, button[data-uia="action-button"]');
        if (submitBtn) {
            await submitBtn.click();
        } else {
            await page.keyboard.press('Enter');
        }

        // 12. Esperar resultado
        await sleep(5000);
        const finalUrl = page.url();
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log(`[BOT] 🔗 URL final: ${finalUrl}`);

        // 13. Cierre y Limpieza de sesión
        console.log('[BOT] 🧹 Procediendo a limpiar sesión de Netflix...');
        try {
            // Limpieza a nivel de cookies del navegador
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');
            console.log('[BOT] 🧼 Cookies y caché limpiados vía CDP.');
        } catch (e) { }

        try {
            await page.goto('https://www.netflix.com/SignOut', { waitUntil: 'networkidle2', timeout: 10000 });
            await sleep(1500);
            await page.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('button, a'));
                for (let el of elements) {
                    const txt = (el.innerText || el.textContent || '').toLowerCase().trim();
                    if (txt === 'cerrar sesión' || txt === 'sign out' || txt.includes('cerrar sesion')) {
                        el.click();
                        break;
                    }
                }
            });
        } catch (e) { }

        await browser.close();
        browser = null;

        const isError = ['invalid', 'inválido', 'incorrect', 'incorrecto', 'expired', 'expirado', 'try again', 'vuelv'].some(
            kw => pageText.toLowerCase().includes(kw)
        );

        if (isError) {
            return { success: false, error: 'Código inválido o expirado. Obtén un nuevo código en tu TV.' };
        }

        if (finalUrl.includes('/login')) {
            console.log('[BOT] ❌ Error: Netflix redirigió a /login en vez de confirmar la TV.');
            return { success: false, error: 'Netflix no confirmó la vinculación de la TV (redirigió al inicio de sesión).' };
        }

        console.log('[BOT] 🎉 ¡Activación completada!');
        return { success: true, message: '¡TV activada exitosamente! Ya puedes disfrutar Netflix.' };

    } catch (err) {
        console.error('[BOT] ❌ Error:', err.message);

        let screenshot = null;
        if (browser) {
            try {
                const pages = await browser.pages();
                if (pages.length > 0) screenshot = await pages[0].screenshot({ encoding: 'base64' });
                await browser.close();
            } catch (e) { }
        }

        const payload = { success: false, error: 'Error del bot local: ' + err.message };
        if (screenshot) payload.screenshot = `data:image/png;base64,${screenshot}`;
        return payload;
    }
}

// ── FUNCIÓN: Activar HBO Max TV (auth.hbomax.com/link?flow=connectDeviceSignIn) ──
async function doActivateHboTv(email, tvCode) {
    let browser = null;
    let chromeProc = null;
    try {
        console.log(`\n[BOT-HBO] ════════════════════════════════════`);
        console.log(`[BOT-HBO] Activando HBO Max en TV: ${email} → código: ${tvCode}`);

        const chromePath = getChromePath();
        if (!chromePath) {
            return {
                success: false,
                error: 'Google Chrome no está instalado en esta PC. Instala Chrome e intenta de nuevo.'
            };
        }

        // Lanzar Chrome 100% real con perfil dedicado para evitar detección por Arkose / Feroot
        const cdpPort = 9338;
        const profileDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', '.gemini', 'hbo_bot_profile');

        console.log(`[BOT-HBO] 🚀 Iniciando Chrome genuino (CDP port ${cdpPort})...`);
        chromeProc = spawn(chromePath, [
            `--remote-debugging-port=${cdpPort}`,
            `--user-data-dir=${profileDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--window-position=50,50',
            '--window-size=1280,800',
            'about:blank'
        ]);

        let endpoint = null;
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            try {
                const resp = await axios.get(`http://127.0.0.1:${cdpPort}/json/version`);
                if (resp.data && resp.data.webSocketDebuggerUrl) {
                    endpoint = resp.data.webSocketDebuggerUrl;
                    break;
                }
            } catch (e) { }
        }

        if (!endpoint) {
            if (chromeProc) { try { chromeProc.kill(); } catch (e) { } }
            return { success: false, error: 'No se pudo iniciar Chrome para HBO Max.' };
        }

        browser = await puppeteer.connect({ browserWSEndpoint: endpoint });
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // 1. Navegar a auth.hbomax.com/link?flow=connectDeviceSignIn
        console.log('[BOT-HBO] 🌐 Navegando a auth.hbomax.com/link?flow=connectDeviceSignIn...');
        await page.goto('https://auth.hbomax.com/link?flow=connectDeviceSignIn', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await sleep(3500);

        // Aceptar banner de cookies si aparece
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const cBtn = btns.find(b => {
                const t = (b.innerText || '').toLowerCase();
                return t.includes('accept all') || t.includes('aceptar') || b.getAttribute('data-testid') === 'consent-modal-button-0';
            });
            if (cBtn) cBtn.click();
        });
        await sleep(1500);

        // 2. Ingresar código del televisor (6 caracteres)
        const cleanTvCode = tvCode.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
        console.log(`[BOT-HBO] 🔢 Escribiendo código de TV: ${cleanTvCode}`);

        const focusedTvCode = await page.evaluate(() => {
            function findInput(root) {
                const f0 = root.querySelector('#activationCode-field-0, [data-testid*="single_input_0"], input[type="text"]');
                if (f0) return f0;
                const all = Array.from(root.querySelectorAll('*'));
                for (const el of all) {
                    if (el.shadowRoot) {
                        const res = findInput(el.shadowRoot);
                        if (res) return res;
                    }
                }
                return null;
            }
            const inp = findInput(document);
            if (inp) {
                inp.focus();
                return true;
            }
            return false;
        });

        await page.keyboard.type(cleanTvCode, { delay: 120 });
        await sleep(800);

        // Clic en Siguiente / Next
        console.log('[BOT-HBO] ➡️ Clic en botón Siguiente...');
        const clickedNext = await page.evaluate(() => {
            function findBtn(root) {
                const btn = root.querySelector('button[type="submit"], [data-testid*="submit_button"]');
                if (btn) return btn;
                const all = Array.from(root.querySelectorAll('*'));
                for (const el of all) {
                    if (el.shadowRoot) {
                        const res = findBtn(el.shadowRoot);
                        if (res) return res;
                    }
                }
                return null;
            }
            const b = findBtn(document);
            if (b) {
                b.click();
                return true;
            }
            return false;
        });
        if (!clickedNext) {
            await page.keyboard.press('Enter');
        }
        await sleep(4000);

        // Verificar si el código no coincide o expiró
        const tvCodeError = await page.evaluate(() => {
            const txt = (document.body.innerText || '').toLowerCase();
            if (txt.includes("doesn't match") || txt.includes('no coincide') || txt.includes('inválido') || txt.includes('incorrecto') || txt.includes('must be at least')) {
                return true;
            }
            return false;
        });
        if (tvCodeError) {
            const ss = await page.screenshot({ encoding: 'base64' });
            await browser.disconnect();
            if (chromeProc) { try { chromeProc.kill(); } catch (e) { } }
            return {
                success: false,
                error: 'El código ingresado no coincide o expiró en tu TV. Genera un nuevo código en tu televisor e intenta nuevamente.',
                screenshot: `data:image/png;base64,${ss}`
            };
        }

        // 3. Ingresar el correo electrónico
        console.log(`[BOT-HBO] ✉️ Ingresando correo electrónico: ${email}`);
        let emailReady = false;
        for (let wait = 0; wait < 12; wait++) {
            emailReady = await page.evaluate(() => {
                function searchEmail(root) {
                    const inp = root.querySelector('#sign-in-phoneEmail-input, [data-testid*="phoneEmailInput"], input[type="email"], input[name="phoneEmail"]');
                    if (inp) return inp;
                    const all = Array.from(root.querySelectorAll('*'));
                    for (const el of all) {
                        if (el.shadowRoot) {
                            const res = searchEmail(el.shadowRoot);
                            if (res) return res;
                        }
                    }
                    return null;
                }
                const inp = searchEmail(document);
                if (inp) {
                    inp.focus();
                    return true;
                }
                return false;
            });
            if (emailReady) break;
            await sleep(1500);
        }

        if (!emailReady) {
            const ss = await page.screenshot({ encoding: 'base64' });
            await browser.disconnect();
            if (chromeProc) { try { chromeProc.kill(); } catch (e) { } }
            return {
                success: false,
                error: 'HBO Max no cargó el campo de correo electrónico.',
                screenshot: `data:image/png;base64,${ss}`
            };
        }

        await page.keyboard.type(email, { delay: 60 });
        await sleep(600);

        // Clic en Continuar
        console.log('[BOT-HBO] 🔄 Clic en Continuar correo...');
        const clickedContinue = await page.evaluate(() => {
            function searchContinue(root) {
                const btn = root.querySelector('button[data-testid="gisdk.gi-sign-in.continue_button"], button[type="submit"]');
                if (btn) return btn;
                const all = Array.from(root.querySelectorAll('*'));
                for (const el of all) {
                    if (el.shadowRoot) {
                        const res = searchContinue(el.shadowRoot);
                        if (res) return res;
                    }
                }
                return null;
            }
            const b = searchContinue(document);
            if (b) {
                b.click();
                return true;
            }
            return false;
        });
        if (!clickedContinue) {
            await page.keyboard.press('Enter');
        }

        // 4. Clic en "Obtener código de un solo uso"
        console.log('[BOT-HBO] 🔘 Esperando y buscando opción "Obtener código de un solo uso"...');
        let clickedOtpBtn = false;
        for (let wait = 0; wait < 18; wait++) {
            await sleep(1000);
            clickedOtpBtn = await page.evaluate(() => {
                function searchOtp(root) {
                    const btns = Array.from(root.querySelectorAll('button, a, [role="button"]'));
                    for (const b of btns) {
                        const txt = (b.innerText || b.textContent || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        if (txt.includes('obtener codigo de un solo uso') || txt.includes('un solo uso') || txt.includes('one-time code') || txt.includes('one time code')) {
                            b.click();
                            return true;
                        }
                    }
                    const all = Array.from(root.querySelectorAll('*'));
                    for (const el of all) {
                        if (el.shadowRoot) {
                            const res = searchOtp(el.shadowRoot);
                            if (res) return res;
                        }
                    }
                    return false;
                }
                return searchOtp(document);
            });
            if (clickedOtpBtn) {
                console.log('[BOT-HBO] ✅ Clic en "Obtener código de un solo uso" ejecutado.');
                break;
            }
        }

        if (!clickedOtpBtn) {
            const ss = await page.screenshot({ encoding: 'base64' });
            await browser.disconnect();
            if (chromeProc) { try { chromeProc.kill(); } catch (e) { } }
            return {
                success: false,
                error: 'No se encontró el botón "Obtener código de un solo uso" en HBO Max.',
                screenshot: `data:image/png;base64,${ss}`
            };
        }
        await sleep(3500);

        // 5. Leer código OTP (6 dígitos) enviado al correo
        console.log('[BOT-HBO] 📨 Solicitando al backend el código de acceso (6 dígitos)...');
        let loginCode = null;
        const BACKEND_URL = 'https://streaming-backend-ce1u.onrender.com';

        for (let attempt = 1; attempt <= 10; attempt++) {
            try {
                console.log(`[BOT-HBO] 🔍 Intento ${attempt}/10 de lectura del correo (${email})...`);
                const codeResp = await axios.post(`${BACKEND_URL}/api/get-code`, {
                    email: email,
                    platform: 'hbomax_tv'
                }, { timeout: 15000 });

                if (codeResp.data && codeResp.data.code) {
                    const raw = codeResp.data.code.toString().replace(/\D/g, '');
                    if (raw.length >= 6) {
                        loginCode = raw.substring(0, 6);
                        console.log(`[BOT-HBO] ✅ Código OTP recibido: ${loginCode}`);
                        break;
                    }
                }
            } catch (e) {
                console.log(`[BOT-HBO] ⚠️ Intento ${attempt} falló: ${e.message}`);
            }
            if (attempt < 10) {
                await sleep(5000);
            }
        }

        if (!loginCode) {
            const ss = await page.screenshot({ encoding: 'base64' });
            await browser.disconnect();
            if (chromeProc) { try { chromeProc.kill(); } catch (e) { } }
            return {
                success: false,
                error: 'No se pudo leer el código de acceso de HBO Max del correo. Inténtalo de nuevo en 1 minuto.',
                screenshot: `data:image/png;base64,${ss}`
            };
        }

        // 6. Escribir el código OTP en las 6 casillas
        console.log(`[BOT-HBO] ⌨️ Ingresando código OTP en las casillas: ${loginCode}`);
        await page.evaluate(() => {
            function searchOtpField(root) {
                const f0 = root.querySelector('#oneTimeCode-field-0, #activationCode-field-0, [data-testid*="single_input_0"], [data-testid*="oneTimeCode"], input[type="text"], input[type="tel"]');
                if (f0) return f0;
                const all = Array.from(root.querySelectorAll('*'));
                for (const el of all) {
                    if (el.shadowRoot) {
                        const res = searchOtpField(el.shadowRoot);
                        if (res) return res;
                    }
                }
                return null;
            }
            const inp = searchOtpField(document);
            if (inp) inp.focus();
        });
        await page.keyboard.type(loginCode, { delay: 120 });
        await sleep(800);

        // Clic en Enviar
        console.log('[BOT-HBO] 🚀 Clic en Enviar código OTP...');
        await page.evaluate(() => {
            function searchSubmit(root) {
                const btns = Array.from(root.querySelectorAll('button, input[type="submit"]'));
                for (const b of btns) {
                    const txt = (b.innerText || b.value || '').toLowerCase().trim();
                    if (txt === 'enviar' || txt === 'submit' || txt.includes('enviar')) {
                        b.click();
                        return true;
                    }
                }
                const all = Array.from(root.querySelectorAll('*'));
                for (const el of all) {
                    if (el.shadowRoot) {
                        const res = searchSubmit(el.shadowRoot);
                        if (res) return res;
                    }
                }
                return false;
            }
            return searchSubmit(document);
        });
        await sleep(5000);

        // 7. Esperar pantalla de confirmación ("¡Ya está todo listo!")
        console.log('[BOT-HBO] ⏳ Esperando confirmación de activación...');
        let confirmed = false;
        for (let wait = 0; wait < 6; wait++) {
            const pageText = await page.evaluate(() => (document.body.innerText || '').toLowerCase());
            if (pageText.includes('ya esta todo listo') || pageText.includes('ya está todo listo') ||
                pageText.includes('televisor se actualizara') || pageText.includes('todo listo') ||
                pageText.includes('all set') || pageText.includes('ready')) {
                confirmed = true;
                break;
            }
            await sleep(2000);
        }
        console.log(`[BOT-HBO] Estado: ${confirmed ? '¡Confirmado por HBO Max!' : 'Finalizado'}`);

        // 8. Cerrar sesión y limpiar cookies (como solicitado: "y quedo listo ahora cerrar sesion")
        console.log('[BOT-HBO] 🧹 Cerrando y limpiando sesión de HBO Max...');
        try {
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');
            console.log('[BOT-HBO] 🧼 Cookies y caché limpiados.');
        } catch (e) { }

        try {
            await page.goto('https://auth.hbomax.com/logout', { waitUntil: 'networkidle2', timeout: 8000 }).catch(() => { });
        } catch (e) { }

        await browser.disconnect();
        browser = null;
        if (chromeProc) {
            try { chromeProc.kill(); } catch (e) { }
            chromeProc = null;
        }

        console.log('[BOT-HBO] 🎉 ¡Activación de HBO Max TV completada con éxito!');
        return {
            success: true,
            message: '¡HBO Max activado con éxito en tu Smart TV! Tu televisor se actualizará automáticamente.'
        };

    } catch (err) {
        console.error('[BOT-HBO] ❌ Error:', err.message);

        let screenshot = null;
        if (browser) {
            try {
                const pages = await browser.pages();
                if (pages.length > 0) screenshot = await pages[0].screenshot({ encoding: 'base64' });
                await browser.disconnect();
            } catch (e) { }
        }
        if (chromeProc) {
            try { chromeProc.kill(); } catch (e) { }
        }

        const payload = { success: false, error: 'Error del bot de HBO Max: ' + err.message };
        if (screenshot) payload.screenshot = `data:image/png;base64,${screenshot}`;
        return payload;
    }
}

// ── FUNCIÓN: Activar ViX abriendo el enlace en Google Chrome real del sistema ──
async function doActivateVix(email, vixLink) {
    console.log(`\n[VIX-BOT] 🚀 Iniciando activación de ViX para ${email}...`);
    console.log(`[VIX-BOT] 🔗 Enlace: ${vixLink}`);

    const chromePath = getChromePath();
    if (!chromePath) {
        return { success: false, error: 'Google Chrome no está instalado en esta PC.' };
    }

    try {
        console.log('[VIX-BOT] 🌐 Abriendo enlace en Google Chrome real (sin banderas de bot ni automatización)...');

        // Abrir directamente en una nueva ventana de Chrome real del usuario.
        // Al no usar Puppeteer/CDP/webdriver, ViX NUNCA activa PerimeterX ni captchas,
        // carga authlink/approve inmediatamente y sincroniza la sesión en la app del celular.
        const chromeProc = spawn(chromePath, ['--new-window', vixLink], {
            detached: true,
            stdio: 'ignore'
        });
        chromeProc.unref();

        console.log('[VIX-BOT] ⏳ Esperando 8 segundos para que ViX procese el token y sincronice el celular...');
        await sleep(8000);

        // Cerrar automáticamente la ventana de ViX para que no quede abierta
        console.log('[VIX-BOT] 🚪 Cerrando ventana de ViX para mantener limpio tu escritorio...');
        try {
            const { exec } = require('child_process');
            const psCmd = `Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'ViX' } | ForEach-Object { $_.CloseMainWindow() }`;
            exec(`powershell -NoProfile -Command "${psCmd}"`);
        } catch (closeErr) {
            console.warn('[VIX-BOT] No se pudo cerrar la ventana automáticamente:', closeErr.message);
        }

        console.log('[VIX-BOT] 🎉 ¡Enlace ejecutado con éxito en Chrome! Dispositivo ViX activado.');
        return {
            success: true,
            message: '¡Dispositivo ViX activado con éxito en tu navegador Chrome!'
        };
    } catch (err) {
        console.error('[VIX-BOT] ❌ Error abriendo Chrome:', err.message);
        return { success: false, error: err.message };
    }
}

// ── ENDPOINT: Activar ViX desde el bot local ──────────────────────────────
app.post('/api/activate-vix', async (req, res) => {
    const { email, vixLink } = req.body;
    if (!vixLink) {
        return res.status(400).json({ success: false, error: 'vixLink es requerido.' });
    }
    const result = await doActivateVix(email, vixLink);
    return res.json(result);
});

// ── Iniciar servidor ───────────────────────────────────────────────────────
app.listen(PORT, async () => {
    const chromePath = getChromePath();
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   🤖  StreamingDPC — Bot Local de TV  ✅       ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║  Puerto: http://localhost:${PORT}                 ║`);
    console.log(`║  Chrome: ${chromePath ? '✅ ' + chromePath.substring(0, 35) + '...' : '❌ NO ENCONTRADO - Instala Chrome'}   ║`);
    console.log(`║  Firebase: ${FIREBASE_DB_URL.substring(0, 30)}...  ║`);
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║  Deja esta ventana abierta mientras usas la app ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    // Registrar URL pública de ngrok en Firebase (si ngrok está corriendo)
    await registerNgrokUrl();
});

// ── Limpiar URL de Firebase al cerrar ─────────────────────────────────────
process.on('SIGINT', async () => { await clearBotUrl(); process.exit(0); });
process.on('SIGTERM', async () => { await clearBotUrl(); process.exit(0); });
process.on('exit', () => { axios.delete(`${FIREBASE_DB_URL}/config/botUrl.json`).catch(() => { }); });

