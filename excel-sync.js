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
    { key: 'DO', platform: 'Disney', matchKeys: ['disney'] },
    { key: 'MO', platform: 'Max (HBO)', matchKeys: ['max', 'hbo'] },
    { key: 'PO', platform: 'Prime Video', matchKeys: ['prime', 'amazon'] },
    { key: 'PA', platform: 'Paramount', matchKeys: ['paramount'] },
    { key: 'C', platform: 'Crunchyroll', matchKeys: ['crunchy'] },
    { key: 'V', platform: 'Vix', matchKeys: ['vix'] },
    { key: 'I', platform: 'IPTV', matchKeys: ['iptv', 'magis', 'flujo', 'tele'] },
    { key: 'Apple', platform: 'Apple TV', matchKeys: ['apple'] },
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

    // Formato con texto de mes: "18-jul", "18/oct", "18 oct", "18-octubre"
    let m = s.match(/^(\d{1,2})[-/\s]+([a-z]{3,4})/i);
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

    // Formato numérico: "18/10/2026", "18-10-2026", "18/10/26", "18/10", "18-10"
    m = s.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
        if (year < 100) year += 2000;
        if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
            if (isEnd) {
                return new Date(year, month, day, 23, 59, 59, 999).getTime();
            }
            return new Date(year, month, day, 12, 0, 0, 0).getTime();
        }
    }

    return null;
}

function sameDate(t1, t2) {
    if (!t1 || !t2) return false;
    const d1 = new Date(Number(t1) || t1);
    const d2 = new Date(Number(t2) || t2);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
    return d1.getDate() === d2.getDate() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getFullYear() === d2.getFullYear();
}

const KNOWN_PLATFORM_PATTERNS = [
    { key: 'Netflix', regex: /\b(netflix)\b/i },
    { key: 'Disney', regex: /\b(disney\+?|disneyplus)\b/i },
    { key: 'Max (HBO)', regex: /\b(hbo\s*max|hbomax|max\b)/i },
    { key: 'Prime Video', regex: /\b(prime\s*video|primevideo|prime|amazon)\b/i },
    { key: 'Paramount', regex: /\b(paramount\+?|paramountplus)\b/i },
    { key: 'Vix', regex: /\b(vix\+?|vixplus)\b/i },
    { key: 'Crunchyroll', regex: /\b(crunchyroll|crunchy)\b/i },
    { key: 'IPTV', regex: /\b(iptv|magis|flujo|tele)\b/i },
    { key: 'Apple TV', regex: /\b(apple\s*tv\+?|appletvplus|apple)\b/i },
    { key: 'Spotify', regex: /\b(spotify)\b/i },
    { key: 'YouTube', regex: /\b(youtube|yt)\b/i }
];

function extractPlatformsFromName(name) {
    if (!name) return [];
    const matches = [];
    for (const p of KNOWN_PLATFORM_PATTERNS) {
        const match = name.match(p.regex);
        if (match) {
            matches.push({ platform: p.key, index: match.index });
        }
    }
    matches.sort((a, b) => a.index - b.index);
    return matches.map(m => m.platform);
}

function cleanPlatformName(str) {
    if (!str) return '';
    return str
        .replace(/Disney\+/gi, 'Disney')
        .replace(/Paramount\+/gi, 'Paramount')
        .replace(/Apple TV\+/gi, 'Apple TV')
        .replace(/AppleTv\+/gi, 'Apple TV')
        .replace(/Vix\+/gi, 'Vix')
        .replace(/Discovery\+/gi, 'Discovery')
        .replace(/Amc\+/gi, 'Amc')
        .replace(/Canva\+/gi, 'Canva')
        .replace(/DisneyPlus/gi, 'Disney')
        .replace(/ParamountPlus/gi, 'Paramount')
        .replace(/AppleTvPlus/gi, 'Apple TV')
        .replace(/VixPlus/gi, 'Vix')
        .replace(/DiscoveryPlus/gi, 'Discovery')
        .replace(/AmcPlus/gi, 'Amc')
        .replace(/CanvaPlus/gi, 'Canva')
        .replace(/\+/g, '')
        .trim();
}

