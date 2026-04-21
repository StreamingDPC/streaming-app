const fs = require('fs');

function fixFile(file) {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/const baseUrl = isMobile \? 'https:\/\/api.whatsapp.com\/send' : 'https:\/\/web.whatsapp.com\/send';\s*let url = baseUrl \+ '\?text=' \+ encodeURIComponent\(text\);/g, `let url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);`);
    code = code.replace(/const isMobile = \/iPhone\|iPad\|iPod\|Android\/i\.test\(navigator\.userAgent\);\s*/g, '');
    fs.writeFileSync(file, code);
}

fixFile('admin.html');
fixFile('app.js');
console.log('Fixed URLs');
