const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const cropDB = {
  Cotton: { water: 650, fert: 120, period: 170, risk: 68, price: 7200, yield: 9 },
  Wheat: { water: 450, fert: 90, period: 120, risk: 42, price: 2400, yield: 18 },
  Groundnut: { water: 500, fert: 80, period: 115, risk: 45, price: 6200, yield: 10 },
  Bajra: { water: 320, fert: 55, period: 90, risk: 24, price: 2200, yield: 12 },
  Rice: { water: 1200, fert: 130, period: 140, risk: 72, price: 2600, yield: 24 },
  Maize: { water: 550, fert: 110, period: 105, risk: 46, price: 2300, yield: 28 },
  Soybean: { water: 480, fert: 70, period: 100, risk: 40, price: 4600, yield: 13 },
  Cumin: { water: 280, fert: 45, period: 110, risk: 74, price: 23000, yield: 3 },
  Mustard: { water: 350, fert: 65, period: 105, risk: 38, price: 5200, yield: 8 },
  Chickpea: { water: 300, fert: 55, period: 105, risk: 26, price: 5600, yield: 9 },
};
const mushroomDB = {
  'Button Mushroom': { temp: 18, humidity: 88, days: 32, price: 140, yield: 180 },
  'Oyster Mushroom': { temp: 24, humidity: 85, days: 24, price: 110, yield: 145 },
  'Milky Mushroom': { temp: 30, humidity: 82, days: 28, price: 125, yield: 155 },
  'Shiitake Mushroom': { temp: 20, humidity: 80, days: 60, price: 260, yield: 95 },
};
const greenCrops = ['Tomato', 'Cucumber', 'Capsicum', 'Lettuce', 'Strawberry'];
const stages = ['Germination', 'Vegetative', 'Flowering', 'Fruiting', 'Harvest'];
const mushroomStages = ['Spawn Running', 'Colonization', 'Pinning', 'Fruiting', 'Harvest'];
const soilProfiles = { Sandy: { water: -10, nutrient: -5, disease: -3 }, Clay: { water: 8, nutrient: 2, disease: 5 }, Loam: { water: 4, nutrient: 6, disease: -4 }, Silt: { water: 6, nutrient: 4, disease: 2 }, 'Black Soil': { water: 7, nutrient: 10, disease: 1 } };

class Store {
  static load() {
    const old = JSON.parse(localStorage.agriverse || 'null');
    const state = old || { day: 1, farms: [], selectedFarmId: null, providers: [], currency: '₹', weatherMode: 'auto' };
    state.farms = (state.farms || []).map(FarmManager.normalizeFarm);
    if (!state.selectedFarmId && state.farms[0]) state.selectedFarmId = state.farms[0].id;
    return state;
  }
  static save(state) { localStorage.agriverse = JSON.stringify(state); }
}

class FarmManager {
  constructor(app) { this.app = app; }
  static normalizeFarm(farm) {
    return {
      id: farm.id || uid(), name: farm.name || 'Unnamed Farm', location: farm.location || 'Unknown', area: +farm.area || 1,
      soil: farm.soil || 'Loam', water: farm.water || 'Not set', soilHealth: farm.soilHealth ?? 92,
      manager: farm.manager || { name: farm.managerName || `Manager ${farm.name || ''}`.trim(), avatar: '🧑‍🌾', mode: 'Balanced Operations', task: 'Monitor farm health, conserve water, and protect profit.', log: [] },
      crops: farm.crops || [], mushrooms: farm.mushrooms || [], greenhouses: farm.greenhouses || [], experiments: farm.experiments || [], costs: farm.costs || [], history: farm.history || [], weather: farm.weather || null,
    };
  }
  create(form) {
    const farm = FarmManager.normalizeFarm({ ...form, id: uid(), manager: { name: form.managerName || `${form.name} Manager`, avatar: '🧑‍🌾', mode: 'Balanced Operations', task: 'Monitor farm health, conserve water, and protect profit.', log: [] } });
    this.app.s.farms.push(farm);
    this.app.s.selectedFarmId = farm.id;
    this.app.toast(`${farm.name} created with ${farm.manager.name}`);
    this.app.persist();
  }
}