function cleanComboNameForSplitting(str) {
    if (!str) return '';
    return str
        .replace(/disney\s*\+/gi, 'Disney')
        .replace(/paramount\s*\+/gi, 'Paramount')
        .replace(/apple\s*tv\s*\+/gi, 'Apple TV')
        .replace(/vix\s*\+/gi, 'Vix')
        .replace(/discovery\s*\+/gi, 'Discovery')
        .replace(/amc\s*\+/gi, 'Amc')
        .replace(/canva\s*\+/gi, 'Canva');
}

function restoreBrandPluses(str) {
    return cleanPlatformName(str);
}

function getScreenCount(category, name) {
    const cat = (category || '').toLowerCase().trim();
    const n = (name || '').toLowerCase().trim();
    const detected = extractPlatformsFromName(name);
    if (detected.length > 1) return detected.length;

    if (cat.includes('combo2') || cat.includes('combos2') || (cat.includes('combo') && cat.includes('2')) || n.includes('duo') || n.includes('combo 2')) return 2;
    if (cat.includes('combo3') || cat.includes('combos3') || (cat.includes('combo') && cat.includes('3')) || n.includes('trio') || n.includes('triple') || n.includes('combo 3')) return 3;
    if (cat.includes('combo4') || cat.includes('combos4') || (cat.includes('combo') && cat.includes('4')) || n.includes('combo 4')) return 4;
    if (cat.includes('combo5') || cat.includes('combos5') || (cat.includes('combo') && cat.includes('5')) || n.includes('combo 5')) return 5;
    if (cat.includes('promo') || cat.includes('combo')) {
        if (n.includes('5')) return 5;
        if (n.includes('4')) return 4;
        if (n.includes('3')) return 3;
        if (n.includes('2')) return 2;
    }
    const clean = cleanComboNameForSplitting(name);
    const plusMatches = clean.match(/[\+\-\|]|\s+y\s+/gi);
    if (plusMatches && plusMatches.length >= 1) return plusMatches.length + 1;
    return 1;
}

