/**
 * ============================================================================
 * 📊 Sincronizador Automático de Excel -> Firebase (Streaming DPC)
 * Archivo origen: "D:\Varios\Netflix\Netflix clientes.xlsx"
 * ============================================================================
 * - Lee las 11 pestañas: NO, DO, MO, PO, PA, C, V, I, Apple, Sp, Youtube
 * - Toma únicamente la contraseña ubicada al lado del email de la cuenta
 *   (ignora estrictamente Dl70112849dl@ / dl70112849).
 * - Actualiza clientProfiles, clientSales y sellerSales en Firebase.
 * - Modo vigilancia en vivo (--watch): detecta cada vez que guardas el Excel
 *   (Ctrl + G) y actualiza la base de datos de la página automáticamente.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('./backend/node_modules/xlsx');
const axios = require('./backend/node_modules/axios');

const EXCEL_FILE_PATH = process.env.EXCEL_CLIENTS_PATH || 'D:\\Varios\\Netflix\\Netflix clientes.xlsx';
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://streamingdpc-7e7fa-default-rtdb.firebaseio.com';

const SHEET_MAP = [
    { key: 'NO', platform: 'Netflix', matchKeys: ['netflix'] },
    { key: 'DO', platform: 'Disney+', matchKeys: ['disney'] },
    { key: 'MO', platform: 'Max (HBO)', matchKeys: ['max', 'hbo'] },
    { key: 'PO', platform: 'Prime Video', matchKeys: ['prime', 'amazon'] },
    { key: 'PA', platform: 'Paramount+', matchKeys: ['paramount'] },
    { key: 'C', platform: 'Crunchyroll', matchKeys: ['crunchy'] },
    { key: 'V', platform: 'Vix+', matchKeys: ['vix'] },
    { key: 'I', platform: 'IPTV', matchKeys: ['iptv', 'magis', 'flujo', 'tele'] },
    { key: 'Apple', platform: 'Apple TV+', matchKeys: ['apple'] },
    { key: 'Sp', platform: 'Spotify', matchKeys: ['spotify'] },
    { key: 'Youtube', platform: 'YouTube Premium', matchKeys: ['youtube'] }
];

const KNOWN_SELLERS_MAP = {
    'maac': 'Página Web Oficial',
    'ines': 'Aleni',
    'aleni': 'Aleni',
    'pedro': 'Pedro',
    'stefani': 'Stefani',
    'angie': 'Angie',
    'alex': 'Alex',
    'any': 'Any',
    'katherin': 'Katherin',
    'darwin': 'Darwin',
    'laura': 'Laura',
    'hector': 'Hector',
    'jessica': 'Jessica',
    'diana': 'Diana',
    'duay': 'Duay',
    'yenfri': 'Yenfri',
    'nelson': 'Nelson',
    'angel': 'Angel',
    'pablo': 'Pablo',
    'jorge': 'Jorge',
    'adriana': 'Adriana'
};

function sanitizePhone(val) {
    if (!val) return '';
    let c = val.toString().replace(/\D/g, '');
    if (c.length >= 12 && c.startsWith('57')) {
        c = c.substring(2);
    }
    return c;
}

function isForbiddenPassword(str) {
    if (!str) return true;
    const low = String(str).trim().toLowerCase();
    return low.startsWith('dl70112849') || low === 'libre' || low === 'noren' || low === 'original';
}

function normalizeSellerName(rawSeller) {
    if (!rawSeller) return 'Página Web Oficial';
    const clean = String(rawSeller).trim();
    const low = clean.toLowerCase();
    if (KNOWN_SELLERS_MAP[low]) return KNOWN_SELLERS_MAP[low];
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

const MONTH_MAP = {
    'jan': 0, 'ene': 0,
    'feb': 1,
    'mar': 2,
    'apr': 3, 'abr': 3,
    'may': 4,
    'jun': 5,
    'jul': 6,
    'aug': 7, 'ago': 7,
    'sep': 8, 'sept': 8,
    'oct': 9,
    'nov': 10,
    'dec': 11, 'dic': 11
};

function parseExcelDateStr(dateStr, isEnd = false) {
    if (!dateStr) return null;
    const s = String(dateStr).trim().toLowerCase().replace(/\./g, '');
    const m = s.match(/^(\d{1,2})[-/\s]+([a-z]{3,4})/i);
    if (m) {
        const day = parseInt(m[1], 10);
        const monKey = m[2].slice(0, 3).toLowerCase();
        const month = MONTH_MAP[monKey];
        if (month !== undefined && day >= 1 && day <= 31) {
            const now = new Date();
            let year = now.getFullYear();
            if (isEnd) {
                return new Date(year, month, day, 23, 59, 59, 999).getTime();
            }
            return new Date(year, month, day, 12, 0, 0, 0).getTime();
        }
    }
    return null;
}

function getScreenCount(category, name) {
    const cat = (category || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (cat === 'combos2' || n.includes('2 pantallas') || n.includes('dúo') || n.includes('duo')) return 2;
    if (cat === 'combos3' || n.includes('3 pantallas') || n.includes('trío') || n.includes('trio')) return 3;
    if (cat === 'combos4' || n.includes('4 pantallas') || n.includes('cuádruple') || n.includes('cuadruple')) return 4;
    const plusMatches = (name || '').match(/\+/g);
    if (plusMatches && plusMatches.length >= 1) return plusMatches.length + 1;
    return 1;
}

function guessPlatforms(productName, count) {
    if (!productName) return Array(count).fill('Streaming');
    const parts = productName.split('+').map(s => s.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(parts[i] || parts[0] || productName);
    }
    return result;
}

function platformMatches(slotPlat, excelSheetObj) {
    const pLow = String(slotPlat || '').toLowerCase();
    return excelSheetObj.matchKeys.some(k => pLow.includes(k));
}

/**
 * Lee el archivo Excel desde buffer en memoria (sin bloquear el archivo en Windows)
 * y extrae todas las pantallas activas de las 11 pestañas.
 */
