const fs = require('fs');

let code = fs.readFileSync('admin.html', 'utf8');

let searchStr = "const reminderFunc = isSellerSale ? 'sendAdminReminderToSeller' : 'sendAdminReminderToDirectClient';\r\n            const firstArg = isSellerSale ? encodeURIComponent(sale.sellerName) : safeClientName;\r\n\r\n            let buttonsHtml = `\r\n                <div style=\"display:flex; gap:0.5rem; flex-wrap: wrap;\">\r\n                    <button onclick=\"${reminderFunc}('${firstArg}', '${encodeURIComponent(safeClientName)}', '${encodeURIComponent(itemsStr)}', '${clientObj.phone}', ${sale.total || 0})\"";

let replaceStr = `let reminderOnclick = '';
            if (isSellerSale) {
                reminderOnclick = \`sendAdminReminderToSeller('\${encodeURIComponent(sale.sellerName)}', '\${encodeURIComponent(safeClientName)}', '\${encodeURIComponent(itemsStr)}', '\${clientObj.phone}', \${sale.total || 0})\`;
            } else {
                reminderOnclick = \`sendAdminReminderToDirectClient('\${encodeURIComponent(safeClientName)}', '\${encodeURIComponent(itemsStr)}', '\${clientObj.phone}', \${sale.total || 0})\`;
            }

            let buttonsHtml = \`
                <div style="display:flex; gap:0.5rem; flex-wrap: wrap;">
                    <button onclick="\${reminderOnclick}"`;

code = code.replace(searchStr, replaceStr);

// Fallback search without \r if previous fails
let searchStr2 = "const reminderFunc = isSellerSale ? 'sendAdminReminderToSeller' : 'sendAdminReminderToDirectClient';\n            const firstArg = isSellerSale ? encodeURIComponent(sale.sellerName) : safeClientName;\n\n            let buttonsHtml = `\n                <div style=\"display:flex; gap:0.5rem; flex-wrap: wrap;\">\n                    <button onclick=\"${reminderFunc}('${firstArg}', '${encodeURIComponent(safeClientName)}', '${encodeURIComponent(itemsStr)}', '${clientObj.phone}', ${sale.total || 0})\"";
code = code.replace(searchStr2, replaceStr);


fs.writeFileSync('admin.html', code);

console.log("Fixed args");