class WeatherEngine {
  static seasonalBaseline(day, location = '') {
    const season = Math.floor(((day % 365) / 365) * 4);
    const monsoonBias = /gujarat|india|maharashtra|punjab|rajasthan/i.test(location) ? 9 : 0;
    return [{ temp: 23, humidity: 46, rain: 6, sun: 7 }, { temp: 35, humidity: 38, rain: 4, sun: 9 }, { temp: 29, humidity: 70 + monsoonBias, rain: 24 + monsoonBias, sun: 5 }, { temp: 19, humidity: 52, rain: 3, sun: 7 }][season];
  }
  static deterministicNoise(seed, span) { return Math.sin(seed * 12.9898) * span; }
  static auto(day, farm, previous) {
    const base = WeatherEngine.seasonalBaseline(day, farm?.location);
    const persistence = previous ? { temp: previous.temp * .25, humidity: previous.humidity * .18, rain: previous.rain * .12, wind: previous.wind * .15 } : { temp: 0, humidity: 0, rain: 0, wind: 0 };
    const temp = Math.round(base.temp * .75 + persistence.temp + WeatherEngine.deterministicNoise(day + farm.id.length, 4));
    const humidity = Math.round(clamp(base.humidity * .82 + persistence.humidity + WeatherEngine.deterministicNoise(day + 4, 10), 12, 98));
    const rain = Math.round(clamp(base.rain * .88 + persistence.rain + WeatherEngine.deterministicNoise(day + 8, 14), 0, 110));
    const wind = Math.round(clamp(10 + persistence.wind + WeatherEngine.deterministicNoise(day + 12, 12), 1, 55));
    const sun = Math.round(clamp(base.sun + WeatherEngine.deterministicNoise(day + 16, 2) - rain / 30, 1, 10));
    let type = 'Sunny';
    if (rain > 55 || wind > 42) type = 'Storm'; else if (rain > 16) type = 'Rainy'; else if (temp > 39 && humidity < 35) type = 'Heatwave'; else if (rain < 2 && humidity < 28 && temp > 34) type = 'Drought'; else if (sun < 5) type = 'Cloudy';
    return { mode: 'auto', type, temp, humidity, rain, wind, sun };
  }
  static manual(input) {
    return { mode: 'manual', type: input.type, temp: +input.temp, humidity: +input.humidity, rain: +input.rain, wind: +input.wind, sun: +input.sun };
  }
  static fromType(type) {
    const presets = {
      Sunny: { temp: 31, humidity: 44, rain: 0, wind: 9, sun: 9 }, Cloudy: { temp: 26, humidity: 64, rain: 4, wind: 12, sun: 4 },
      Rainy: { temp: 24, humidity: 84, rain: 34, wind: 18, sun: 3 }, Storm: { temp: 22, humidity: 91, rain: 78, wind: 42, sun: 1 },
      Heatwave: { temp: 42, humidity: 24, rain: 0, wind: 14, sun: 10 }, Drought: { temp: 38, humidity: 18, rain: 0, wind: 18, sun: 9 },
    };
    return { mode: 'scenario', type, ...(presets[type] || presets.Sunny) };
  }
}

class GrowthEngine {
  constructor(app) { this.app = app; }
  tick(days = 1, scenarioWeather = null) {
    const farm = this.app.farm();
    if (!farm) return this.app.toast('Create a farm first');
    for (let i = 0; i < days; i++) {
      this.app.s.day += 1;
      if (scenarioWeather) farm.weather = scenarioWeather(this.app.s.day, farm, farm.weather);
      else if (this.app.s.weatherMode !== 'manual') farm.weather = WeatherEngine.auto(this.app.s.day, farm, farm.weather);
      this.updateCrops(farm, farm.weather);
      this.updateMushrooms(farm);
      this.updateGreenhouses(farm, farm.weather);
      this.updateManager(farm);
      farm.history.push(this.app.snapshot(farm));
    }
    this.app.toast(`${farm.name}: ${days} simulated day(s) completed`);
    this.app.persist();
  }
  updateCrops(farm, weather) {
    const soil = soilProfiles[farm.soil] || soilProfiles.Loam;
    farm.crops.forEach(crop => {
      const heatStress = Math.max(0, weather.temp - 34) * 0.55;
      const droughtStress = Math.max(0, 35 - crop.moisture) * 0.13;
      crop.age += 1;
      crop.moisture = clamp(crop.moisture + weather.rain * 0.22 + soil.water * 0.05 - (weather.temp > 35 ? 5 : 2.7) - weather.wind * 0.05);
      crop.nutrients = clamp(crop.nutrients - 0.32 + soil.nutrient * 0.02, 0, 125);
      const growthScore = clamp((crop.moisture - 25) * .055 + (crop.nutrients - 25) * .045 + weather.sun * .18 - heatStress * .06 - droughtStress * .08, .1, 3.8);
      crop.growth = clamp(crop.growth + growthScore);
      crop.stage = stages[Math.min(4, Math.floor(crop.growth / 22))];
      DiseaseEngine.updateCrop(crop, weather, soil);
      crop.yieldPotential = clamp(crop.baseYield * (crop.growth / 100) * (crop.health / 100) * (1 - crop.disease / 180), 0, crop.baseYield * 1.18);
      crop.profit = Math.round(crop.yieldPotential * crop.price - crop.totalCost);
    });
  }
  updateMushrooms(farm) {
    farm.mushrooms.forEach(unit => {
      const ideal = mushroomDB[unit.type];
      unit.age += 1;
      const tempPenalty = Math.abs(unit.temp - ideal.temp) * 1.8;
      const humidityPenalty = Math.abs(unit.humidity - ideal.humidity) * 0.8;
      unit.risk = clamp(unit.risk + (tempPenalty + humidityPenalty) * .08 - unit.ventilation * .015 + unit.co2 / 3000);
      unit.growth = clamp(unit.growth + clamp(4.5 - (tempPenalty + humidityPenalty) * .05 - unit.risk * .015, .3, 5.4));
      unit.stage = mushroomStages[Math.min(4, Math.floor(unit.growth / 22))];
      unit.health = clamp(100 - unit.risk);
      unit.yieldPotential = clamp(unit.baseYield * unit.growth / 100 * unit.health / 100, 0, unit.baseYield * 1.12);
    });
  }
  updateGreenhouses(farm, weather) {
    farm.greenhouses.forEach(house => {
      const climateGap = Math.abs(house.temp - 24) + Math.abs(house.humidity - 72) * .15;
      const outsidePenalty = Math.max(0, Math.abs(weather.temp - house.temp) - 12) * .08;
      house.growth = clamp(house.growth + clamp(3.5 - climateGap * .12 - outsidePenalty, .5, 4.2));
      house.health = clamp(house.health - climateGap * .03 - outsidePenalty * .2 + .3);
      house.yieldPotential = clamp(house.baseYield * house.growth / 100 * house.health / 100, 0, house.baseYield * 1.2);
    });
  }
  updateManager(farm) {
    const issues = VirtualManager.analyze(farm, this.app.eco.summary(farm));
    farm.manager.log.unshift(`Day ${this.app.s.day}: ${issues[0] || 'All systems stable.'}`);
    farm.manager.log = farm.manager.log.slice(0, 8);
  }
}

