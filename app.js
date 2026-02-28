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

let isSellerMode = localStorage.getItem('isSellerMode') === 'true';
let currentSellerName = localStorage.getItem('sellerName') || '';

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
                <img src="${imgUrl}" alt="${product.brand}" style="width:100%; max-width:100px; height:60px; object-fit:contain">
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
        // Aplicar descuento por pantalla si está habilitado en configuración Y es individual Y hay más de una en el carrito
        if (storeConfig.discountEnabled && item.category === 'individual' && individualCount >= 2) {
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

        if (storeConfig.discountEnabled && item.category === 'individual' && individualCount >= 2) {
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
        cartModal.style.display = 'block';
    });

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
            if (confirm(`¿Deseas cerrar la sesión del vendedor "${currentSellerName}" y volver a los precios de cliente regular?`)) {
                localStorage.removeItem('isSellerMode');
                localStorage.removeItem('sellerName');
                window.location.reload();
            }
            return;
        }

        document.getElementById('seller-username').value = '';
        document.getElementById('seller-password').value = '';
        sellerModal.style.display = 'block';
    });

    closeSellerBtn.addEventListener('click', () => {
        sellerModal.style.display = 'none';
    });

    loginSellerBtn.addEventListener('click', () => {
        const uName = document.getElementById('seller-username').value.trim();
        const uPass = document.getElementById('seller-password').value.trim();

        if (!uName || !uPass) return alert('Por favor, ingresa un nombre y contraseña.');

        // Re-leer la configuración fresca en caso de que acaben de crearlo en admin.html en otra pestaña
        const freshConfig = JSON.parse(localStorage.getItem('storeConfig')) || {};
        const sellers = freshConfig.sellers || storeConfig.sellers || [];

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
        let cName = "";
        let cCity = "";
        let cDevices = [];

        if (!isRecurrent) {
            cName = document.getElementById('client-name').value.trim();
            cCity = document.getElementById('client-city').value.trim();
            const checkedDev = document.querySelectorAll('#client-devices input[type="checkbox"]:checked');
            checkedDev.forEach(c => cDevices.push(c.value));

            if (!cName || !cCity) {
                return alert('Por favor, si eres cliente nuevo, llena tu Nombre y Ciudad como mínimo.');
            }
        }

        let total = 0;
        let individualCount = cart.filter(p => p.category === 'individual').length;
        let message = `🚀 *Nuevo Pedido - Streaming DPC*\n\n`;

        if (!isRecurrent) {
            message += `*DATOS DEL CLIENTE NUEVO*\n`;
            message += `👤 Nombre: ${cName}\n`;
            message += `🏙️ Ciudad: ${cCity}\n`;
            if (cDevices.length > 0) message += `📱 Dispositivos: ${cDevices.join(', ')}\n`;
            message += `--------------------\n`;
        } else {
            message += `✅ *Soy Cliente Registrado*\n`;
            message += `--------------------\n`;
        }

        if (isSellerMode) {
            message += `🔥 *Orden levantada por Vendedor:* ${currentSellerName}\n`;
        }

        message += `\nHola, me gustaría adquirir las siguientes pantallas:\n\n`;

        cart.forEach((item, i) => {
            let finalPrice = getPrice(item);
            if (storeConfig.discountEnabled && item.category === 'individual' && individualCount >= 2) {
                finalPrice -= storeConfig.discountAmount;
            }
            total += finalPrice;
            message += `${i + 1}. *${item.name}* - $${finalPrice.toLocaleString()}\n`;
        });

        if (storeConfig.discountEnabled && individualCount >= 2) {
            message += `\n✨ _Descuento de $${(individualCount * storeConfig.discountAmount).toLocaleString()} aplicado por combo personalizado._\n`;
        }

        message += `\n💰 *Total a pagar:* $${total.toLocaleString()}\n\n`;
        message += `${storeConfig.paymentInfo}\n\n`;
        message += `Quedo atento a la activación de mis pantallas.`;

        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/${storeConfig.whatsappNumber}?text=${encoded}`, '_blank');
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
