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
            console.log(`\n[BOT-QUEUE] ⏳ Procesando turno: ${item.email} (Quedan en cola: ${activationQueue.length - 1})`);
            const result = await doActivateTv(item.email, item.tvCode);
            item.resolve(result);
        } catch (err) {
            item.reject(err);
        } finally {
            activationQueue.shift(); // Remover el completado
        }
    }

    isProcessingQueue = false;
}

// ── ENDPOINT PRINCIPAL: Activar TV (Pasa por la cola ordenada) ──────────────
app.post('/api/activate-tv', async (req, res) => {
    const { email, tvCode } = req.body;

    if (!email || !tvCode) {
        return res.status(400).json({ success: false, error: 'Email y código de TV son requeridos.' });
    }

    // Colocar en la cola de espera para evitar colisiones
    const queuePromise = new Promise((resolve, reject) => {
        activationQueue.push({ email, tvCode, resolve, reject, time: Date.now() });
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

        // 3. Verificar si Netflix ya tiene una sesión activa abierta (Evita fallos y ahorra tiempo)
        console.log('[BOT] 🌐 Verificando estado de sesión en netflix.com/tv8...');
        await page.goto('https://www.netflix.com/tv8', { waitUntil: 'networkidle2', timeout: 25000 });
        await sleep(1500);

        let currentUrl = page.url();
        console.log(`[BOT] 🔗 URL detectada: ${currentUrl}`);

        let alreadyLoggedIn = false;
        if (currentUrl.includes('/tv8')) {
            const tvInputCheck = await page.$('input[type="text"], input[type="tel"], input[type="number"], input');
            if (tvInputCheck) {
                console.log('[BOT] 🚀 ¡Sesión ya activa en Netflix! Saltando login para activar la TV de inmediato.');
                alreadyLoggedIn = true;
            }
        }

        // Si NO está logueado, procedemos con el inicio de sesión
        if (!alreadyLoggedIn) {
            console.log('[BOT] 🌐 Sesión no activa. Navegando a netflix.com/login...');
            await page.goto('https://www.netflix.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(1500);
            currentUrl = page.url();

            // Si redirigió fuera de login (ej: /browse o /tv8)
            if (!currentUrl.includes('/login')) {
                console.log(`[BOT] ℹ️ Redirigido a ${currentUrl}. Verificando acceso a TV...`);
                await page.goto('https://www.netflix.com/tv8', { waitUntil: 'networkidle2', timeout: 20000 });
                await sleep(1500);
                if (page.url().includes('/tv8')) {
                    alreadyLoggedIn = true;
                }
            }

            if (!alreadyLoggedIn) {
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
                    // Si no hay input de email, verificar si estamos en tv8 o browse
                    if (page.url().includes('/tv8') || page.url().includes('/browse')) {
                        console.log('[BOT] 🚀 Redirigido automáticamente a sesión activa.');
                        alreadyLoggedIn = true;
                    } else {
                        const ss = await page.screenshot({ encoding: 'base64' });
                        await browser.close();
                        return {
                            success: false,
                            error: `Netflix no mostró el campo de correo en ${page.url()}.`,
                            screenshot: `data:image/png;base64,${ss}`
                        };
                    }
                }

                if (!alreadyLoggedIn && emailInput) {
                    await sleep(500);
                    await emailInput.click({ clickCount: 3 });
                    await emailInput.type(email, { delay: 90 });
                    console.log('[BOT] ✉️  Email escrito');

                    // 5. Presionar Enter para avanzar
                    console.log('[BOT] 🔄 Presionando Enter para continuar...');
                    await sleep(800);
                    await page.keyboard.press('Enter');
                    console.log('[BOT] ⏳ Esperando pantalla de código de Netflix...');
                    await sleep(5000);

                    // 6. Leer código de inicio de sesión OTP enviado al correo
                    console.log('[BOT] 📨 Solicitando al backend el código de acceso...');
                    let loginCode = null;
                    const BACKEND_URL = 'https://streaming-backend-ce1u.onrender.com';

                    for (let attempt = 1; attempt <= 6; attempt++) {
                        try {
                            console.log(`[BOT] 🔍 Intento ${attempt}/6 de lectura del correo...`);
                            const codeResp = await axios.post(`${BACKEND_URL}/api/get-code`, {
                                email: email,
                                platform: 'logincode'
                            }, { timeout: 15000 });

                            if (codeResp.data && codeResp.data.code) {
                                loginCode = codeResp.data.code.toString().replace(/\D/g, '').substring(0, 4);
                                console.log(`[BOT] ✅ Código recibido: ${loginCode}`);
                                break;
                            }
                        } catch (e) {
                            console.log(`[BOT] ⚠️  Intento ${attempt} falló: ${e.message}`);
                        }
                        if (attempt < 6) {
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
                    console.log(`[BOT] ⌨️  Escribiendo código de acceso: ${loginCode}`);
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

                    const afterLoginUrl = page.url();
                    console.log(`[BOT] 🔗 URL tras login: ${afterLoginUrl}`);

                    if (afterLoginUrl.includes('/login')) {
                        const errText = await page.evaluate(() => document.body.innerText.substring(0, 200));
                        const ss = await page.screenshot({ encoding: 'base64' });
                        await browser.close();
                        return {
                            success: false,
                            error: `Netflix rechazó el código: "${errText}"`,
                            screenshot: `data:image/png;base64,${ss}`
                        };
                    }
                }
            }
        }

        // 9. Asegurar que estamos en netflix.com/tv8
        if (!page.url().includes('/tv8')) {
            console.log('[BOT] 📺 Navegando a netflix.com/tv8...');
            await page.goto('https://www.netflix.com/tv8', { waitUntil: 'networkidle2', timeout: 20000 });
            await sleep(2000);
        }

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

// ── FUNCIÓN: Activar ViX usando Chrome local visible ────────────────────────
async function doActivateVix(email, vixLink) {
    console.log(`\n[VIX-BOT] 🚀 Iniciando activación de ViX para ${email}...`);
    console.log(`[VIX-BOT] 🔗 Enlace: ${vixLink}`);

    const chromePath = getChromePath();
    if (!chromePath) {
        return { success: false, error: 'Google Chrome no está instalado en esta PC.' };
    }

    let browser = null;
    const userDataDir = path.join(__dirname, '.vix-profile');
    try {
        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: false,
            userDataDir: userDataDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-position=50,50',
                '--window-size=1024,768'
            ]
        });

        const page = await browser.newPage();

        // Usar User-Agent de escritorio real para que ViX complete la sesión web en lugar de colgarse esperando la app de iOS
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1024, height: 768 });

        // Ocultar webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        });

        console.log('[VIX-BOT] 🌐 Abriendo enlace de inicio de sesión de ViX en Chrome...');
        await page.goto(vixLink, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await sleep(1500);

        // 2. Si aparece el desafío "Press & Hold", resolverlo con jitter humano continuo
        for (let attempt = 0; attempt < 4; attempt++) {
            const hasCaptcha = await page.evaluate(() => {
                const txt = (document.body ? document.body.innerText : '') || '';
                return txt.includes('Press & Hold') || txt.includes('Press and Hold') || !!document.querySelector('#px-captcha');
            });

            if (hasCaptcha) {
                console.log(`[VIX-BOT] 🛡️ [Intento ${attempt + 1}/4] Detectado "Press & Hold". Manteniendo presionado...`);
                console.log('[VIX-BOT] 💡 Puedes mantener presionado el botón azul con tu propio mouse si deseas acelerarlo.');
                let box = null;
                const captchaEl = await page.$('#px-captcha, #px-captcha-wrapper, [aria-label*="Press & Hold"]');
                if (captchaEl) {
                    box = await captchaEl.boundingBox();
                }
                if (!box) {
                    box = await page.evaluate(() => {
                        const all = Array.from(document.querySelectorAll('div, button, a'));
                        for (const el of all) {
                            if (el.innerText && el.innerText.includes('Press & Hold')) {
                                const r = el.getBoundingClientRect();
                                return { x: r.x, y: r.y, width: r.width, height: r.height };
                            }
                        }
                        return null;
                    });
                }

                if (box) {
                    const clickX = box.x + box.width / 2;
                    const clickY = box.y + box.height / 2;
                    console.log(`[VIX-BOT] 🖱️ Manteniendo presionado en (${Math.round(clickX)}, ${Math.round(clickY)}) durante 14 segundos para llenar el círculo...`);
                    await page.mouse.move(clickX, clickY);
                    await page.mouse.down();

                    const holdStart = Date.now();
                    while (Date.now() - holdStart < 14000) {
                        const jitterX = clickX + (Math.random() - 0.5) * 4;
                        const jitterY = clickY + (Math.random() - 0.5) * 4;
                        await page.mouse.move(jitterX, jitterY);
                        await sleep(65 + Math.random() * 45);

                        // Si la página ya cambió y validó el captcha, soltar de inmediato
                        const clearedEarly = await page.evaluate(() => {
                            const t = (document.body ? document.body.innerText : '') || '';
                            return t.includes('exitoso') || t.includes('Entendido') || !t.includes('Press & Hold');
                        });
                        if (clearedEarly) {
                            console.log('[VIX-BOT] 🚀 ¡Validación completada anticipadamente!');
                            break;
                        }
                    }
                    await page.mouse.up();
                    console.log('[VIX-BOT] ⏳ Soltado. Verificando si el círculo naranja completó el acceso...');
                    await sleep(3500);
                } else {
                    await sleep(2000);
                }
            } else {
                break;
            }
        }

        // 3. Esperar y hacer clic en el botón naranja "Entendido" (¡Inicio de sesión exitoso!)
        console.log('[VIX-BOT] 🔍 Buscando botón naranja "Entendido"...');
        let clickedBtn = null;
        for (let i = 0; i < 45; i++) {
            // Guardar screenshot para diagnóstico
            try {
                await page.screenshot({ path: 'vix_debug.png' });
            } catch (e) { }

            const pageInfo = await page.evaluate(() => {
                const txt = (document.body ? document.body.innerText : '') || '';
                const btns = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
                let found = null;
                for (const b of btns) {
                    const t = (b.innerText || b.textContent || '').trim().toLowerCase();
                    if (t === 'entendido' || t === 'continuar' || t === 'aceptar' || t.includes('entendido')) {
                        b.click();
                        found = (b.innerText || b.textContent || '').trim();
                        break;
                    }
                }
                const isSuccessPage = txt.includes('exitoso') || txt.includes('Vuelve a tu dispositivo') || txt.includes('disfrutar lo mejor de ViX');
                return { found, isSuccessPage, textPreview: txt.substring(0, 150) };
            });

            if (pageInfo.found || pageInfo.isSuccessPage) {
                clickedBtn = pageInfo.found || 'Pantalla de éxito ViX';
                console.log(`[VIX-BOT] ✅ ¡Confirmación detectada: "${clickedBtn}"!`);
                break;
            } else {
                if (i % 5 === 0) {
                    console.log(`[VIX-BOT] [${i + 1}/45] Esperando "Entendido"... En pantalla: "${pageInfo.textPreview.replace(/\n+/g, ' ')}"`);
                }
            }
            await sleep(1000);
        }

        const currentUrl = page.url();
        console.log(`[VIX-BOT] 🏁 URL final: ${currentUrl}`);

        if (clickedBtn) {
            // Esperar 4 segundos para que ViX propague el inicio de sesión a la app móvil
            await sleep(4000);
            await browser.close();
            browser = null;
            console.log('[VIX-BOT] 🎉 ¡Activación de ViX completada con éxito!');
            return { success: true, message: '¡Dispositivo ViX activado con éxito en Chrome local!' };
        } else {
            console.warn('[VIX-BOT] ⚠️ No se detectó "Entendido" automáticamente. Manteniendo ventana 15 seg para inspección...');
            await sleep(15000);
            await browser.close();
            browser = null;
            return { success: false, error: 'No se completó la confirmación de ViX en pantalla. Revisa si el enlace ya había caducado.' };
        }
    } catch (err) {
        console.error('[VIX-BOT] ❌ Error en ViX:', err.message);
        if (browser) {
            try { await browser.close(); } catch (e) { }
        }
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