function guessPlatforms(productName, count) {
    if (!productName) return Array(count).fill('Streaming');
    const detected = extractPlatformsFromName(productName);
    if (detected.length > 0) {
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(detected[i] || (detected.length === 1 ? detected[0] : 'Streaming'));
        }
        return result;
    }
    const clean = cleanComboNameForSplitting(productName);
    const parts = clean.split(/\s*[\+\-\|]\s*|\s+y\s+/i)
        .map(s => s.replace(/\(.*?\)/g, '').trim())
        .filter(Boolean)
        .map(cleanPlatformName);
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(parts[i] || parts[0] || cleanPlatformName(clean));
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
                platform: cleanPlatformName(platform),
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

        // 2. Determinar si esta cartera de ventas pertenece a un vendedor o es venta directa
        const sName = (firstRec.seller || '').trim();
        const isSellerSale = sName && sName !== 'Página Web Oficial' && sName !== 'Admin' && sName !== 'Directo';

        // Buscar ventas existentes del cliente en su contenedor respectivo:
        // Si es vendedor -> sellerSales[sName]
        // Si es directo -> clientSales[phone]
        let targetStore = null;

        if (isSellerSale) {
            if (!sellerSales[sName]) sellerSales[sName] = {};
            targetStore = sellerSales[sName];
            // Eliminar cualquier duplicado accidental de este cliente de vendedor en clientSales
            if (clientSales[phone]) {
                delete clientSales[phone];
            }
        } else {
            if (!clientSales[phone]) clientSales[phone] = {};
            targetStore = clientSales[phone];
            // Limpiar de sellerSales si existiera duplicado accidental
            for (const s of Object.keys(sellerSales)) {
                if (sellerSales[s]) {
                    for (const k of Object.keys(sellerSales[s])) {
                        if (sanitizePhone(sellerSales[s][k]?.clientPhone) === phone) {
                            delete sellerSales[s][k];
                        }
                    }
                }
            }
        }

        // Obtener todas las ventas existentes para este cliente en el almacén destino
        const existingSaleKeys = Object.keys(targetStore).filter(k => {
            const s = targetStore[k];
            return s && sanitizePhone(s.clientPhone) === phone;
        });

        // Fechas provenientes del Excel para este cliente
        const excelStartMs = phoneRecs.map(r => r.startMs).find(Boolean) || firstRec.startMs || Date.now();
        const excelExpMs = phoneRecs.map(r => r.expMs).find(Boolean) || firstRec.expMs || (excelStartMs + 30 * 86400000);
        const nowMs = Date.now();

        // Buscar si existe una venta cuya fecha de inicio coincida con la del Excel
        let matchingSaleKey = existingSaleKeys.find(k => {
            const s = targetStore[k];
            if (!s) return false;
            const sDate = s.date || s.fechaCompraOriginal;
            return sameDate(sDate, excelStartMs);
        });

        // Resetear intento de código del cliente si se actualizan datos
        const baseCleanEx = phone.replace(/^57/, '');
        if (clientProfiles[phone]) delete clientProfiles[phone].codeAttemptUsed;
        if (clientProfiles[baseCleanEx]) delete clientProfiles[baseCleanEx].codeAttemptUsed;
        if (clientProfiles['57' + baseCleanEx]) delete clientProfiles['57' + baseCleanEx].codeAttemptUsed;

        if (matchingSaleKey) {
            // ============================================================
            // CASO 1: LA FECHA DE INICIO COINCIDE -> SOBREESCRIBIR
            // ============================================================
            // "si la fecha de inicio coincide debe sobre escribir ya que la fecha de fin se modifica cuando renueva"
            const sale = targetStore[matchingSaleKey];
            sale.expirationDate = excelExpMs;
            sale.date = excelStartMs;
            if (firstRec.clientName) sale.clientName = firstRec.clientName;
            if (firstRec.city) sale.clientCity = firstRec.city;
            if (sName) sale.sellerName = sName;
            sale.isPaid = true;

            // Actualizar o poblar pantallas / items en la venta existente
            let itemsArr = [];
            if (!sale.items || (Array.isArray(sale.items) && sale.items.length === 0) || (typeof sale.items === 'object' && Object.keys(sale.items).length === 0)) {
                itemsArr = [];
            } else {
                itemsArr = Array.isArray(sale.items) ? sale.items : Object.values(sale.items);
            }

            for (const rec of phoneRecs) {
                let assigned = false;

                // 1. Buscar en items existentes: si el item es combo o individual que coincida con rec.sheetMeta
                for (let it of itemsArr) {
                    const screenCount = getScreenCount(it.category, it.name);
                    const guesses = guessPlatforms(it.name, screenCount);

                    if (!Array.isArray(it.specificEmails)) {
                        it.specificEmails = it.specificEmails && typeof it.specificEmails === 'object'
                            ? Object.values(it.specificEmails)
                            : [];
                    }

                    // Asegurar que specificEmails tenga suficientes pantallas si es un combo
                    while (it.specificEmails.length < screenCount) {
                        const sIdx = it.specificEmails.length;
                        it.specificEmails.push({
                            platform: cleanPlatformName(guesses[sIdx] || it.name),
                            email: '',
                            pass: '',
                            profile: '',
                            pin: ''
                        });
                    }

                    // Buscar pantalla que coincida con rec.sheetMeta
                    for (let sIdx = 0; sIdx < it.specificEmails.length; sIdx++) {
                        const sp = it.specificEmails[sIdx];
                        const spPlat = sp.platform || guesses[sIdx] || it.name;
                        if (platformMatches(spPlat, rec.sheetMeta)) {
                            sp.platform = cleanPlatformName(rec.platform);
                            sp.email = rec.email || sp.email || '';
                            sp.pass = rec.password || sp.pass || '';
                            sp.profile = rec.profile || sp.profile || '';
                            sp.pin = rec.profilePin || sp.pin || '';
                            assigned = true;
                            break;
                        }
                    }
                    if (assigned) break;
                }

                // 2. Si no encajó en ninguna pantalla existente, agregar como nuevo item
                if (!assigned) {
                    const newItem = {
                        id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        name: cleanPlatformName(rec.platform),
                        category: 'individual',
                        finalPrice: 0,
                        specificEmails: [{
                            platform: cleanPlatformName(rec.platform),
                            email: rec.email || '',
                            pass: rec.password || '',
                            profile: rec.profile || '',
                            pin: rec.profilePin || ''
                        }]
                    };
                    itemsArr.push(newItem);
                }
                updatedScreensCount++;
            }
            sale.items = itemsArr;

            // Credenciales principales de la venta
            if (firstRec.email) sale.email = firstRec.email;
            if (firstRec.password) sale.password = firstRec.password;
            if (firstRec.profile) sale.profile = firstRec.profile;

            // "para que solo exista un registro y ese registro debe ser verificado del excel para que no alla mas duplicados"
            // Cualquier otra venta para este cliente:
            // Si es un duplicado técnico de excel_ previo con total 0 -> borrar
            // Si es otra venta real anterior -> pasarla al historial expirándola (expirationDate en el pasado)
            for (const otherKey of existingSaleKeys) {
                if (otherKey === matchingSaleKey) continue;
                const otherSale = targetStore[otherKey];
                if (!otherSale) continue;
                if (otherKey.startsWith('excel_') && (otherSale.total === 0 || !otherSale.total)) {
                    delete targetStore[otherKey];
                } else if ((Number(otherSale.expirationDate) || 0) >= nowMs) {
                    otherSale.expirationDate = Math.min(Number(otherSale.date || 0) + 30 * 86400000, nowMs - 1000);
                }
            }

        } else {
            // ============================================================
            // CASO 2: LA FECHA DE INICIO NO COINCIDE
            // ============================================================
            // "pero si la fecha de inicio no coincide significa que esa cuenta se va al historial para que solo exista un registro y ese registro debe ser verificado del excel para que no alla mas duplicados"
            for (const oldKey of existingSaleKeys) {
                const oldSale = targetStore[oldKey];
                if (!oldSale) continue;
                if (oldKey.startsWith('excel_') && (oldSale.total === 0 || !oldSale.total)) {
                    delete targetStore[oldKey];
                } else if ((Number(oldSale.expirationDate) || 0) >= nowMs) {
                    oldSale.expirationDate = Math.min(Number(oldSale.date || 0) + 30 * 86400000, nowMs - 1000);
                }
            }

            // Crear el ÚNICO registro verificado del Excel con clave estable
            const verifiedSaleKey = 'excel_' + phone;
            const newItems = phoneRecs.map((rec, idx) => ({
                id: 'excel_item_' + idx,
                name: cleanPlatformName(rec.platform),
                category: 'individual',
                finalPrice: 0,
                specificEmails: [{
                    platform: cleanPlatformName(rec.platform),
                    email: rec.email || '',
                    pass: rec.password || '',
                    profile: rec.profile || '',
                    pin: rec.profilePin || ''
                }]
            }));

            targetStore[verifiedSaleKey] = {
                clientName: firstRec.clientName,
                clientPhone: phone,
                clientCity: firstRec.city || '',
                date: excelStartMs,
                expirationDate: excelExpMs,
                isPaid: true,
                sellerName: sName || 'Página Web Oficial',
                total: 0,
                email: firstRec.email || '',
                password: firstRec.password || '',
                profile: firstRec.profile || '',
                items: newItems
            };

            createdSalesCount++;
            updatedScreensCount += phoneRecs.length;
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
    startExcelWatcher,
    getScreenCount,
    guessPlatforms,
    cleanPlatformName,
    extractPlatformsFromName,
    platformMatches
};
