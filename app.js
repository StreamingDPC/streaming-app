// Inicializar Firebase (Compat Version)
const firebaseConfig = {
    apiKey: "AIzaSyBscP8FT1dcnHlSFMXc3DlfXSgRO9ET9s4",
    authDomain: "streamingdpc-7e7fa.firebaseapp.com",
    databaseURL: "https://streamingdpc-7e7fa-default-rtdb.firebaseio.com",
    projectId: "streamingdpc-7e7fa",
    storageBucket: "streamingdpc-7e7fa.firebasestorage.app",
    messagingSenderId: "831116907849",
    appId: "1:831116907849:web:ee8e744db342970fd0b698"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let storeConfig = {};
let products = [];
let cart = [];

// DOM Elements
const productsGrid = document.getElementById('products-grid');
const tabBtns = document.querySelectorAll('.tab-btn');
const cartBadge = document.getElementById('cart-count');
const cartModal = document.getElementById('cart-modal');
const openCartBtn = document.getElementById('open-cart');
const closeModalBtn = document.querySelector('.close-modal');
const cartItemsContainer = document.getElementById('cart-items');
const cartTotalLabel = document.getElementById('cart-total');
const checkoutBtn = document.getElementById('checkout-btn');

const openCodeBtn = document.getElementById('open-code-btn');
const codeModal = document.getElementById('code-modal');
const fetchCodeBtn = document.getElementById('fetch-code-btn');
const closeCodeBtn = document.querySelector('.code-close');
const codePlatformSelect = document.getElementById('code-platform');
const openVendedoresBtn = document.getElementById('open-vendedores-btn');

const sellerModal = document.getElementById('seller-modal');
const closeSellerBtn = document.querySelector('.seller-close');
const loginSellerBtn = document.getElementById('login-seller-btn');

const sellerDashboardModal = document.getElementById('seller-dashboard-modal');
const closeSellerDashBtn = document.querySelector('.dash-close');
const logoutSellerBtn = document.getElementById('logout-seller-btn');
const sellerSalesList = document.getElementById('seller-sales-list');

const reminderEditorModal = document.getElementById('reminder-editor-modal');
const closeReminderBtn = document.querySelector('.reminder-close');
const remindPhoneInput = document.getElementById('remind-phone');
const remindMsgInput = document.getElementById('remind-msg');
const remindSaleIdInput = document.getElementById('remind-sale-id');
const sendReminderWhatsappBtn = document.getElementById('send-reminder-whatsapp-btn');

const sellerClientSelector = document.getElementById('seller-client-selector');
const sellerClientsDropdown = document.getElementById('seller-clients-dropdown');

const openClientBtn = document.getElementById('open-client-btn');
const clientLoginModal = document.getElementById('client-login-modal');
const clientDashboardModal = document.getElementById('client-dashboard-modal');
const closeClientLoginBtn = document.querySelector('.client-login-close');
const closeClientDashBtn = document.querySelector('.client-dash-close');
const loginClientBtn = document.getElementById('login-client-btn');
const logoutClientBtn = document.getElementById('logout-client-btn');
const clientSalesList = document.getElementById('client-sales-list');

let isSellerMode = localStorage.getItem('isSellerMode') === 'true';
let currentSellerName = localStorage.getItem('sellerName') || '';
let clientPhoneLoggedIn = localStorage.getItem('clientPhone') || '';

function init() {
    renderProducts('individual');
    setupEventListeners();
    setupConfigUI();
}

function setupConfigUI() {
    // Hide or process Code Modal options
    if (storeConfig.netflixEnabled === false) {
        let opt = codePlatformSelect.querySelector('option[value="netflix"]');
        if (opt) opt.remove();
    }
    if (storeConfig.disneyEnabled === false) {
        let opt = codePlatformSelect.querySelector('option[value="disney"]');
        if (opt) opt.remove();
    }

    if (storeConfig.netflixEnabled === false && storeConfig.disneyEnabled === false) {
        openCodeBtn.style.display = 'none';
    }

    // Toggle Reseller colors
    if (isSellerMode) {
        openVendedoresBtn.innerHTML = `<i class="fa-solid fa-user-check"></i> <span class="hide-mobile">👋 Hola, ${currentSellerName}</span>`;
        openVendedoresBtn.style.background = '#27ae60';
        openVendedoresBtn.style.color = 'white';
        openVendedoresBtn.style.borderColor = '#2ecc71';
    }
}

function getPrice(product) {
    if (isSellerMode && product.sellerPrice) {
        return product.sellerPrice;
    }
    return product.price;
}

function renderProducts(category) {
    productsGrid.innerHTML = '';

    // CASO ESPECIAL TAB ESTRENOS
    if (category === 'estrenos') {
        const estrenos = storeConfig.estrenos || [];
        if (estrenos.length === 0) {
            productsGrid.innerHTML = `<p style="color:var(--text-secondary); grid-column:1/-1; text-align:center;">Próximamente agregaremos los nuevos estrenos.</p>`;
            return;
        }

        estrenos.forEach(item => {
            const card = document.createElement('div');
            card.className = 'product-card';

            // If it is a youtube direct URL, convert to embed. Otherwise try to use original URL or fallback
            let iframeSrc = item.url;
            if (item.url.includes('youtube.com/watch?v=')) {
                iframeSrc = item.url.replace('watch?v=', 'embed/');
            } else if (item.url.includes('youtu.be/')) {
                iframeSrc = item.url.replace('youtu.be/', 'youtube.com/embed/');
            }
            // For safety and layout, keep simple structure
            card.innerHTML = `
                <div style="border-radius:12px; overflow:hidden; margin-bottom:1rem;">
                    <iframe width="100%" height="200" src="${iframeSrc}" frameborder="0" allowfullscreen></iframe>
                </div>
                <h3 class="product-title" style="margin-top:auto;">${item.title}</h3>
                <p class="product-desc" style="margin-bottom:0;">🍿 Tráiler Oficial</p>
            `;
            productsGrid.appendChild(card);
        });
        return;
    }

    const filtered = category === 'all'
        ? products.filter(p => p.active !== false)
        : products.filter(p => p.category === category && p.active !== false);

    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        // Usar imagen por defecto si no tiene
        const imgUrl = product.image || 'https://img.icons8.com/color/96/movie.png';
        const displayPrice = getPrice(product);

        let sellerBadge = isSellerMode ? `<span style="background:#27ae60; color:white; font-size:0.7rem; padding:2px 6px; border-radius:4px; margin-left:0.5rem">Precio Vendedor</span>` : '';

        card.innerHTML = `
            <div style="text-align:center; margin-bottom:1rem">
                <img src="${imgUrl}" alt="${product.brand}" style="width:100%; max-width:140px; height:85px; object-fit:contain">
            </div>
            <span class="brand-badge">${product.brand}</span>
            <h3 class="product-title">${product.name}</h3>
            <p class="product-desc" style="margin-bottom: 0.5rem">Pantalla original premium con garantía.</p>
            ${sellerBadge}
            <div class="price-row" style="margin-top:1rem">
                <span class="price">$${displayPrice.toLocaleString()}</span>
                <button class="btn-add" onclick="addToCart(${product.id})">Agregar</button>
            </div>
        `;
        productsGrid.appendChild(card);
    });
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    cart.push(product);
    updateCartUI();

    // Simple toast or feedback
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '✅ Añadido';
    btn.style.background = '#4cd137';
    btn.style.color = 'white';
    setTimeout(() => {
        btn.innerText = originalText;
        btn.style.background = 'white';
        btn.style.color = '#0a0a0c';
    }, 1000);
}