function parseWorkbookFromBuffer(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const records = [];

    for (const sheetMeta of SHEET_MAP) {
        const { key, platform } = sheetMeta;
        const actualName = wb.SheetNames.find(s => s.toLowerCase().trim() === key.toLowerCase());
        if (!actualName) continue;

        const rows = XLSX.utils.sheet_to_json(wb.Sheets[actualName], { header: 1, raw: false, defval: '' });

        let currentAccountEmail = '';
        let currentAccountPass = '';
        let headerCols = null;

        for (let i = 0; i < rows.length; i++) {
            const r = rows[i].map(c => String(c || '').trim());
            if (r.every(c => !c)) continue;

            const lowerRow = r.map(c => c.toLowerCase());
            const clienteIdx = lowerRow.indexOf('cliente');
            const celIdx = lowerRow.indexOf('cel');

            // Detectar fila de encabezados de tabla ("usuario | Ciudad | cliente | cel ...")
            if (clienteIdx !== -1 && celIdx !== -1) {
                headerCols = {
                    usuarioIdx: lowerRow.findIndex(c => c === 'usuario' || c === 'vendedor'),
                    ciudadIdx: lowerRow.indexOf('ciudad'),
                    clienteIdx,
                    celIdx,
                    pantallasIdx: lowerRow.findIndex(c => c === 'pantallas' || c === 'dispositivo' || c === 'plataforma'),
                    pinIdx: lowerRow.findIndex(c => c === 'pin' || c === 'perfil'),
                    fechaIdx: lowerRow.indexOf('fecha'),
                    finIdx: lowerRow.indexOf('fin')
                };

                // Leer correo y contraseña de la fila superior del bloque (i - 1)
                if (i > 0) {
                    const prev = rows[i - 1].map(c => String(c || '').trim());
                    let emailCol = prev.findIndex(c => c.includes('@') && !isForbiddenPassword(c));
                    if (emailCol === -1 && key === 'I') {
                        // En IPTV: usuario en prev[2] y clave al lado en prev[3]
                        if (prev[2]) {
                            currentAccountEmail = prev[2];
                            currentAccountPass = !isForbiddenPassword(prev[3]) ? (prev[3] || '') : '';
                        }
                    } else if (emailCol !== -1) {
                        currentAccountEmail = prev[emailCol];
                        currentAccountPass = '';
                        // Tomar ÚNICAMENTE la contraseña que está justo al lado de la celda del email
                        for (let k = emailCol + 1; k < prev.length; k++) {
                            if (prev[k] !== '') {
                                if (!isForbiddenPassword(prev[k])) {
                                    currentAccountPass = prev[k];
                                }
                                break;
                            }
                        }
                    }
                }
                continue;
            }

            if (!headerCols) continue;

            const clientName = r[headerCols.clienteIdx] || '';
            const rawPhone = r[headerCols.celIdx] || '';
            const cleanPhone = sanitizePhone(rawPhone);
            if (!clientName || clientName.toLowerCase() === 'libre' || cleanPhone.length < 7) continue;

            const rawSeller = headerCols.usuarioIdx !== -1 ? r[headerCols.usuarioIdx] : '';
            const seller = normalizeSellerName(rawSeller);
            const city = headerCols.ciudadIdx !== -1 ? r[headerCols.ciudadIdx] : '';
            const pantallasCode = headerCols.pantallasIdx !== -1 ? r[headerCols.pantallasIdx] : '';
            const rawPinCol = headerCols.pinIdx !== -1 ? r[headerCols.pinIdx] : '';
            const fecha = headerCols.fechaIdx !== -1 ? r[headerCols.fechaIdx] : '';
            const fin = headerCols.finIdx !== -1 ? r[headerCols.finIdx] : '';

            // El Nombre de Perfil en la plataforma es el valor de la columna 'cliente' del Excel
            const profileName = clientName.trim();

            let email = currentAccountEmail;
            let password = currentAccountPass;
            let profilePin = rawPinCol;

            // Caso especial en pestaña NO (Netflix Miembro Extra / Nopv):
            // la columna 'pin' contiene el email propio del miembro extra y la columna 11 su contraseña
            if (rawPinCol.includes('@')) {
                email = rawPinCol;
                profilePin = '';
                password = '';
                const startSearchCol = headerCols.finIdx !== -1 ? headerCols.finIdx + 1 : 10;
                for (let k = startSearchCol; k < r.length; k++) {
                    if (r[k] && !isForbiddenPassword(r[k])) {
                        password = r[k];
                        break;
                    }
                }
            }

            records.push({
                sheet: actualName,
                sheetMeta,
                platform,
                seller,
                city,
                clientName,
                phone: cleanPhone,
                pantallasCode,
                email,
                password,
                profile: profileName,
                profilePin,
                fecha,
                fin,
                startMs: parseExcelDateStr(fecha, false),
                expMs: parseExcelDateStr(fin, true)
            });
        }
    }

    return records;
}