class DiseaseEngine {
  static updateCrop(crop, weather, soil) {
    const humidityRisk = weather.humidity > 78 ? 2.2 : weather.humidity < 25 ? 1.1 : 0;
    const rainRisk = weather.rain > 30 ? 2.6 : 0;
    const heatRisk = weather.temp > 38 ? 1.8 : 0;
    const nutritionRisk = crop.nutrients < 28 || crop.nutrients > 108 ? 1.5 : 0;
    crop.disease = clamp(crop.disease + humidityRisk + rainRisk + heatRisk + nutritionRisk + soil.disease * .08 - crop.recovery * .12);
    crop.health = clamp(100 - crop.disease * .42 - Math.max(0, crop.nutrients - 105) * .18 - Math.max(0, 25 - crop.moisture) * .32);
    crop.recovery = Math.max(0, crop.recovery - .4);
  }
}

class CropManager {
  constructor(app) { this.app = app; }
  plant(name) {
    const farm = this.app.farm(); if (!farm) return this.app.toast('Create a farm first');
    const d = cropDB[name];
    farm.crops.push({ id: uid(), name, water: d.water, fert: d.fert, period: d.period, diseaseRisk: d.risk, price: d.price, baseYield: d.yield * farm.area, age: 0, growth: 5, moisture: 58, nutrients: 62, disease: d.risk * .12, recovery: 0, health: 94, stage: stages[0], totalCost: d.fert * 22 + d.water * 1.8 + 900, yieldPotential: 0, profit: -900 });
    this.app.toast(`${name} planted on ${farm.name}`);
    this.app.persist();
  }
}

class MushroomManager {
  constructor(app) { this.app = app; }
  add(type, substrate, temp, humidity) {
    const farm = this.app.farm(); if (!farm) return this.app.toast('Create a farm first');
    const d = mushroomDB[type];
    const risk = clamp(Math.abs(+humidity - d.humidity) + Math.abs(+temp - d.temp) * 2, 4, 80);
    farm.mushrooms.push({ id: uid(), type, substrate, temp: +temp, humidity: +humidity, co2: 700, ventilation: 65, light: 35, airflow: 60, age: 0, growth: 8, stage: mushroomStages[0], risk, baseYield: d.yield, price: d.price, harvest: d.days, health: 100 - risk, yieldPotential: 0 });
    this.app.toast(`${type} unit created on ${farm.name}`);
    this.app.persist();
  }
}

class GreenhouseManager {
  constructor(app) { this.app = app; }
  add(crop, temp, humidity) {
    const farm = this.app.farm(); if (!farm) return this.app.toast('Create a farm first');
    farm.greenhouses.push({ id: uid(), crop, temp: +temp, humidity: +humidity, ventilation: 68, irrigation: 70, lighting: 74, growth: 10, health: 94, baseYield: 12 * farm.area * .25, yieldPotential: 0 });
    this.app.toast(`${crop} greenhouse added to ${farm.name}`);
    this.app.persist();
  }
}

class IrrigationManager {
  constructor(app) { this.app = app; }
  start(type) {
    const farm = this.app.farm(); if (!farm) return;
    const efficiency = { 'Drip Irrigation': .92, 'Sprinkler Irrigation': .74, 'Flood Irrigation': .55 }[type] || .7;
    farm.crops.forEach(crop => { crop.moisture = clamp(crop.moisture + 24 * efficiency); crop.totalCost += Math.round(520 / efficiency); });
    farm.costs.push({ type: 'Water', amount: Math.round(520 / efficiency), day: this.app.s.day });
    this.app.toast(`${type} completed on ${farm.name}`);
    this.app.persist();
  }
}

class FertilizerManager {
  constructor(app) { this.app = app; }
  apply(type) {
    const farm = this.app.farm(); if (!farm) return;
    const nutrient = type.includes('Organic') || type.includes('Vermi') ? 10 : 17;
    farm.crops.forEach(crop => { crop.nutrients = clamp(crop.nutrients + nutrient, 0, 125); crop.totalCost += type.includes('Organic') ? 700 : 950; });
    farm.costs.push({ type, amount: type.includes('Organic') ? 700 : 950, day: this.app.s.day });
    this.app.toast(`${type} applied on ${farm.name}`);
    this.app.persist();
  }
}