function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
    renderCartItems();
}

function updateCartUI() {
    cartBadge.innerText = cart.length;

    let total = 0;
    let individualCount = cart.filter(p => p.category === 'individual').length;

    cart.forEach(item => {
        let itemPrice = getPrice(item);
        // Aplicar descuento por pantalla si está habilitado en configuración Y es individual Y hay más de una en el carrito Y NO es modo vendedor
        if (!isSellerMode && storeConfig.discountEnabled && item.category === 'individual' && individualCount >= 2) {
            itemPrice -= storeConfig.discountAmount;
        }
        total += itemPrice;
    });

    cartTotalLabel.innerText = `$${total.toLocaleString()}`;
}

function renderCartItems() {
    cartItemsContainer.innerHTML = '';
    let individualCount = cart.filter(p => p.category === 'individual').length;

    cart.forEach((item, index) => {
        let finalPrice = getPrice(item);
        let discountNote = "";

        if (!isSellerMode && storeConfig.discountEnabled && item.category === 'individual' && individualCount >= 2) {
            finalPrice -= storeConfig.discountAmount;
            discountNote = `<span style="color:#4cd137; font-size:0.7rem">(-$${storeConfig.discountAmount.toLocaleString()} Combo Propio)</span>`;
        }

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div>
                <p style="font-weight:600">${item.name} ${discountNote}</p>
                <p style="font-size:0.8rem; color:#a0a0a0">$${finalPrice.toLocaleString()}</p>
            </div>
            <button onclick="removeFromCart(${index})" style="background:none; border:none; color:#ff4d00; cursor:pointer">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        cartItemsContainer.appendChild(div);
    });
}

