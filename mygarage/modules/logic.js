// ========== КОНСОЛЬ ==========
const bootConsole = document.getElementById("bootConsole");

function bootLog(text, type = "info") {
    const line = document.createElement("div");
    line.className = "boot-line";
    if (type === "error") line.style.color = "#ff4444";
    else if (type === "progress") line.style.color = "#ffff00";
    else line.style.color = "#00ff41";
    line.innerHTML = `> ${text}`;
    bootConsole.appendChild(line);
    line.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function bootProgressBar(percent) {
    const bar = document.createElement("div");
    bar.className = "boot-line";
    const full = 30;
    const filled = Math.floor(percent / (100 / full));
    const empty = full - filled;
    bar.innerHTML = `> [${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
    bootConsole.appendChild(bar);
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function loadModule(name, url) {
    bootLog(`Загрузка ${name}.txt...`);
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        bootLog(`✅ ${name}.txt загружен`, "success");
        return text;
    } catch(e) {
        bootLog(`❌ ${name}.txt не найден! Путь: ${url}`, "error");
        return null;
    }
}

function parseCars(text) {
    return text.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
        const [id, name, price, rarity, year, country, type] = l.split(',');
        return { id, name, basePrice: parseInt(price), rarity: parseFloat(rarity), year: parseInt(year), country, type };
    });
}

function parseTuning(text) {
    return text.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
        const [category, part, type, multiplier, forCar] = l.split(',');
        return { category, part, type, multiplier: parseFloat(multiplier), forCar: forCar || '*' };
    });
}

function parseRacers(text) {
    return text.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
        const [name, reaction, control, price] = l.split(',');
        return { name, reaction: parseInt(reaction), control: parseInt(control), price: parseInt(price) };
    });
}

function parsePolice(text) {
    return text.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
        const [service, price, desc] = l.split(',');
        return { service, price: parseInt(price), desc };
    });
}

// ========== ГЛОБАЛЬНЫЕ ДАННЫЕ ==========
let carsData = [], tuningData = [], racersData = [], policeData = [];
let money = 1500000;
let garage = Array(6).fill(null);
let warehouse = [];
let currentCarIndex = null;
let currentTab = "motor";

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function rand(min, max) { return Math.floor(Math.random() * (max - min) + min); }

function showToast(msg, isError = false) {
    const toast = document.createElement("div");
    toast.className = "game-toast";
    toast.style.borderLeftColor = isError ? "#ef4444" : "#3b82f6";
    toast.innerHTML = `<span>${isError ? "⚠️" : "✅"} ${msg}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showConfirm(msg, onYes) {
    const modal = document.createElement("div");
    modal.className = "fixed inset-0 modal-bg flex items-center justify-center z-[100]";
    modal.innerHTML = `<div class="bg-slate-800 p-6 rounded-xl max-w-md"><p class="mb-4 text-white">${msg}</p><div class="flex gap-3 justify-end"><button class="yes bg-green-700 px-4 py-2 rounded">✅ Да</button><button class="no bg-red-700 px-4 py-2 rounded">❌ Нет</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector(".yes").onclick = () => { modal.remove(); onYes(); };
    modal.querySelector(".no").onclick = () => modal.remove();
}

function getPartPrice(carCountry, category, partName, tuningMultiplier = 1) {
    let base = category === "motor" ? 8000 : category === "body" ? 3000 : 5000;
    const priceMulti = { ru: 0.7, de: 1.0, jp: 1.1 };
    return Math.floor(base * (priceMulti[carCountry] || 1.0) * tuningMultiplier);
}

function createCar(modelId, isRare = false) {
    const model = carsData.find(c => c.id === modelId);
    const parts = { motor: {}, body: {}, susp: {} };
    const chance = isRare ? 0.85 : 0.35;
    const colors = ["Белый","Синий","Красный","Зелёный","Жёлтый","Чёрный","Серебристый"];
    const ptcColor = colors[rand(0, colors.length)];
    
    const motorParts = ["Блок","Поршневая","Коленвал","ГБЦ","ГРМ","Топливная","Впуск/выпуск","Сцепление"];
    const bodyParts = ["Передний бампер","Задний бампер","Фары","Дверь перед.левая","Дверь перед.правая","Дверь зад.левая","Дверь зад.правая","Багажник"];
    const suspParts = ["Пружины","Амортизаторы","Рычаги","КПП","Передняя ось","Задняя ось","Тормоза передние","Тормоза задние"];
    
    for (let p of motorParts) {
        if (Math.random() < chance) {
            parts.motor[p] = { type: "Сток", condition: rand(30, 85) };
        }
    }
    for (let p of bodyParts) {
        if (Math.random() < chance) {
            parts.body[p] = { type: "Сток", condition: rand(30, 85), color: colors[rand(0, colors.length)] };
        }
    }
    for (let p of suspParts) {
        if (Math.random() < chance) {
            parts.susp[p] = { type: "Сток", condition: rand(30, 85) };
        }
    }
    
    return { ...model, parts, ptcColor, hasTuning: false };
}

function allBodySameColor(car) {
    const bodyParts = Object.values(car.parts.body).filter(p => p);
    if (bodyParts.length === 0) return false;
    const firstColor = bodyParts[0].color;
    return bodyParts.every(p => p.color === firstColor);
}

function hasAnyTuning(car) {
    for (let cat of ["motor", "body", "susp"]) {
        for (let p of Object.values(car.parts[cat])) {
            if (p && p.type !== "Сток") return true;
        }
    }
    return false;
}

function carPrice(car) {
    let motorVals = Object.values(car.parts.motor).filter(p => p).map(p => p.condition);
    let bodyVals = Object.values(car.parts.body).filter(p => p).map(p => p.condition);
    let suspVals = Object.values(car.parts.susp).filter(p => p).map(p => p.condition);
    let avgEngine = motorVals.length ? motorVals.reduce((a,b)=>a+b,0)/motorVals.length : 0;
    let avgBody = bodyVals.length ? bodyVals.reduce((a,b)=>a+b,0)/bodyVals.length : 0;
    let avgSusp = suspVals.length ? suspVals.reduce((a,b)=>a+b,0)/suspVals.length : 0;
    let tuningBonus = hasAnyTuning(car) ? 1.3 : 1.0;
    let price = Math.floor(car.basePrice * (avgEngine/100) * (avgBody/100) * (avgSusp/100) * car.rarity * tuningBonus);
    return price > 0 ? price : 1000;
}

function renderGarage() {
    const grid = document.getElementById("garageGrid");
    grid.innerHTML = garage.map((car, i) => {
        if (car) {
            return `<div class="garage-slot" data-i="${i}"><div class="font-bold text-white">${car.name}</div><div class="text-xs text-gray-300">${car.year} г.</div><div class="text-green-400 text-sm">💰 ${carPrice(car).toLocaleString()}₽</div></div>`;
        } else {
            return `<div class="garage-slot" data-i="${i}"><div class="font-bold text-white">🚫 Пусто</div></div>`;
        }
    }).join('');
    document.querySelectorAll(".garage-slot").forEach(slot => {
        slot.addEventListener("dblclick", () => {
            const idx = parseInt(slot.dataset.i);
            if (garage[idx]) openCarMenu(idx);
        });
    });
}

function openCarMenu(idx) {
    currentCarIndex = idx;
    const car = garage[idx];
    document.getElementById("carTitle").innerHTML = `🚘 ${car.name}`;
    document.getElementById("carModal").classList.remove("hidden");
    renderCarMenu();
}

function renderCarMenu() {
    const car = garage[currentCarIndex];
    let html = `<h3 class="font-bold mb-2">${currentTab === "motor" ? "🔧 Мотор" : currentTab === "body" ? "🎨 Кузов" : "🛞 Ходовая"}</h3>`;
    let partsList = currentTab === "motor" ? ["Блок","Поршневая","Коленвал","ГБЦ","ГРМ","Топливная","Впуск/выпуск","Сцепление"] :
                    currentTab === "body" ? ["Передний бампер","Задний бампер","Фары","Дверь перед.левая","Дверь перед.правая","Дверь зад.левая","Дверь зад.правая","Багажник"] :
                    ["Пружины","Амортизаторы","Рычаги","КПП","Передняя ось","Задняя ось","Тормоза передние","Тормоза задние"];
    
    for (let p of partsList) {
        const part = car.parts[currentTab][p];
        const has = !!part;
        let display = has ? `${part.type} (${part.condition}%)` : "None";
        if (currentTab === "body" && has && part.color) display += ` ${part.color}`;
        let options = `<option value="none" ${!has ? "selected" : ""}>None</option>`;
        if (has) options += `<option value="stock" selected>${display}</option>`;
        
        const compatible = warehouse.filter(w => w.category === currentTab && w.name === p && w.forCar === car.id);
        compatible.forEach((w, idx) => {
            options += `<option value="ware_${idx}">📦 ${w.name} (${w.condition}%)</option>`;
        });
        
        const tuningForPart = tuningData.filter(t => t.category === currentTab && t.part === p && (t.forCar === "*" || t.forCar === car.id));
        tuningForPart.forEach(t => {
            if (!has || t.type !== part.type) {
                options += `<option value="tune_${t.type}">🔧 ${t.type}</option>`;
            }
        });
        
        html += `<div class="flex justify-between border-b border-gray-700 py-2"><span>${p}</span><select data-part="${p}" class="bg-gray-700 rounded px-2 py-1">${options}</select></div>`;
    }
    
    if (currentTab === "body") {
        const colors = ["Белый","Синий","Красный","Зелёный","Жёлтый","Чёрный","Серебристый"];
        html += `<div class="mt-3 flex gap-2 flex-wrap"><span>Покрасить весь кузов:</span>${colors.map(c => `<button data-paint-all="${c}" class="bg-gray-700 px-2 py-1 rounded text-sm">${c}</button>`).join('')}</div>`;
    }
    
    document.getElementById("carContent").innerHTML = html;
    
    document.querySelectorAll("#carContent select").forEach(sel => {
        sel.onchange = () => {
            const partName = sel.dataset.part;
            const val = sel.value;
            const oldPart = car.parts[currentTab][partName];
            if (val === "none") {
                if (oldPart) warehouse.push({ name: partName, forCar: car.id, condition: oldPart.condition, category: currentTab });
                delete car.parts[currentTab][partName];
            } else if (val.startsWith("ware_")) {
                const idx = parseInt(val.split("_")[1]);
                const w = warehouse[idx];
                if (w) {
                    if (oldPart) warehouse.push({ name: partName, forCar: car.id, condition: oldPart.condition, category: currentTab });
                    car.parts[currentTab][partName] = { type: w.name, condition: w.condition, color: currentTab === "body" ? w.color : null };
                    warehouse.splice(idx, 1);
                }
            } else if (val.startsWith("tune_")) {
                const tuneType = val.split("_")[1];
                if (oldPart) warehouse.push({ name: partName, forCar: car.id, condition: oldPart.condition, category: currentTab });
                car.parts[currentTab][partName] = { type: tuneType, condition: 100, color: currentTab === "body" ? ["Белый","Синий","Красный","Зелёный","Жёлтый","Чёрный","Серебристый"][rand(0,7)] : null };
                if (!car.hasTuning) car.hasTuning = true;
            }
            updateWarehouseCount();
            renderCarMenu();
            renderGarage();
        };
    });
    
    document.querySelectorAll("[data-paint-all]").forEach(btn => {
        btn.onclick = () => {
            const color = btn.dataset.paintAll;
            for (let key in car.parts.body) {
                if (car.parts.body[key]) car.parts.body[key].color = color;
            }
            renderCarMenu();
            renderGarage();
            showToast(`🎨 Кузов перекрашен в ${color}`);
        };
    });
}

function sellCar() {
    const car = garage[currentCarIndex];
    if (!allBodySameColor(car)) {
        showToast("❌ Все детали кузова должны быть одного цвета!", true);
        return;
    }
    if (car.hasTuning) {
        showToast("❌ На машине установлен тюнинг! Подайте заявление в ГИБДД через вкладку ПТС.", true);
        return;
    }
    const price = carPrice(car);
    showConfirm(`Продать ${car.name} за ${price}₽?`, () => {
        money += price;
        garage[currentCarIndex] = null;
        updateMoney();
        renderGarage();
        document.getElementById("carModal").classList.add("hidden");
        showToast(`💰 Продано за ${price}₽`);
    });
}

function generateDump() {
    const dumpCars = [];
    for (let i = 0; i < 6; i++) {
        const model = carsData[rand(0, carsData.length)];
        const isRare = Math.random() < 0.15;
        const carData = createCar(model.id, isRare);
        const price = isRare ? rand(30000, 100000) : rand(3000, 25000);
        dumpCars.push({ carData, price, model, rare: isRare });
    }
    return dumpCars;
}

function openDump() {
    const dumpCars = generateDump();
    document.getElementById("dumpList").innerHTML = dumpCars.map(d => `
        <div class="bg-slate-700 p-3 rounded">
            <div class="font-bold text-white">${d.model.name} ${d.rare ? '🔥 РЕДКИЙ 🔥' : ''}</div>
            <div class="text-yellow-400">💰 ${d.price}₽</div>
            <button class="buyDump bg-blue-700 px-3 py-1 rounded w-full mt-2" data-price="${d.price}" data-car='${JSON.stringify(d.carData)}'>Купить</button>
        </div>
    `).join('');
    document.querySelectorAll(".buyDump").forEach(btn => {
        btn.onclick = () => {
            const price = parseInt(btn.dataset.price);
            const carData = JSON.parse(btn.dataset.car);
            const emptySlot = garage.findIndex(s => s === null);
            if (emptySlot === -1) { showToast("Гараж полон!", true); return; }
            if (money < price) { showToast("Нет денег!", true); return; }
            money -= price;
            garage[emptySlot] = carData;
            updateMoney();
            renderGarage();
            document.getElementById("dumpModal").classList.add("hidden");
            showToast(`🚗 Куплена ${carData.name}`);
        };
    });
    document.getElementById("dumpModal").classList.remove("hidden");
}

function renderShop() {
    let html = "";
    for (let car of carsData) {
        html += `<div class="border-b border-gray-700 pb-2 mb-2"><div class="font-bold text-blue-300">${car.name}</div>`;
        for (let cat of ["motor", "body", "susp"]) {
            const partsList = cat === "motor" ? ["Блок","Поршневая","Коленвал","ГБЦ","ГРМ","Топливная","Впуск/выпуск","Сцепление"] :
                              cat === "body" ? ["Передний бампер","Задний бампер","Фары","Дверь перед.левая","Дверь перед.правая","Дверь зад.левая","Дверь зад.правая","Багажник"] :
                              ["Пружины","Амортизаторы","Рычаги","КПП","Передняя ось","Задняя ось","Тормоза передние","Тормоза задние"];
            for (let p of partsList) {
                const price = getPartPrice(car.country, cat, p);
                html += `<div class="flex justify-between py-1 pl-4"><span>${p}</span><div><span class="text-green-400">${price}₽</span><button class="buyShop ml-3 bg-blue-700 px-2 py-1 rounded text-sm" data-name="${p}" data-price="${price}" data-car="${car.id}" data-cat="${cat}">Купить</button></div></div>`;
            }
        }
        html += `</div>`;
    }
    document.getElementById("shopList").innerHTML = html;
    document.querySelectorAll(".buyShop").forEach(btn => {
        btn.onclick = () => {
            const price = parseInt(btn.dataset.price);
            const name = btn.dataset.name;
            const car = btn.dataset.car;
            const cat = btn.dataset.cat;
            if (money < price) { showToast("Нет денег!", true); return; }
            money -= price;
            warehouse.push({ name, forCar: car, condition: 100, category: cat });
            updateMoney();
            updateWarehouseCount();
            showToast(`✅ ${name} куплена и отправлена на склад`);
            renderShop();
        };
    });
}

function openShop() {
    renderShop();
    document.getElementById("shopModal").classList.remove("hidden");
}

function generateAvito() {
    const offers = [];
    for (let i = 0; i < 6; i++) {
        const car = carsData[rand(0, carsData.length)];
        const cat = ["motor", "body", "susp"][rand(0, 3)];
        const partsList = cat === "motor" ? ["Блок","Поршневая","Коленвал","ГБЦ","ГРМ","Топливная","Впуск/выпуск","Сцепление"] :
                          cat === "body" ? ["Передний бампер","Задний бампер","Фары","Дверь перед.левая","Дверь перед.правая","Дверь зад.левая","Дверь зад.правая","Багажник"] :
                          ["Пружины","Амортизаторы","Рычаги","КПП","Передняя ось","Задняя ось","Тормоза передние","Тормоза задние"];
        const part = partsList[rand(0, partsList.length)];
        offers.push({ name: part, forCar: car.id, price: rand(500, 20000), category: cat });
    }
    return offers;
}

let currentAvitoOffers = [];

function openAvito() {
    currentAvitoOffers = generateAvito();
    renderAvito();
    document.getElementById("avitoModal").classList.remove("hidden");
}

function renderAvito() {
    document.getElementById("avitoList").innerHTML = currentAvitoOffers.map(o => `
        <div class="bg-slate-700 p-3 rounded">
            <div class="font-bold text-white">${o.name}</div>
            <div class="text-gray-300">Для: ${carsData.find(c => c.id === o.forCar)?.name}</div>
            <div class="text-yellow-400">💰 ${o.price}₽</div>
            <button class="buyAvito bg-purple-700 px-3 py-1 rounded w-full mt-2" data-name="${o.name}" data-price="${o.price}" data-car="${o.forCar}" data-cat="${o.category}">Купить</button>
        </div>
    `).join('');
    document.querySelectorAll(".buyAvito").forEach(btn => {
        btn.onclick = () => {
            const price = parseInt(btn.dataset.price);
            const name = btn.dataset.name;
            const car = btn.dataset.car;
            const cat = btn.dataset.cat;
            if (money < price) { showToast("Нет денег!", true); return; }
            money -= price;
            const condition = rand(5, 95);
            warehouse.push({ name, forCar: car, condition, category: cat });
            updateMoney();
            updateWarehouseCount();
            showToast(`🛒 ${name} куплена! Состояние ${condition}% на складе`);
            openAvito();
        };
    });
}

function surpriseBox() {
    const price = rand(5000, 30000);
    showConfirm(`🎁 Кот в мешке за ${price}₽? (1-4 случайные детали)`, () => {
        if (money < price) { showToast("Нет денег!", true); return; }
        money -= price;
        const count = rand(1, 4);
        for (let i = 0; i < count; i++) {
            const car = carsData[rand(0, carsData.length)];
            const cat = ["motor", "body", "susp"][rand(0, 3)];
            const partsList = cat === "motor" ? ["Блок","Поршневая","Коленвал","ГБЦ","ГРМ","Топливная","Впуск/выпуск","Сцепление"] :
                              cat === "body" ? ["Передний бампер","Задний бампер","Фары","Дверь перед.левая","Дверь перед.правая","Дверь зад.левая","Дверь зад.правая","Багажник"] :
                              ["Пружины","Амортизаторы","Рычаги","КПП","Передняя ось","Задняя ось","Тормоза передние","Тормоза задние"];
            const part = partsList[rand(0, partsList.length)];
            const condition = rand(5, 95);
            warehouse.push({ name: part, forCar: car.id, condition, category: cat });
        }
        updateMoney();
        updateWarehouseCount();
        showToast(`🎁 Получено ${count} деталей! Смотри на складе.`);
    });
}

function refreshAvito() { openAvito(); showToast("🔄 Лента обновлена"); }

function renderWarehouse() {
    const container = document.getElementById("warehouseList");
    if (warehouse.length === 0) {
        container.innerHTML = "<div class='text-center text-gray-400 p-4'>Пусто</div>";
        return;
    }
    container.innerHTML = warehouse.map((w, i) => {
        const car = carsData.find(c => c.id === w.forCar);
        return `<div class="flex justify-between border-b border-gray-700 p-2"><div>${w.name} (${car?.name}) — ${w.condition}%</div><button class="delWarehouse bg-red-700 px-2 py-1 rounded text-sm" data-i="${i}">🗑 Продать</button></div>`;
    }).join('');
    document.querySelectorAll(".delWarehouse").forEach(btn => {
        btn.onclick = () => {
            const i = parseInt(btn.dataset.i);
            const item = warehouse[i];
            const newPrice = getPartPrice(carsData.find(c => c.id === item.forCar).country, item.category, item.name);
            const sellPrice = Math.floor(newPrice * (item.condition / 100));
            money += sellPrice;
            warehouse.splice(i, 1);
            updateMoney();
            renderWarehouse();
            updateWarehouseCount();
            showToast(`💰 Продано за ${sellPrice}₽`);
        };
    });
}

function openWarehouse() {
    renderWarehouse();
    document.getElementById("warehouseModal").classList.remove("hidden");
}

function updateMoney() {
    document.getElementById("moneyDisplay").innerHTML = money.toLocaleString() + " ₽";
}

function updateWarehouseCount() {
    document.getElementById("warehouseCount").innerHTML = warehouse.length;
}

function saveGame() {
    const saveData = { money, garage, warehouse };
    const base64 = btoa(encodeURIComponent(JSON.stringify(saveData)));
    navigator.clipboard.writeText(base64);
    showToast("💾 Игра сохранена! Код в буфере обмена");
}

function loadGame() {
    const code = prompt("📂 Вставьте сохранённый код (Base64):");
    if (!code) return;
    try {
        const data = JSON.parse(decodeURIComponent(atob(code)));
        money = data.money;
        garage = data.garage;
        warehouse = data.warehouse;
        updateMoney();
        updateWarehouseCount();
        renderGarage();
        showToast("📂 Игра загружена!");
    } catch(e) {
        showToast("❌ Ошибка загрузки! Неверный код.", true);
    }
}

// ========== ЗАГРУЗКА И ЗАПУСК ==========
async function bootSequence() {
    bootLog("Инициализация модульной системы...");
    await delay(500);
    
    const carsText = await loadModule("cars", "modules/cars.txt");
    const tuningText = await loadModule("tuning", "modules/tuning.txt");
    const racersText = await loadModule("racers", "modules/racers.txt");
    const policeText = await loadModule("police", "modules/police.txt");
    
    if (!carsText) {
        bootLog("КРИТИЧЕСКАЯ ОШИБКА: Нет cars.txt", "error");
        return;
    }
    
    carsData = parseCars(carsText);
    tuningData = parseTuning(tuningText || "");
    racersData = parseRacers(racersText || "");
    policeData = parsePolice(policeText || "");
    
    bootLog(`Обработано ${carsData.length} машин`, "success");
    
    for (let i = 0; i < carsData.length; i++) {
        bootLog(`cars: ${carsData[i].name}...`, "progress");
        await delay(30);
        bootProgressBar(100);
        bootLog(`✅ ${carsData[i].name} — готов`, "success");
        await delay(20);
    }
    
    bootLog("");
    bootLog("🔧 Прогрузка тюнинг-деталей...", "progress");
    await delay(300);
    bootLog(`✅ Тюнинг загружен (${tuningData.length} записей)`, "success");
    
    bootLog("");
    bootLog("🏁 Инициализация гоночной системы...", "progress");
    await delay(200);
    bootLog(`✅ Racers loaded (${racersData.length} пилотов)`, "success");
    
    bootLog("");
    bootLog("👮‍♂️ Инициализация ГИБДД...", "progress");
    await delay(200);
    bootLog(`✅ Police services loaded (${policeData.length} услуг)`, "success");
    
    bootLog("");
    bootLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    bootLog("🎮 Init graphics...", "progress");
    await delay(800);
    bootLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    bootLog("✅ ЗАГРУЗКА ЗАВЕРШЕНА УСПЕШНО", "success");
    bootLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    await delay(1000);
    
    bootConsole.style.transition = "opacity 0.8s";
    bootConsole.style.opacity = "0";
    setTimeout(() => {
        bootConsole.style.display = "none";
        document.getElementById("gameUI").style.display = "block";
        startGame();
    }, 800);
}

function startGame() {
    const vaz2107 = carsData.find(c => c.id === "vaz2107");
    if (vaz2107) {
        garage[0] = createCar("vaz2107", false);
    }
    renderGarage();
    updateMoney();
    updateWarehouseCount();
    
    document.querySelectorAll(".closeModal").forEach(btn => {
        btn.onclick = e => btn.closest(".fixed").classList.add("hidden");
    });
    
    document.getElementById("dumpBtn").onclick = openDump;
    document.getElementById("shopBtn").onclick = openShop;
    document.getElementById("avitoBtn").onclick = openAvito;
    document.getElementById("raceBtn").onclick = () => showToast("🏁 Гонки будут в следующем обновлении", true);
    document.getElementById("warehouseBtn").onclick = openWarehouse;
    document.getElementById("saveBtn").onclick = saveGame;
    document.getElementById("loadBtn").onclick = loadGame;
    document.getElementById("refreshAvito").onclick = refreshAvito;
    document.getElementById("surpriseBtn").onclick = surpriseBox;
    document.getElementById("tabMotor").onclick = () => { currentTab = "motor"; if (currentCarIndex !== null) renderCarMenu(); };
    document.getElementById("tabBody").onclick = () => { currentTab = "body"; if (currentCarIndex !== null) renderCarMenu(); };
    document.getElementById("tabSusp").onclick = () => { currentTab = "susp"; if (currentCarIndex !== null) renderCarMenu(); };
    document.getElementById("sellCarBtn").onclick = sellCar;
}

bootSequence();