class ExperimentEngine {
  constructor(app) { this.app = app; }
  add(form) {
    const farm = this.app.farm(); if (!farm) return;
    farm.experiments.push({ id: uid(), name: form.name || form.scenario, scenario: form.scenario, value: +form.value || 0, days: +form.days || 30, results: null });
    this.app.toast('Experiment queued');
    this.app.persist();
  }
  run() {
    const farm = this.app.farm(); if (!farm) return;
    farm.experiments.forEach(exp => {
      const baseline = this.evaluateScenario(farm, exp.days, null);
      const altered = this.evaluateScenario(farm, exp.days, exp);
      exp.results = {
        yield: +(altered.yield - baseline.yield).toFixed(2),
        growth: +(altered.growth - baseline.growth).toFixed(2),
        cost: Math.round(altered.cost - baseline.cost),
        profit: Math.round(altered.profit - baseline.profit),
        disease: +(altered.disease - baseline.disease).toFixed(2),
        baselineProfit: Math.round(baseline.profit),
        scenarioProfit: Math.round(altered.profit),
      };
    });
    this.app.toast('Deterministic experiment comparison complete');
    this.app.persist();
  }
  evaluateScenario(sourceFarm, days, exp) {
    const farm = structuredClone(sourceFarm);
    let extraCost = 0;
    for (let day = 1; day <= days; day++) {
      let weather = WeatherEngine.auto(this.app.s.day + day, farm, farm.weather);
      if (exp) ({ weather, extraCost } = this.applyScenario(farm, exp, weather, extraCost));
      this.simulateFarmDay(farm, weather);
      farm.weather = weather;
    }
    const cropYield = farm.crops.reduce((sum, c) => sum + c.yieldPotential, 0);
    const mushroomYield = farm.mushrooms.reduce((sum, m) => sum + m.yieldPotential, 0);
    const greenhouseYield = farm.greenhouses.reduce((sum, g) => sum + g.yieldPotential, 0);
    const revenue = farm.crops.reduce((sum, c) => sum + c.yieldPotential * c.price, 0) + farm.mushrooms.reduce((sum, m) => sum + m.yieldPotential * m.price, 0) + farm.greenhouses.reduce((sum, g) => sum + g.yieldPotential * 1800, 0);
    const cost = farm.costs.reduce((sum, c) => sum + +c.amount, 0) + farm.crops.reduce((sum, c) => sum + c.totalCost, 0) + extraCost;
    return { yield: cropYield + mushroomYield + greenhouseYield, growth: this.avg([...farm.crops, ...farm.mushrooms, ...farm.greenhouses], 'growth'), disease: this.avg(farm.crops, 'disease') + this.avg(farm.mushrooms, 'risk') * .35, cost, profit: revenue - cost };
  }
  applyScenario(farm, exp, weather, extraCost) {
    const v = exp.value / 100;
    if (exp.scenario.includes('Reduce irrigation')) farm.crops.forEach(c => c.moisture = clamp(c.moisture - 9 * v));
    if (exp.scenario.includes('Increase fertilizer')) { farm.crops.forEach(c => c.nutrients = clamp(c.nutrients + 12 * v, 0, 125)); extraCost += 450 * v; }
    if (exp.scenario.includes('Change soil')) farm.soil = farm.soil === 'Loam' ? 'Black Soil' : 'Loam';
    if (exp.scenario.includes('drought')) weather = { mode: 'manual', type: 'Drought', temp: 39, humidity: 22, rain: 0, wind: 16, sun: 9 };
    if (exp.scenario.includes('flood')) weather = { mode: 'manual', type: 'Storm', temp: 24, humidity: 92, rain: 88, wind: 34, sun: 2 };
    if (exp.scenario.includes('mushroom humidity')) farm.mushrooms.forEach(m => m.humidity = clamp(m.humidity + exp.value));
    if (exp.scenario.includes('greenhouse temperature')) farm.greenhouses.forEach(g => g.temp = clamp(g.temp + exp.value, 8, 45));
    if (exp.scenario.includes('organic')) { farm.crops.forEach(c => { c.nutrients = clamp(c.nutrients + 6); c.disease = clamp(c.disease - 1.4); c.totalCost += 22; }); extraCost += 650; }
    return { weather, extraCost };
  }
  simulateFarmDay(farm, weather) {
    const miniApp = { s: this.app.s, snapshot: () => ({}) };
    const engine = new GrowthEngine(miniApp);
    engine.updateCrops(farm, weather); engine.updateMushrooms(farm); engine.updateGreenhouses(farm, weather);
  }
  avg(items, prop) { return items.length ? items.reduce((sum, item) => sum + (item[prop] || 0), 0) / items.length : 0; }
}