function setupEventListeners() {
    // Tabs
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProducts(btn.dataset.tab);
        });
    });

    // Modal
    openCartBtn.addEventListener('click', () => {
        renderCartItems();
        if (isSellerMode) {
            document.getElementById('recurrent-client-container').style.display = 'none';
            document.getElementById('recurrent-client').checked = false;
            document.getElementById('new-client-form').style.display = 'block';

            // Populate Dropdown
            if (sellerClientSelector && sellerClientsDropdown) {
                sellerClientSelector.style.display = 'block';
                db.ref(`sellerSales/${currentSellerName}`).once('value').then(snap => {
                    const sales = snap.val();
                    sellerClientsDropdown.innerHTML = '<option value="">-- Nuevo Cliente / Escribir Manual --</option>';
                    if (sales) {
                        // Get unique clients
                        const uniqueClients = {};
                        Object.keys(sales).forEach(key => {
                            const cName = sales[key].clientName;
                            if (cName && !uniqueClients[cName]) {
                                uniqueClients[cName] = sales[key];
                            }
                        });

                        Object.values(uniqueClients).forEach(c => {
                            const opt = document.createElement('option');
                            // Store json in value to parse on select
                            opt.value = encodeURIComponent(JSON.stringify({ name: c.clientName, phone: c.clientPhone || '', city: c.clientCity || '' }));
                            opt.text = c.clientName;
                            sellerClientsDropdown.appendChild(opt);
                        });
                    }
                });
            }
        }
        cartModal.style.display = 'block';
    });

    if (sellerClientsDropdown) {
        sellerClientsDropdown.addEventListener('change', (e) => {
            if (!e.target.value) {
                // Clear fields if returning to empty
                document.getElementById('client-name').value = '';
                document.getElementById('client-phone').value = '';
                document.getElementById('client-city').value = '';
                return;
            }
            const data = JSON.parse(decodeURIComponent(e.target.value));
            document.getElementById('client-name').value = data.name;
            document.getElementById('client-phone').value = data.phone;
            document.getElementById('client-city').value = data.city;
        });
    }

    closeModalBtn.addEventListener('click', () => {
        cartModal.style.display = 'none';
    });

    openCodeBtn.addEventListener('click', () => {
        document.getElementById('code-loading').style.display = 'none';
        document.getElementById('code-result').style.display = 'none';
        document.getElementById('code-error').style.display = 'none';
        codeModal.style.display = 'block';
    });

    closeCodeBtn.addEventListener('click', () => {
        codeModal.style.display = 'none';
    });

    openVendedoresBtn.addEventListener('click', () => {
        if (isSellerMode) {
            renderSellerDashboard();
            sellerDashboardModal.style.display = 'block';
            return;
        }

        document.getElementById('seller-username').value = '';
        document.getElementById('seller-password').value = '';
        sellerModal.style.display = 'block';
    });

    if (openClientBtn) {
        openClientBtn.addEventListener('click', () => {
            if (clientPhoneLoggedIn) {
                renderClientDashboard();
                clientDashboardModal.style.display = 'block';
            } else {
                clientLoginModal.style.display = 'block';
            }
        });
    }

    closeSellerBtn.addEventListener('click', () => {
        sellerModal.style.display = 'none';
    });

    if (closeSellerDashBtn) {
        closeSellerDashBtn.addEventListener('click', () => {
            sellerDashboardModal.style.display = 'none';
        });
    }

    if (closeReminderBtn) {
        closeReminderBtn.addEventListener('click', () => {
            reminderEditorModal.style.display = 'none';
        });
    }

    if (logoutSellerBtn) {
        logoutSellerBtn.addEventListener('click', () => {
            if (confirm(`¿Deseas cerrar la sesión del vendedor "${currentSellerName}" y volver a los precios de cliente regular?`)) {
                localStorage.removeItem('isSellerMode');
                localStorage.removeItem('sellerName');
                window.location.reload();
            }
        });
    }

    if (sendReminderWhatsappBtn) {
        sendReminderWhatsappBtn.addEventListener('click', () => {
            const saleId = remindSaleIdInput.value;
            const newPhone = remindPhoneInput.value.replace(/\D/g, '');
            const rawMsg = remindMsgInput.value;

            if (saleId && newPhone && isSellerMode) {
                // Update specific phone field in Firebase for this sale if changed
                db.ref(`sellerSales/${currentSellerName}/${saleId}/clientPhone`).set(newPhone);
            }

            const phoneSegment = newPhone.length > 8 ? newPhone : '';
            const encoded = encodeURIComponent(rawMsg);

            if (phoneSegment) {
                window.open(`https://wa.me/${phoneSegment}?text=${encoded}`, '_blank');
            } else {
                window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
            }

            reminderEditorModal.style.display = 'none';
        });
    }

    if (closeClientLoginBtn) {
        closeClientLoginBtn.addEventListener('click', () => clientLoginModal.style.display = 'none');
    }
    if (closeClientDashBtn) {
        closeClientDashBtn.addEventListener('click', () => clientDashboardModal.style.display = 'none');
    }

    if (loginClientBtn) {
        loginClientBtn.addEventListener('click', () => {
            const phone = document.getElementById('client-login-phone').value.replace(/\D/g, '');
            if (!phone || phone.length < 5) return alert('Ingresa un número válido de celular sin espacios.');
            localStorage.setItem('clientPhone', phone);
            clientPhoneLoggedIn = phone;
            clientLoginModal.style.display = 'none';
            renderClientDashboard();
            clientDashboardModal.style.display = 'block';
        });
    }

    if (logoutClientBtn) {
        logoutClientBtn.addEventListener('click', () => {
            localStorage.removeItem('clientPhone');
            clientPhoneLoggedIn = '';
            clientDashboardModal.style.display = 'none';
            alert('Sesión cerrada. Vuelve pronto.');
        });
    }

    loginSellerBtn.addEventListener('click', () => {
        const uName = document.getElementById('seller-username').value.trim();
        const uPass = document.getElementById('seller-password').value.trim();

        if (!uName || !uPass) return alert('Por favor, ingresa un nombre y contraseña.');

        const sellers = storeConfig.sellers || [];

        const found = sellers.find(s => s.name.toLowerCase() === uName.toLowerCase() && s.password === uPass);

        if (found) {
            localStorage.setItem('isSellerMode', 'true');
            localStorage.setItem('sellerName', found.name);
            alert(`¡Bienvenido ${found.name}! Ahora cuentas con acceso a los precios mayoristas.`);
            window.location.reload();
        } else {
            alert('❌ Nombre o contraseña incorrectos.');
        }
    });

    const recurrentClientCheck = document.getElementById('recurrent-client');
    const newClientForm = document.getElementById('new-client-form');
    recurrentClientCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            newClientForm.style.display = 'none';
        } else {
            newClientForm.style.display = 'block';
        }
    });

    // Device constraint check (maximum 2)
    const deviceChecks = document.querySelectorAll('#client-devices input[type="checkbox"]');
    deviceChecks.forEach(chk => {
        chk.addEventListener('change', () => {
            const checkedCount = document.querySelectorAll('#client-devices input[type="checkbox"]:checked').length;
            if (checkedCount > 2) {
                chk.checked = false;
                alert('Solo puedes seleccionar un máximo de 2 opciones de dispositivos.');
            }
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === cartModal) cartModal.style.display = 'none';
        if (e.target === codeModal) codeModal.style.display = 'none';
        if (e.target === sellerModal) sellerModal.style.display = 'none';
        if (sellerDashboardModal && e.target === sellerDashboardModal) sellerDashboardModal.style.display = 'none';
        if (reminderEditorModal && e.target === reminderEditorModal) reminderEditorModal.style.display = 'none';
        if (clientLoginModal && e.target === clientLoginModal) clientLoginModal.style.display = 'none';
        if (clientDashboardModal && e.target === clientDashboardModal) clientDashboardModal.style.display = 'none';
    });

    // Code Fetch Logic (To be connected to Backend later)
    fetchCodeBtn.addEventListener('click', async () => {
        const email = document.getElementById('code-email').value.trim();
        const platform = document.getElementById('code-platform').value;

        if (!email) return alert('Por favor ingresa el correo de tu cuenta.');

        // 1. Mostrar estado de carga y ocultar error/resultado
        document.getElementById('code-loading').style.display = 'block';
        document.getElementById('code-result').style.display = 'none';
        document.getElementById('code-error').style.display = 'none';
        fetchCodeBtn.style.display = 'none';

        try {
            // El backend está corriendo en la nube (Render)
            const serverUrl = "https://streaming-backend-ce1u.onrender.com/api/get-code";

            const response = await fetch(serverUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, platform })
            });

            const data = await response.json();

            if (data.success && data.code) {
                document.getElementById('code-loading').style.display = 'none';
                document.getElementById('code-result').style.display = 'block';
                document.getElementById('the-magic-code').innerText = data.code;
            } else {
                // Caso Error / No encontrado
                document.getElementById('code-loading').style.display = 'none';
                document.getElementById('code-error').style.display = 'block';
                document.getElementById('error-msg').innerText = data.error || "Código no encontrado para este correo.";
            }
        } catch (err) {
            document.getElementById('code-loading').style.display = 'none';
            document.getElementById('code-error').style.display = 'block';
            document.getElementById('error-msg').innerText = "Oops, hubo un error de conexión con el servidor de correos.";
        } finally {
            fetchCodeBtn.style.display = 'block';
        }
    });

    // Checkout
    checkoutBtn.addEventListener('click', () => {
        if (cart.length === 0) return alert('Tu carrito está vacío');

        let isRecurrent = document.getElementById('recurrent-client').checked;
        let isRenewal = document.getElementById('is-renewal').checked;
        let cName = "";
        let cCity = "";
        let cPhone = "";
        let cDevices = [];

        if (!isRecurrent) {
            cName = document.getElementById('client-name').value.trim();
            cCity = document.getElementById('client-city').value.trim();
            cPhone = document.getElementById('client-phone').value.trim();
            const checkedDev = document.querySelectorAll('#client-devices input[type="checkbox"]:checked');
            checkedDev.forEach(c => cDevices.push(c.value));

            if (!cName) {
                return alert('Por favor, indica el nombre del cliente.');
            }
        }

        let total = 0;
        let individualCount = cart.filter(p => p.category === 'individual').length;
        let message = `🚀 *Nuevo Pedido - Streaming DPC*\n\n`;

        if (isRenewal) {
            message += `🔄 *ESTE PEDIDO ES UNA RENOVACIÓN*\n\n`;
        }

        if (!isRecurrent) {
            message += `*DATOS DEL CLIENTE*\n`;
            message += `👤 Nombre: ${cName}\n`;
            if (cPhone) message += `📱 Celular: ${cPhone}\n`;
            if (cCity) message += `🏙️ Ciudad: ${cCity}\n`;
            if (cDevices.length > 0) message += `💻 Dispositivos: ${cDevices.join(', ')}\n`;
            message += `--------------------\n`;
        } else {
            message += `✅ *Soy Cliente Registrado (Omitió datos)*\n`;
            message += `--------------------\n`;
        }

        if (isSellerMode) {
            message += `🔥 *Orden levantada por Vendedor:* ${currentSellerName}\n`;
        }

        message += `\nHola, me gustaría adquirir las siguientes pantallas:\n\n`;

        cart.forEach((item, i) => {
            let finalPrice = getPrice(item);
            if (!isSellerMode && storeConfig.discountEnabled && item.category === 'individual' && individualCount >= 2) {
                finalPrice -= storeConfig.discountAmount;
            }
            total += finalPrice;
            message += `${i + 1}. *${item.name}* - $${finalPrice.toLocaleString()}\n`;
        });

        if (!isSellerMode && storeConfig.discountEnabled && individualCount >= 2) {
            message += `\n✨ _Descuento de $${(individualCount * storeConfig.discountAmount).toLocaleString()} aplicado por combo personalizado._\n`;
        }

        message += `\n💰 *Total a pagar:* $${total.toLocaleString()}\n\n`;
        message += `${storeConfig.paymentInfo}\n\n`;
        message += `Quedo atento a la activación de mis pantallas.`;

        // Guardar venta en base de datos
        if (!isRecurrent) {
            const saleData = {
                clientName: cName,
                clientCity: cCity,
                clientPhone: cPhone,
                date: Date.now(),
                expirationDate: Date.now() + (30 * 24 * 60 * 60 * 1000), // +30 days
                items: cart.map(item => ({ id: item.id, name: item.name })),
                sellerName: isSellerMode ? currentSellerName : 'Página Web Oficial'
            };

            if (isSellerMode) {
                db.ref(`sellerSales/${currentSellerName}`).push(saleData);
            }

            // Always save to client historical indexed by their clean phone
            const cleanPhoneTracking = cPhone ? cPhone.replace(/\D/g, '') : '';
            if (cleanPhoneTracking && cleanPhoneTracking.length > 5) {
                db.ref(`clientSales/${cleanPhoneTracking}`).push(saleData);
            }
        }

        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/${storeConfig.whatsappNumber}?text=${encoded}`, '_blank');
    });
}

function renderSellerDashboard() {
    if (!sellerSalesList) return;
    sellerSalesList.innerHTML = '<p style="text-align:center; color:#ccc;">Cargando tus ventas...</p>';

    db.ref(`sellerSales/${currentSellerName}`).once('value').then(snap => {
        const sales = snap.val();
        sellerSalesList.innerHTML = '';
        if (!sales) {
            sellerSalesList.innerHTML = '<p style="text-align:center; color:#ccc; margin-top:2rem;">Aún no tienes ventas registradas.</p>';
            return;
        }

        // Convert to array and sort by latest date first
        const salesArray = Object.keys(sales).map(k => ({ id: k, ...sales[k] })).sort((a, b) => b.date - a.date);

        salesArray.forEach(sale => {
            const now = Date.now();
            const daysLeft = Math.ceil((sale.expirationDate - now) / (1000 * 60 * 60 * 24));

            let statusColor = '#4cd137'; // Active
            if (daysLeft <= 3 && daysLeft >= 0) statusColor = '#f39c12'; // Ending soon
            if (daysLeft < 0) statusColor = '#ff4d4d'; // Expired

            const div = document.createElement('div');
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.border = `1px solid ${statusColor}`;
            div.style.padding = '1rem';
            div.style.borderRadius = '8px';

            const itemsStr = sale.items ? sale.items.map(i => i.name).join(', ') : 'Pantallas';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem; flex-wrap:wrap; gap:0.5rem;">
                    <strong style="color:white; font-size:1.1rem;">${sale.clientName}</strong>
                    <span style="background:${statusColor}; color:white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:bold;">
                        ${daysLeft >= 0 ? `Vence en ${daysLeft} días` : 'Vencida'}
                    </span>
                </div>
                <!-- Fechas de Inicio y Fin -->
                <div style="display:flex; justify-content:space-between; color:#a0a0a0; font-size:0.8rem; margin-bottom:0.8rem; background:rgba(0,0,0,0.2); padding: 5px; border-radius:6px;">
                    <span><i class="fa-regular fa-calendar-check" style="color:#4cd137;"></i> Inicio: ${new Date(sale.date).toLocaleDateString()}</span>
                    <span><i class="fa-regular fa-calendar-xmark" style="color:#ff4d4d;"></i> Fin: ${new Date(sale.expirationDate).toLocaleDateString()}</span>
                </div>
                <div style="display:flex; justify-content:space-between; color:#ccc; font-size:0.85rem; margin-bottom:0.5rem;">
                    <span><i class="fa-solid fa-mobile-screen"></i> ${sale.clientPhone || 'No registrado'}</span>
                    <span>📍 ${sale.clientCity || 'Ciudad N/A'}</span>
                </div>
                <p style="font-size:0.85rem; color:var(--text-primary); margin-bottom:1rem;">📺 ${itemsStr}</p>
                <div style="display:flex; gap: 0.5rem; flex-wrap:wrap;">
                    <button onclick="renewFromDash('${sale.clientName}', '${sale.clientPhone}', '${sale.clientCity}', '${encodeURIComponent(JSON.stringify(sale.items || []))}')" 
                        style="flex: 1; padding:0.6rem; border-radius:8px; cursor:pointer; font-weight:bold; border:none; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color:black;">
                        <i class="fa-solid fa-redo"></i> Renovar
                    </button>
                    <button onclick="sendReminderFromDash('${sale.id}', '${sale.clientName}', '${sale.clientPhone || ''}', '${encodeURIComponent(itemsStr)}')" 
                        style="flex: 1; padding:0.6rem; border-radius:8px; cursor:pointer; font-weight:bold; border:1px solid #4cd137; background: rgba(76, 209, 55, 0.1); color:#4cd137;">
                        <i class="fa-brands fa-whatsapp"></i> Recordar
                    </button>
                </div>
            `;
            sellerSalesList.appendChild(div);
        });
    });
}

