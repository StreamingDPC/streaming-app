let storeConfig = JSON.parse(localStorage.getItem('storeConfig')) || {
    whatsappNumber: "573155182545",
    paymentInfo: `*Medios de pago:*\n💳 Nequi o Daviplata: 3155182545\n🔑 Llave Nequi @NEQUICEC36\n🔑 Llave Daviplata @PLATA3155182545\n🔑 Llave Nu @CMA736\n🔑 Llave Be @BE346516`,
    discountEnabled: true,
    discountAmount: 1000
};

// Cargar de localStorage si existe, si no usar los por defecto
let products = JSON.parse(localStorage.getItem('products'));
if (!products || products.length === 0) {
    products = [
        // INDIVIDUALES
        { id: 1, name: "Netflix Premium 1️⃣ Pantalla", price: 16000, category: "individual", brand: "Netflix", image: "assets/netflix.png" },
        { id: 2, name: "Netflix Privada 1️⃣ Pantalla", price: 17000, category: "individual", brand: "Netflix", image: "assets/netflix.png" },
        { id: 3, name: "Prime Video Premium 1️⃣ Pantalla", price: 9000, category: "individual", brand: "Prime Video", image: "assets/prime.png" },
        { id: 4, name: "Disney Original Premium 1️⃣ Pantalla", price: 13000, category: "individual", brand: "Disney+", image: "assets/disney.svg" },
        { id: 5, name: "Max Premium 1️⃣ Pantalla", price: 13000, category: "individual", brand: "Max", image: "assets/max.svg" },
        { id: 6, name: "Paramount Premium 1️⃣ Pantalla", price: 9000, category: "individual", brand: "Paramount", image: "assets/paramount.svg" },
        { id: 7, name: "IPTV 1️⃣ Pantalla", price: 18000, category: "individual", brand: "IPTV", image: "assets/iptv.png" },
        { id: 8, name: "Vix Premium 1️⃣ Pantalla", price: 9000, category: "individual", brand: "Vix", image: "assets/vix.png" },
        { id: 9, name: "Crunchyroll Premium 1️⃣ Pantalla", price: 12000, category: "individual", brand: "Crunchyroll", image: "assets/crunchyroll.png" },
        { id: 10, name: "Apple Tv Premium 1️⃣ Pantalla", price: 18000, category: "individual", brand: "Apple TV", image: "assets/appletv.png" },

        // COMBOS (Incluyo algunos representativos, el admin puede agregar más)
        { id: 11, name: "Netflix Premium + Disney Premium", price: 27000, category: "combos2", brand: "Combo", image: "assets/logo_combo.jpg" },
        { id: 12, name: "Netflix Privada + Disney Premium", price: 28000, category: "combos2", brand: "Combo", image: "assets/logo_combo.jpg" },
        { id: 39, name: "NF Prem + Disney + HBO Max", price: 39000, category: "combos3", brand: "Combo", image: "assets/logo_combo.jpg" },
        { id: 49, name: "NF Prem + Disney + HBO + Prime", price: 47000, category: "combos4", brand: "Combo", image: "assets/logo_combo.jpg" },
        { id: 54, name: "NF Prem + Dis + HBO + Par + Prime", price: 55000, category: "combos5", brand: "Combo", image: "assets/logo_combo.jpg" }
    ];
    localStorage.setItem('products', JSON.stringify(products));
}

// Migración: Si el usuario ya tiene productos en localStorage, actualizar logos
products = products.map(p => {
    // Si ya tiene un path local 'assets/' saltamos esto general, a menos que queramos forzarlo:
    if (p.brand === 'Netflix') p.image = 'assets/netflix.png';
    if (p.brand === 'Prime Video') p.image = 'assets/prime.png';
    if (p.brand === 'Disney+') p.image = 'assets/disney.svg';
    if (p.brand === 'HBO Max' || p.brand === 'Max') {
        p.brand = 'Max';
        p.name = p.name.replace('Hbo Max', 'Max');
        p.image = 'assets/max.svg';
    }
    if (p.brand === 'Paramount') p.image = 'assets/paramount.svg';
    if (p.brand === 'IPTV') p.image = 'assets/iptv.png';
    if (p.brand === 'Vix') p.image = 'assets/vix.png';
    if (p.brand === 'Crunchyroll') p.image = 'assets/crunchyroll.png';
    if (p.brand === 'Apple TV') p.image = 'assets/appletv.png';
    if (p.brand === 'Combo') p.image = 'assets/logo_combo.jpg';

    return p;
});
localStorage.setItem('products', JSON.stringify(products));

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
function init() {
    renderProducts('all');
    setupEventListeners();
}

function renderProducts(category) {
    productsGrid.innerHTML = '';
    const filtered = category === 'all'
        ? products.filter(p => p.active !== false)
        : products.filter(p => p.category === category && p.active !== false);

    filtered.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        // Usar imagen por defecto si no tiene
        const imgUrl = product.image || 'https://img.icons8.com/color/96/movie.png';
        card.innerHTML = `
            <div style="text-align:center; margin-bottom:1rem">
                <img src="${imgUrl}" alt="${product.brand}" style="width:100%; max-width:100px; height:60px; object-fit:contain">
            </div>
            <span class="brand-badge">${product.brand}</span>
            <h3 class="product-title">${product.name}</h3>
            <p class="product-desc">Pantalla original premium con garantía.</p>
            <div class="price-row">
                <span class="price">$${product.price.toLocaleString()}</span>
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
        let itemPrice = item.price;
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
        let finalPrice = item.price;
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

    window.addEventListener('click', (e) => {
        if (e.target === cartModal) cartModal.style.display = 'none';
        if (e.target === codeModal) codeModal.style.display = 'none';
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
            // El backend estará corriendo en la nube pronto, por ahora en localhost
            const serverUrl = "http://localhost:3000/api/get-code";

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

        let total = 0;
        let individualCount = cart.filter(p => p.category === 'individual').length;
        let message = `🚀 *Nuevo Pedido - Streaming DPC*\n\n`;
        message += `Hola, me gustaría adquirir las siguientes pantallas:\n\n`;

        cart.forEach((item, i) => {
            let finalPrice = item.price;
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

init();