class VirtualManager {
  static analyze(farm, economy) {
    const alerts = [];
    const dry = farm.crops.find(c => c.moisture < 35);
    const sick = farm.crops.find(c => c.disease > 55);
    const contaminated = farm.mushrooms.find(m => m.risk > 45);
    if (dry) alerts.push(`Irrigate ${dry.name}; moisture is ${dry.moisture.toFixed(0)}%.`);
    if (sick) alerts.push(`Treat ${sick.name}; disease is ${sick.disease.toFixed(0)}%.`);
    if (contaminated) alerts.push(`Sanitize ${contaminated.type}; contamination risk is ${contaminated.risk.toFixed(0)}%.`);
    if (economy.roi < 15 && economy.cost > 0) alerts.push('Review input costs; ROI is below target.');
    return alerts.length ? alerts : ['Farm operating normally; continue monitoring growth, moisture, and market timing.'];
  }
  static plan(farm, economy) {
    return [`${farm.manager.name}'s work plan for ${farm.name}:`, ...VirtualManager.analyze(farm, economy), `Current priority: ${farm.manager.task}`, 'Next: run a 30-day experiment before making expensive changes.'].join('\n• ');
  }
}

class AIManager {
  constructor(app) { this.app = app; }
  answer(question) {
    const farm = this.app.farm(); if (!farm) return 'Create a farm first.';
    const economy = this.app.eco.summary(farm);
    return `AgriVerse AI recommendation for ${farm.name}\n\nQuestion: ${question}\n• ${VirtualManager.analyze(farm, economy).join('\n• ')}\n• Use deterministic experiments to compare profit before changing irrigation, fertilizer, soil, or greenhouse climate.`;
  }
}

class EconomyManager {
  constructor(app) { this.app = app; }
  summary(farm = this.app.farm()) {
    if (!farm) return { cost: 0, revenue: 0, profit: 0, roi: 0 };
    const cost = farm.costs.reduce((sum, item) => sum + +item.amount, 0) + farm.crops.reduce((sum, crop) => sum + crop.totalCost, 0);
    const revenue = farm.crops.reduce((sum, crop) => sum + crop.yieldPotential * crop.price, 0) + farm.mushrooms.reduce((sum, unit) => sum + unit.yieldPotential * unit.price, 0) + farm.greenhouses.reduce((sum, house) => sum + house.yieldPotential * 1800, 0);
    const profit = revenue - cost;
    return { cost: Math.round(cost), revenue: Math.round(revenue), profit: Math.round(profit), roi: cost ? Math.round(profit / cost * 100) : 0 };
  }
}