window.renewFromDash = function (cName, cPhone, cCity, itemsJsonEncoded) {
    try {
        const itemsToRenew = JSON.parse(decodeURIComponent(itemsJsonEncoded));

        cart = [];
        itemsToRenew.forEach(i => {
            const found = products.find(p => p.name === i.name || p.id === i.id);
            if (found) cart.push(found);
        });

        if (cart.length === 0) {
            alert("No se pudieron encontrar las pantallas en el catálogo actual para renovar.");
            return;
        }

        updateCartUI();

        // Open Cart, pre-fill
        document.getElementById('is-renewal').checked = true;
        document.getElementById('client-name').value = cName !== 'undefined' ? cName : '';
        document.getElementById('client-phone').value = cPhone !== 'undefined' ? cPhone : '';
        document.getElementById('client-city').value = cCity !== 'undefined' ? cCity : '';

        if (sellerDashboardModal) sellerDashboardModal.style.display = 'none';

        renderCartItems();
        if (isSellerMode) {
            document.getElementById('recurrent-client-container').style.display = 'none';
            document.getElementById('new-client-form').style.display = 'block';
            document.getElementById('recurrent-client').checked = false;
        }
        cartModal.style.display = 'block';

    } catch (e) {
        alert('Error al armar el carrito de renovación.');
        console.error(e);
    }
}