/**
 * Sincroniza los registros extraídos del Excel con Firebase (clientProfiles, clientSales, sellerSales)
 */
async function syncExcelToFirebase(customBuffer = null) {
    let buffer = customBuffer;
    if (!buffer) {
        if (!fs.existsSync(EXCEL_FILE_PATH)) {
            throw new Error(`No se encontró el archivo Excel en: ${EXCEL_FILE_PATH}`);
        }
        buffer = fs.readFileSync(EXCEL_FILE_PATH);
    }

    const excelRecords = parseWorkbookFromBuffer(buffer);
    if (excelRecords.length === 0) {
        return { success: false, message: 'No se encontraron registros activos en el Excel.' };
    }

    // Descargar estado actual de Firebase
    const [csResp, cpResp, ssResp] = await Promise.all([
        axios.get(`${FIREBASE_DB_URL}/clientSales.json`),
        axios.get(`${FIREBASE_DB_URL}/clientProfiles.json`),
        axios.get(`${FIREBASE_DB_URL}/sellerSales.json`)
    ]);

    const clientSales = csResp.data || {};
    const clientProfiles = cpResp.data || {};
    const sellerSales = ssResp.data || {};

    // Agrupar pantallas del Excel por teléfono del cliente
    const byPhone = {};
    for (const rec of excelRecords) {
        if (!byPhone[rec.phone]) byPhone[rec.phone] = [];
        byPhone[rec.phone].push(rec);
    }

    let updatedClientsCount = 0;
    let updatedScreensCount = 0;
    let createdSalesCount = 0;

    for (const phone of Object.keys(byPhone)) {
        const phoneRecs = byPhone[phone];
        const firstRec = phoneRecs[0];

        // 1. Asegurar clientProfiles/{phone} (Nombre y PIN de Cuenta de 4 dígitos)
        if (!clientProfiles[phone]) clientProfiles[phone] = {};
        if (!clientProfiles[phone].name || clientProfiles[phone].name === 'Cliente' || clientProfiles[phone].name === 'Sin Nombre') {
            clientProfiles[phone].name = firstRec.clientName;
        }
        if (!clientProfiles[phone].pin) {
            const fourDigitPin = phoneRecs.map(r => r.profilePin).find(p => /^\d{4}$/.test(p)) || phone.slice(-4);
            clientProfiles[phone].pin = fourDigitPin;
            clientProfiles[phone].ticketPin = fourDigitPin;
        }

        // 2. Buscar ventas existentes del cliente en clientSales[phone]
        if (!clientSales[phone]) clientSales[phone] = {};
        const saleKeys = Object.keys(clientSales[phone]);

        // Ordenar ventas de más reciente a más antigua
        saleKeys.sort((a, b) => (clientSales[phone][b]?.date || 0) - (clientSales[phone][a]?.date || 0));

        // Expandir slots priorizando ventas activas (o la más reciente si todas vencieron)
        const nowMs = Date.now();
        const activeSaleKeys = saleKeys.filter(k => (Number(clientSales[phone][k]?.expirationDate) || 0) >= nowMs);
        const targetSaleKeys = activeSaleKeys.length > 0 ? activeSaleKeys : (saleKeys.length > 0 ? [saleKeys[0]] : []);
        const targetSaleKeySet = new Set(targetSaleKeys);

        const availableSlots = [];
        const allClientSlots = [];

        for (const sKey of saleKeys) {
            const sale = clientSales[phone][sKey];
            if (!sale) continue;

            let itemsArr = [];
            if (!sale.items || (Array.isArray(sale.items) && sale.items.length === 0) || (typeof sale.items === 'object' && Object.keys(sale.items).length === 0)) {
                itemsArr = [{
                    id: 'legacy_0',
                    name: 'Pantalla Streaming',
                    category: 'individual',
                    specificEmails: []
                }];
            } else {
                itemsArr = Array.isArray(sale.items) ? sale.items : Object.values(sale.items);
            }
            sale.items = itemsArr;

            itemsArr.forEach((it, itemIdx) => {
                const count = getScreenCount(it.category, it.name);
                const guesses = guessPlatforms(it.name, count);
                const existingSpec = Array.isArray(it.specificEmails)
                    ? it.specificEmails
                    : (it.specificEmails && typeof it.specificEmails === 'object' ? Object.values(it.specificEmails) : []);
                const totalScreens = Math.max(count, existingSpec.length, 1);
                const normSpec = [];
                for (let sIdx = 0; sIdx < totalScreens; sIdx++) {
                    const sp = existingSpec[sIdx] || {};
                    normSpec.push({
                        platform: (sp.platform || guesses[sIdx] || it.name || 'Streaming').toString().trim(),
                        email: (sp.email || (sIdx === 0 && totalScreens === 1 ? (sale.email || '') : '')).toString().trim(),
                        pass: (sp.pass || (sIdx === 0 && totalScreens === 1 ? (sale.password || '') : '')).toString().trim(),
                        profile: (sp.profile || (sIdx === 0 && totalScreens === 1 ? (sale.profile || '') : '')).toString().trim(),
                        pin: (sp.pin || '').toString().trim()
                    });
                    const slotRef = {
                        saleKey: sKey,
                        sale,
                        itemIdx,
                        screenIdx: sIdx,
                        specObj: normSpec[sIdx],
                        used: false
                    };
                    allClientSlots.push(slotRef);
                    if (targetSaleKeySet.has(sKey)) {
                        availableSlots.push(slotRef);
                    }
                }
                it.specificEmails = normSpec;
            });
        }

        const unmatchedRecs = [];

        // Paso 2A: Emparejar primero por coincidencia exacta de Plataforma + Email
        for (const rec of phoneRecs) {
            let match = availableSlots.find(sl =>
                !sl.used &&
                platformMatches(sl.specObj.platform, rec.sheetMeta) &&
                sl.specObj.email.toLowerCase() === rec.email.toLowerCase()
            );

            // Paso 2B: Emparejar por Plataforma + Nombre de cliente en la venta
            if (!match) {
                match = availableSlots.find(sl =>
                    !sl.used &&
                    platformMatches(sl.specObj.platform, rec.sheetMeta) &&
                    (sl.sale.clientName || '').toLowerCase().trim() === rec.clientName.toLowerCase().trim()
                );
            }

            // Paso 2C: Emparejar por Plataforma disponible en la venta activa/más reciente
            if (!match) {
                match = availableSlots.find(sl =>
                    !sl.used &&
                    platformMatches(sl.specObj.platform, rec.sheetMeta)
                );
            }

            if (match) {
                match.used = true;
                match.specObj.email = rec.email;
                match.specObj.pass = rec.password;
                match.specObj.profile = rec.profile || match.specObj.profile || '';
                match.specObj.pin = rec.profilePin || match.specObj.pin || '';
                if (!match.sale.email) match.sale.email = rec.email;
                if (!match.sale.password) match.sale.password = rec.password;
                if (!match.sale.profile && rec.profile) match.sale.profile = rec.profile;

                // También completar en otras ventas del mismo cliente que tengan ese mismo correo
                allClientSlots.forEach(other => {
                    if (other !== match && platformMatches(other.specObj.platform, rec.sheetMeta) && other.specObj.email.toLowerCase() === rec.email.toLowerCase()) {
                        other.specObj.pass = rec.password;
                        if (rec.profile) other.specObj.profile = rec.profile;
                        if (rec.profilePin) other.specObj.pin = rec.profilePin;
                    }
                });

                updatedScreensCount++;
            } else {
                unmatchedRecs.push(rec);
            }
        }

        // Paso 3: Si hay pantallas en el Excel para este teléfono que aún no estaban en Firebase,
        // agregarlas a su venta activa o crear una venta nueva para el cliente
        if (unmatchedRecs.length > 0) {
            const baseCleanEx = phone.replace(/^57/, '');
            if (clientProfiles[phone]) delete clientProfiles[phone].codeAttemptUsed;
            if (clientProfiles[baseCleanEx]) delete clientProfiles[baseCleanEx].codeAttemptUsed;
            if (clientProfiles['57' + baseCleanEx]) delete clientProfiles['57' + baseCleanEx].codeAttemptUsed;

            if (saleKeys.length > 0) {
                // Añadir como pantallas adicionales en la venta más reciente del cliente
                const latestSaleKey = saleKeys[0];
                const latestSale = clientSales[phone][latestSaleKey];
                if (!Array.isArray(latestSale.items)) {
                    latestSale.items = Object.values(latestSale.items || {});
                }
                for (const rec of unmatchedRecs) {
                    latestSale.items.push({
                        id: 'excel_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                        name: rec.platform,
                        category: 'individual',
                        specificEmails: [{
                            platform: rec.platform,
                            email: rec.email,
                            pass: rec.password,
                            profile: rec.profile,
                            pin: rec.profilePin
                        }]
                    });
                    updatedScreensCount++;
                }
            } else {
                // Crear nueva venta para este cliente desde el Excel
                const newSaleKey = 'excel_' + phone + '_' + Date.now();
                const startMs = firstRec.startMs || Date.now();
                const expMs = firstRec.expMs || (startMs + 30 * 86400000);
                const newItems = unmatchedRecs.map((rec, idx) => ({
                    id: 'excel_item_' + idx + '_' + Date.now(),
                    name: rec.platform,
                    category: 'individual',
                    finalPrice: 0,
                    specificEmails: [{
                        platform: rec.platform,
                        email: rec.email,
                        pass: rec.password,
                        profile: rec.profile,
                        pin: rec.profilePin
                    }]
                }));

                const newSaleObj = {
                    clientName: firstRec.clientName,
                    clientPhone: phone,
                    clientCity: firstRec.city || '',
                    date: startMs,
                    expirationDate: expMs,
                    isPaid: true,
                    sellerName: firstRec.seller || 'Página Web Oficial',
                    total: 0,
                    email: firstRec.email,
                    password: firstRec.password,
                    profile: firstRec.profile,
                    items: newItems
                };

                clientSales[phone][newSaleKey] = newSaleObj;

                // Si pertenece a un vendedor, reflejar también en sellerSales
                if (newSaleObj.sellerName && newSaleObj.sellerName !== 'Página Web Oficial' && newSaleObj.sellerName !== 'Admin') {
                    if (!sellerSales[newSaleObj.sellerName]) sellerSales[newSaleObj.sellerName] = {};
                    sellerSales[newSaleObj.sellerName][newSaleKey] = { ...newSaleObj };
                }

                createdSalesCount++;
                updatedScreensCount += unmatchedRecs.length;
            }
        }

        // Paso 4: Sincronizar ventas actualizadas de este teléfono hacia sellerSales
        for (const sKey of Object.keys(clientSales[phone])) {
            const cSale = clientSales[phone][sKey];
            const sName = cSale.sellerName;
            if (sName && sName !== 'Página Web Oficial' && sName !== 'Admin' && sellerSales[sName]) {
                let targetSid = sKey;
                if (!sellerSales[sName][targetSid]) {
                    targetSid = Object.keys(sellerSales[sName]).find(sid => {
                        const ss = sellerSales[sName][sid];
                        return ss && sanitizePhone(ss.clientPhone) === phone && Math.abs((ss.date || 0) - (cSale.date || 0)) < 172800000;
                    });
                }
                if (targetSid && sellerSales[sName][targetSid]) {
                    sellerSales[sName][targetSid].items = cSale.items;
                    if (cSale.email) sellerSales[sName][targetSid].email = cSale.email;
                    if (cSale.password) sellerSales[sName][targetSid].password = cSale.password;
                    if (cSale.profile) sellerSales[sName][targetSid].profile = cSale.profile;
                }
            }
        }

        updatedClientsCount++;
    }

    // Guardar en Firebase
    const syncTimestamp = Date.now();
    await Promise.all([
        axios.put(`${FIREBASE_DB_URL}/clientProfiles.json`, clientProfiles),
        axios.put(`${FIREBASE_DB_URL}/clientSales.json`, clientSales),
        axios.put(`${FIREBASE_DB_URL}/sellerSales.json`, sellerSales),
        axios.patch(`${FIREBASE_DB_URL}/storeConfig.json`, {
            lastExcelSync: syncTimestamp,
            lastExcelSyncScreens: updatedScreensCount,
            lastExcelSyncClients: updatedClientsCount
        })
    ]);

    return {
        success: true,
        totalExcelScreens: excelRecords.length,
        updatedClientsCount,
        updatedScreensCount,
        createdSalesCount,
        syncTimestamp
    };
}