class AnalyticsManager {
  static draw(canvas, values, color = '#42d474', label = '') {
    const ctx = canvas.getContext('2d'); const width = canvas.width = canvas.clientWidth * 2; const height = canvas.height = 220;
    ctx.clearRect(0, 0, width, height); ctx.strokeStyle = 'rgba(255,255,255,.16)';
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(0, height * i / 5); ctx.lineTo(width, height * i / 5); ctx.stroke(); }
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.beginPath();
    values.forEach((value, index) => { const x = index * (width / (values.length - 1 || 1)); const y = height - clamp(value) / 100 * height; index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.fillStyle = color; ctx.font = '24px Inter'; ctx.fillText(label || canvas.id.replace('Chart', ' Chart'), 20, 34);
  }
}

class App {
  constructor() {
    this.s = Store.load(); this.farms = new FarmManager(this); this.crop = new CropManager(this); this.mush = new MushroomManager(this); this.gh = new GreenhouseManager(this); this.growth = new GrowthEngine(this); this.exp = new ExperimentEngine(this); this.ai = new AIManager(this); this.eco = new EconomyManager(this); this.init();
  }
  farm() { return this.s.farms.find(f => f.id === this.s.selectedFarmId) || this.s.farms[0]; }
  persist() { Store.save(this.s); this.render(); }
  toast(message) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = message; $('#toasts').append(el); setTimeout(() => el.remove(), 3200); }
  avg(items, prop) { return items.length ? items.reduce((sum, item) => sum + (item[prop] || 0), 0) / items.length : 0; }
  snapshot(farm = this.farm()) { const economy = this.eco.summary(farm); return { growth: this.avg([...farm.crops, ...farm.mushrooms, ...farm.greenhouses], 'growth'), moisture: this.avg(farm.crops, 'moisture'), disease: this.avg(farm.crops, 'disease'), profit: clamp(economy.roi, 0, 100), market: clamp(45 + Math.sin(this.s.day / 5) * 25 + economy.roi * .12, 0, 100) }; }
  init() {
    ['Dashboard', 'Farm', 'Manager', 'Crops', 'Mushrooms', 'Greenhouse', 'Weather', 'Experiments', 'AI', 'Economics', 'Analytics', 'Data'].forEach((name, index) => $('#nav').insertAdjacentHTML('beforeend', `<button class="nav-btn ${index ? '' : 'active'}" data-jump="${name.toLowerCase()}">${name}</button>`));
    Object.keys(cropDB).forEach(name => $('#cropSelect').add(new Option(name, name))); Object.keys(mushroomDB).forEach(name => $('#mushroomType').add(new Option(name, name))); greenCrops.forEach(name => $('#greenCrop').add(new Option(name, name)));
    for (let i = 0; i < 32; i++) $('#fieldGrid').insertAdjacentHTML('beforeend', '<div class="plot"></div>');
    this.bind(); this.render();
  }
  bind() {
    document.body.addEventListener('click', event => { const section = event.target.dataset.jump; if (section) this.show(section); const farmId = event.target.dataset.selectFarm; if (farmId) { this.s.selectedFarmId = farmId; this.persist(); } const action = event.target.dataset.assetAction; if (action) this.handleAssetAction(action); });
    $('#farmSwitch').onchange = event => { this.s.selectedFarmId = event.target.value; this.persist(); };
    $('#themeToggle').onclick = () => document.body.classList.toggle('light');
    $('#farmForm').onsubmit = event => { event.preventDefault(); this.farms.create(Object.fromEntries(new FormData(event.target))); event.target.reset(); };
    $('#plantCrop').onclick = () => this.crop.plant($('#cropSelect').value);
    $('#addMushroom').onclick = () => this.mush.add($('#mushroomType').value, $('#substrate').value, $('#mTemp').value, $('#mHumidity').value);
    $('#addGreenhouse').onclick = () => this.gh.add($('#greenCrop').value, $('#ghTemp').value, $('#ghHum').value);
    $('#simulateDay').onclick = () => this.growth.tick(1); $('#simulateWeek').onclick = () => this.growth.tick(7);
    $('#skipScenario').onclick = () => { const days = Math.max(1, +$('#skipDays').value || 1); const mode = $('#skipWeather').value; const factory = mode === 'auto' ? null : () => WeatherEngine.fromType(mode); this.growth.tick(days, factory); this.toast(`${days} days skipped using ${mode} weather`); };
    $('#autoWeather').onclick = () => { const farm = this.farm(); if (!farm) return; this.s.weatherMode = 'auto'; farm.weather = WeatherEngine.auto(this.s.day, farm, farm.weather); this.persist(); this.toast('Automatic weather generated'); };
    $('#applyManualWeather').onclick = () => { const farm = this.farm(); if (!farm) return; this.s.weatherMode = 'manual'; farm.weather = WeatherEngine.manual({ type: $('#manualWeatherType').value, temp: $('#manualTemp').value, humidity: $('#manualHumidity').value, rain: $('#manualRain').value, wind: $('#manualWind').value, sun: $('#manualSun').value }); this.persist(); this.toast('Manual weather locked for experiments'); };
    $('#weatherMode').onchange = event => { this.s.weatherMode = event.target.value; this.persist(); };
    $('#startIrrigation').onclick = () => new IrrigationManager(this).start($('#irrigationType').value);
    $('#applyFertilizer').onclick = () => new FertilizerManager(this).apply($('#fertilizerType').value);
    $('#sprayPest').onclick = () => { const farm = this.farm(); if (!farm) return; farm.crops.forEach(c => { c.recovery += 28; c.disease = clamp(c.disease - 18); }); this.persist(); this.toast('Biological recovery program started'); };
    $('#experimentForm').onsubmit = event => { event.preventDefault(); this.exp.add(Object.fromEntries(new FormData(event.target))); event.target.reset(); };
    $('#runExperiment').onclick = () => this.exp.run();
    $('#askAI').onclick = () => $('#aiAnswer').textContent = this.ai.answer($('#aiQuestion').value || $('#quickQuestion').value);
    $('#quickQuestion').onchange = event => $('#aiQuestion').value = event.target.value;
    $('#saveProvider').onclick = () => { this.s.providers.push({ key: $('#apiKey').value, baseUrl: $('#baseUrl').value, model: $('#modelName').value }); this.persist(); this.toast('AI provider saved'); };
    $('#addCost').onclick = () => { const farm = this.farm(); if (!farm) return; farm.costs.push({ type: $('#costType').value, amount: +$('#costAmount').value, day: this.s.day }); this.persist(); };
    $('#assignManagerTask').onclick = () => { const farm = this.farm(); if (!farm) return; farm.manager.task = $('#managerTask').value || farm.manager.task; farm.manager.log.unshift(`Day ${this.s.day}: New instruction - ${farm.manager.task}`); this.persist(); };
    $('#managerAutoPlan').onclick = () => { const farm = this.farm(); if (!farm) return; $('#managerLog').textContent = VirtualManager.plan(farm, this.eco.summary(farm)); };
    $('#saveAll').onclick = () => this.persist(); $('#exportData').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(this.s, null, 2)], { type: 'application/json' })); a.download = 'agriverse-backup.json'; a.click(); };
    $('#importData').onchange = event => { const reader = new FileReader(); reader.onload = () => { this.s = JSON.parse(reader.result); Store.save(this.s); location.reload(); }; reader.readAsText(event.target.files[0]); };
    $('#backupData').onclick = () => { localStorage.agriverseBackup = JSON.stringify(this.s); this.toast('Backup created'); }; $('#restoreData').onclick = () => { if (localStorage.agriverseBackup) { this.s = JSON.parse(localStorage.agriverseBackup); this.persist(); } };
    $('#currency').onchange = event => { this.s.currency = event.target.value; this.persist(); }; $('#optimizeGH').onclick = () => { $('#ghTemp').value = 24; $('#ghHum').value = 72; this.toast('Greenhouse climate optimized'); };
  }
  handleAssetAction(action) {
    const farm = this.farm(); if (!farm) return;
    if (action === 'irrigate') return new IrrigationManager(this).start($('#irrigationType').value);
    if (action === 'fertilize') return new FertilizerManager(this).apply($('#fertilizerType').value);
    if (action === 'treat') { farm.crops.forEach(c => { c.recovery += 20; c.disease = clamp(c.disease - 14); }); this.toast('Visual twin treatment applied'); return this.persist(); }
    if (action === 'mushroomClimate') { farm.mushrooms.forEach(m => { const ideal = mushroomDB[m.type]; m.temp = ideal.temp; m.humidity = ideal.humidity; m.risk = clamp(m.risk - 10); }); this.toast('Mushroom climate tuned to ideal values'); return this.persist(); }
    if (action === 'greenhouseClimate') { farm.greenhouses.forEach(g => { g.temp = 24; g.humidity = 72; g.health = clamp(g.health + 5); }); this.toast('Greenhouse climate optimized from visual twin'); return this.persist(); }
  }
  show(id) { $$('.section,.hero').forEach(section => section.classList.toggle('active', section.dataset.section === id)); $$('.nav-btn').forEach(button => button.classList.toggle('active', button.dataset.jump === id)); $('#pageTitle').textContent = id[0].toUpperCase() + id.slice(1); }
  render() {
    const farm = this.farm(); const currency = this.s.currency || '₹'; const economy = this.eco.summary(farm);
    $('#farmSwitch').innerHTML = this.s.farms.length ? this.s.farms.map(f => `<option value="${f.id}" ${f.id === this.s.selectedFarmId ? 'selected' : ''}>${f.name}</option>`).join('') : '<option>Create a farm</option>';
    $('#metrics').innerHTML = [['Twin Day', this.s.day, 'Simulation clock'], ['Active Farm', farm?.name || 'None', `${this.s.farms.length} farm(s)`], ['Profit', currency + economy.profit, 'ROI ' + economy.roi + '%'], ['Weather', farm?.weather?.type || 'Not generated', this.s.weatherMode === 'manual' ? 'Manual lock' : 'Auto climate']].map(m => `<div class="metric"><span>${m[0]}</span><b>${m[1]}</b><span>${m[2]}</span></div>`).join('');
    $('#farmList').innerHTML = this.s.farms.map(f => `<div class="card farm-card ${f.id === this.s.selectedFarmId ? 'active' : ''}"><h3>${f.name}</h3><p>${f.location} • ${f.area} acres • ${f.soil}</p><span class="tag">${f.water}</span><span class="tag">Manager: ${f.manager.name}</span><span class="tag">${f.crops.length} crops</span><button class="secondary" data-select-farm="${f.id}">Set Active</button></div>`).join('');
    $('#managerPanel').innerHTML = farm ? `<div class="manager-card"><div class="manager-avatar">${farm.manager.avatar}</div><h3>${farm.manager.name}</h3><p>${farm.manager.mode}</p><span class="tag">Assigned to ${farm.name}</span></div><div class="manager-card"><h3>Current Instruction</h3><p>${farm.manager.task}</p><h3>Recent Work Log</h3><p>${farm.manager.log.join('<br>') || 'No manager actions yet. Simulate days or generate a plan.'}</p></div>` : '<div class="card">Create a farm to hire its virtual manager.</div>';
    if (farm) $('#managerLog').textContent = farm.manager.log.join('\n') || 'No plan generated yet.';
    const crops = farm?.crops || [], mushrooms = farm?.mushrooms || [], greenhouses = farm?.greenhouses || [];
    $('#cropCards').innerHTML = crops.map(c => `<div class="card"><h3>${c.name}</h3><p>${c.stage} • ${c.age}/${c.period} days</p><div class="progress"><div class="bar" style="width:${c.growth}%"></div></div><span class="tag">Moisture ${c.moisture.toFixed(0)}%</span><span class="tag">Nutrients ${c.nutrients.toFixed(0)}%</span><span class="tag ${c.disease > 55 ? 'danger' : ''}">Disease ${c.disease.toFixed(0)}%</span><p>Yield ${c.yieldPotential.toFixed(2)} / ${c.baseYield.toFixed(1)} q • Profit ${currency}${c.profit}</p></div>`).join('') || '<div class="card"><h3>No crops planted</h3><p>Select a crop and click Plant Crop.</p></div>';
    $('#mushroomCards').innerHTML = mushrooms.map(m => `<div class="card"><h3>${m.type}</h3><p>${m.stage} • Harvest in ${Math.max(0, m.harvest - m.age)} days</p><div class="progress"><div class="bar" style="width:${m.growth}%"></div></div><span class="tag">${m.substrate}</span><span class="tag">Humidity ${m.humidity}%</span><span class="tag ${m.risk > 45 ? 'danger' : ''}">Contamination ${m.risk.toFixed(0)}%</span><p>Yield prediction ${m.yieldPotential.toFixed(1)} kg/batch</p></div>`).join('') || '<div class="card"><h3>No mushroom unit</h3><p>Create a unit with substrate and climate parameters.</p></div>';
    $('#greenhouseCards').innerHTML = greenhouses.map(g => `<div class="card"><h3>${g.crop}</h3><p>Temp ${g.temp}°C • Humidity ${g.humidity}%</p><div class="progress"><div class="bar" style="width:${g.growth}%"></div></div><span class="tag">Ventilation ${g.ventilation}%</span><span class="tag">Lighting ${g.lighting}%</span><span class="tag">Yield ${g.yieldPotential.toFixed(1)} t</span></div>`).join('') || '<div class="card"><h3>No greenhouse</h3><p>Add a controlled environment crop.</p></div>';
    $('#visualFarm').innerHTML = farm ? `<div class="farm-map"><div class="asset-grid">${[...crops.map(c => `<div class="asset-tile crop"><b>🌱</b><small>${c.name}</small><small>${c.stage} • ${c.growth.toFixed(0)}%</small></div>`), ...mushrooms.map(m => `<div class="asset-tile mushroom"><b>🍄</b><small>${m.type}</small><small>${m.stage} • ${m.growth.toFixed(0)}%</small></div>`), ...greenhouses.map(g => `<div class="asset-tile greenhouse"><b>🏡</b><small>${g.crop}</small><small>${g.growth.toFixed(0)}% growth</small></div>`)].join('') || '<div class="asset-tile"><b>🚜</b><small>Create assets to populate this farm.</small></div>'}</div></div><div class="asset-panel"><div class="card"><h3>${farm.name} visual controls</h3><p>Manage the active farm directly from the digital twin view.</p><div class="asset-actions"><button class="mini-btn" data-asset-action="irrigate">Irrigate crops</button><button class="mini-btn" data-asset-action="fertilize">Fertilize crops</button><button class="mini-btn" data-asset-action="treat">Treat disease</button><button class="mini-btn" data-asset-action="mushroomClimate">Tune mushrooms</button><button class="mini-btn" data-asset-action="greenhouseClimate">Optimize greenhouse</button></div></div><div class="card"><h3>Growth snapshot</h3><p>Crops: ${crops.length} • Mushrooms: ${mushrooms.length} • Greenhouses: ${greenhouses.length}</p><span class="tag">Avg crop moisture ${this.avg(crops, 'moisture').toFixed(0)}%</span><span class="tag">Avg disease ${this.avg(crops, 'disease').toFixed(0)}%</span><span class="tag">ROI ${economy.roi}%</span></div></div>` : '<div class="card"><h3>No active farm</h3><p>Create a farm to see its live digital twin.</p></div>';
    const weather = farm?.weather || WeatherEngine.auto(this.s.day, farm || { id: 'demo', location: '' });
    $('#weatherMode').value = this.s.weatherMode || 'auto';
    $('#weatherPanel').innerHTML = Object.entries({ Mode: weather.mode || 'auto', Type: weather.type, Temperature: weather.temp + '°C', Humidity: weather.humidity + '%', Rainfall: weather.rain + 'mm', 'Wind Speed': weather.wind + 'km/h', Sunlight: weather.sun + '/10' }).map(([k, v]) => `<div class="metric"><span>${k}</span><b>${v}</b></div>`).join('');
    $('#experimentCards').innerHTML = (farm?.experiments || []).map(x => `<div class="card"><h3>${x.name}</h3><p>${x.scenario} for ${x.days} days</p>${x.results ? Object.entries(x.results).map(([k, v]) => `<span class="tag ${v < 0 ? 'danger' : ''}">${k}: ${v > 0 ? '+' : ''}${v}</span>`).join('') : '<span class="tag">Queued</span>'}</div>`).join('') || '<div class="card"><h3>No experiments</h3><p>Add one and run deterministic comparison.</p></div>';
    $('#economyCards').innerHTML = Object.entries(economy).map(([k, v]) => `<div class="metric"><span>${k}</span><b>${k === 'roi' ? v + '%' : currency + v}</b></div>`).join('') + (farm?.costs || []).slice(-6).map(c => `<div class="card"><h3>${c.type}</h3><p>${currency}${c.amount} • Day ${c.day}</p></div>`).join('');
    $('#dataPreview').textContent = JSON.stringify(this.s, null, 2).slice(0, 2500);
    const history = farm?.history?.slice(-14) || []; const chartData = history.length ? history : [this.snapshot(farm || FarmManager.normalizeFarm({ name: 'Demo' })), this.snapshot(farm || FarmManager.normalizeFarm({ name: 'Demo' }))];
    AnalyticsManager.draw($('#growthChart'), chartData.map(x => x.growth || 0), '#42d474', 'Growth Chart'); AnalyticsManager.draw($('#profitChart'), chartData.map(x => x.profit || 0), '#50c7f7', 'Profit / ROI Chart'); AnalyticsManager.draw($('#diseaseChart'), chartData.map(x => x.disease || 0), '#ff6b6b', 'Disease Chart'); AnalyticsManager.draw($('#marketChart'), chartData.map(x => x.market || 0), '#ffd166', 'Market Chart');
    AnalyticsManager.draw($('#experimentChart'), (farm?.experiments || []).map(x => clamp(50 + (x.results?.profit || 0) / 500)), '#b88349', 'Experiment Profit Delta');
  }
}

window.app = new App();