window.sendReminderFromDash = function (saleId, cName, cPhone, itemsEncoded) {
    if (!reminderEditorModal) return;

    const items = decodeURIComponent(itemsEncoded);
    let template = storeConfig.reminderTemplate || "Hola {cliente} 😊 Buen dia\nTU {pantallas} finaliza \n👉 *HOY* 👈\n👉 😱... \n⚠️ Si deseas continuar, realiza el pago y me envías la foto del comprobante🧾 (sin comprobante no cuenta como pago válido) ⚠️\n\n*Medios de Pago:*\n*Nequi o Daviplata 3155182545*\n\n*Llave Nequi @NEQUICEC36* \n*Llave Daviplata @PLATA3155182545* \n*Llave Nu @CMA736*\n*Llave Be @BE346516*";

    // Replace variables
    let msg = template.replace(/{cliente}/g, cName).replace(/{pantallas}/g, items);

    remindSaleIdInput.value = saleId;
    remindPhoneInput.value = cPhone || '';
    remindMsgInput.value = msg;

    reminderEditorModal.style.display = 'block';
}

function renderClientDashboard() {
    if (!clientSalesList || !clientPhoneLoggedIn) return;
    clientSalesList.innerHTML = '<p style="text-align:center; color:#ccc;">Buscando tus compras...</p>';

    db.ref(`clientSales/${clientPhoneLoggedIn}`).once('value').then(snap => {
        const sales = snap.val();
        clientSalesList.innerHTML = '';
        if (!sales) {
            clientSalesList.innerHTML = '<p style="text-align:center; color:#ccc; margin-top:2rem;">No tienes compras registradas aún.</p>';
            return;
        }

        const salesArray = Object.keys(sales).map(k => ({ id: k, ...sales[k] })).sort((a, b) => b.date - a.date);

        salesArray.forEach(sale => {
            const now = Date.now();
            const daysLeft = Math.ceil((sale.expirationDate - now) / (1000 * 60 * 60 * 24));

            let statusColor = '#4cd137'; // Active
            if (daysLeft <= 3 && daysLeft >= 0) statusColor = '#f39c12'; // Ending soon
            if (daysLeft < 0) statusColor = '#ff4d4d'; // Expired

            const div = document.createElement('div');
            div.style.background = 'rgba(255,255,255,0.05)';
            div.style.border = `1px solid ${statusColor}`;
            div.style.padding = '1rem';
            div.style.borderRadius = '8px';

            const itemsStr = sale.items ? sale.items.map(i => i.name).join(', ') : 'Pantallas';
            const sellerAttribution = sale.sellerName && sale.sellerName !== 'Página Web Oficial' ? `<span style="font-size:0.75rem; color:#a0a0a0; display:block; margin-bottom:0.5rem;">Atendido por: ${sale.sellerName}</span>` : '';

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem; flex-wrap:wrap; gap:0.5rem;">
                    <strong style="color:white; font-size:1.1rem;">${sale.clientName}</strong>
                    <span style="background:${statusColor}; color:white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:bold;">
                        ${daysLeft >= 0 ? `Vence en ${daysLeft} días` : 'Vencida'}
                    </span>
                </div>
                ${sellerAttribution}
                <div style="display:flex; justify-content:space-between; color:#a0a0a0; font-size:0.8rem; margin-bottom:0.8rem; background:rgba(0,0,0,0.2); padding: 5px; border-radius:6px;">
                    <span><i class="fa-regular fa-calendar-check" style="color:#4cd137;"></i> ${new Date(sale.date).toLocaleDateString()}</span>
                    <span><i class="fa-regular fa-calendar-xmark" style="color:#ff4d4d;"></i> ${new Date(sale.expirationDate).toLocaleDateString()}</span>
                </div>
                <p style="font-size:0.85rem; color:var(--text-primary); margin-bottom:1rem;">📺 ${itemsStr}</p>
                <div style="display:flex; gap: 0.5rem; flex-wrap:wrap;">
                    <button onclick="renewFromDash('${sale.clientName}', '${sale.clientPhone || clientPhoneLoggedIn}', '${sale.clientCity || ''}', '${encodeURIComponent(JSON.stringify(sale.items || []))}')" 
                        style="width: 100%; padding:0.6rem; border-radius:8px; cursor:pointer; font-weight:bold; border:none; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); color:black;">
                        <i class="fa-solid fa-redo"></i> Renovar mis pantallas
                    </button>
                </div>
            `;
            clientSalesList.appendChild(div);
        });
    });
}

// Firebase Initialization and Loading Logic
db.ref('/').once('value').then(snap => {
    let data = snap.val();
    if (!data) {
        console.log("Database vacia, migrando de localstorage...");
        // Migrar LocalStorage a Firebase la primera vez
        let oldConfig = JSON.parse(localStorage.getItem('storeConfig'));
        let oldProducts = JSON.parse(localStorage.getItem('products'));

        if (!oldConfig) {
            oldConfig = {
                whatsappNumber: "573155182545",
                paymentInfo: "*Medios de pago:*\n💳 Nequi o Daviplata: 3155182545\n🔑 Llave Nequi @NEQUICEC36\n🔑 Llave Daviplata @PLATA3155182545\n🔑 Llave Nu @CMA736\n🔑 Llave Be @BE346516",
                discountEnabled: true,
                discountAmount: 1000,
                netflixEnabled: true,
                disneyEnabled: true,
                sellers: [],
                estrenos: []
            };
        }
        if (!oldProducts || oldProducts.length === 0) {
            oldProducts = [
                { id: 1, name: "Netflix Premium 1️⃣ Pantalla", price: 16000, category: "individual", brand: "Netflix", image: "assets/netflix.png" },
                { id: 11, name: "Netflix Premium + Disney Premium", price: 27000, category: "combos2", brand: "Combo", image: "assets/logo_combo.jpg" }
            ];
        }

        data = { storeConfig: oldConfig, products: oldProducts };
        db.ref('/').set(data);
    }

    // Configurar observador en vivo (Live sync)
    db.ref('/').on('value', (snapshot) => {
        let val = snapshot.val();
        if (val) {
            storeConfig = val.storeConfig || {};
            products = val.products || [];

            if (!window.appInitialized) {
                window.appInitialized = true;
                init(); // Iniciar UI y Listeners por primera y unica vez
            } else {
                // Actualizar UI en vivo si hubo algun cambio desde el admin backend
                setupConfigUI();
                const activeTabBtn = document.querySelector('.tab-btn.active');
                if (activeTabBtn) renderProducts(activeTabBtn.dataset.tab);
                updateCartUI();
                renderCartItems();
            }
        }
    });
});