/**
 * Inicia el observador en tiempo real sobre "D:\Varios\Netflix\Netflix clientes.xlsx"
 * Cada vez que el usuario guarde cambios en Excel (Ctrl + G), sincroniza con Firebase.
 */
function startExcelWatcher() {
    console.log(`[EXCEL-SYNC] 👀 Vigilando cambios en vivo en: "${EXCEL_FILE_PATH}"`);
    let debounceTimer = null;
    let lastMtimeMs = 0;

    try {
        if (fs.existsSync(EXCEL_FILE_PATH)) {
            lastMtimeMs = fs.statSync(EXCEL_FILE_PATH).mtimeMs;
        }
    } catch (e) { /* ignore */ }

    const triggerSync = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            try {
                if (!fs.existsSync(EXCEL_FILE_PATH)) return;
                const stat = fs.statSync(EXCEL_FILE_PATH);
                if (stat.mtimeMs === lastMtimeMs) return;
                lastMtimeMs = stat.mtimeMs;

                console.log(`[EXCEL-SYNC] 🔄 Cambio detectado en "${path.basename(EXCEL_FILE_PATH)}" (${new Date().toLocaleTimeString()}). Sincronizando con Firebase...`);
                const res = await syncExcelToFirebase();
                console.log(`[EXCEL-SYNC] ✅ Base de datos actualizada: ${res.updatedScreensCount} pantallas en ${res.updatedClientsCount} clientes (${res.createdSalesCount} clientes nuevos añadidos).`);
            } catch (err) {
                console.error(`[EXCEL-SYNC] ⚠️ Error al sincronizar Excel:`, err.message);
            }
        }, 1800);
    };

    // Vigilar el directorio para soportar el guardado atómico de Microsoft Excel (que crea un archivo temporal y renombra)
    const dir = path.dirname(EXCEL_FILE_PATH);
    const base = path.basename(EXCEL_FILE_PATH).toLowerCase();

    if (fs.existsSync(dir)) {
        fs.watch(dir, (eventType, filename) => {
            if (!filename) return;
            const fLow = filename.toLowerCase();
            if (fLow.startsWith('~$')) return; // Ignorar archivo temporal de bloqueo de Excel
            if (fLow === base) {
                triggerSync();
            }
        });
    }

    // Respaldo por polling ligero cada 4 segundos por si Windows omite algún evento de renombrado de Excel
    setInterval(() => {
        try {
            if (!fs.existsSync(EXCEL_FILE_PATH)) return;
            const stat = fs.statSync(EXCEL_FILE_PATH);
            if (stat.mtimeMs !== lastMtimeMs) {
                triggerSync();
            }
        } catch (e) { /* ignore */ }
    }, 4000);
}

if (require.main === module) {
    (async () => {
        try {
            console.log(`[EXCEL-SYNC] 🚀 Ejecutando sincronización inicial desde: "${EXCEL_FILE_PATH}"...`);
            const result = await syncExcelToFirebase();
            console.log(`[EXCEL-SYNC] ✅ Sincronización completada con éxito:`, result);
            if (process.argv.includes('--watch')) {
                startExcelWatcher();
            }
        } catch (err) {
            console.error(`[EXCEL-SYNC] ❌ Error:`, err.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    EXCEL_FILE_PATH,
    parseWorkbookFromBuffer,
    syncExcelToFirebase,
    startExcelWatcher
};
