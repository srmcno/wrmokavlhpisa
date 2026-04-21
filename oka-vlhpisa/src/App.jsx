import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Chart from "chart.js/auto";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const APP_VERSION = "5.2.0";
const APP_NAME = "Oka Vlhpisa";
const APP_SUBTITLE = "Water System Asset Manager";
const COPYRIGHT_YEAR = String(new Date().getFullYear());
const COPYRIGHT_HOLDER = "Choctaw Nation of Oklahoma";
const COPYRIGHT_NOTICE = `\u00A9 ${COPYRIGHT_YEAR} ${COPYRIGHT_HOLDER}. All rights reserved. Oka Vlhpisa \u2014 Water System Asset Manager. No part of this software may be reproduced or utilized in any form or by any means, electronic, mechanical, photocopying, recording, or otherwise, without written permission of the ${COPYRIGHT_HOLDER}. For permission inquiries, contact: ${COPYRIGHT_HOLDER} Environmental Protection Service, Office of Water Resource Management, P.O. Box 1210, Durant, OK 74702.`;
const FEEDBACK_URL = "https://forms.office.com/r/WaXubjEAJh";
const KEYS = { assets: "ov-assets-v4", settings: "ov-settings-v4", service: "ov-service-log-v4", history: "ov-asset-history-v4", workOrders: "ov-work-orders-v5", idCounter: "ov-asset-id-counter-v4", prefs: "ov-ui-prefs-v4", migratedFlag: "ov-migrated-to-v4", tutorialDone: "ov-tutorial-done-v4" };
const LEGACY = { v3Assets: "pws-assets-v3", v3Settings: "pws-settings-v3", v3Service: "pws-service-log-v3", v3History: "pws-asset-history-v3", v3Counter: "pws-asset-id-counter-v3", enhancedAssets: "pws-asset-manager-data", enhancedHistory: "pws-asset-history", enhancedIdCounter: "pws-asset-id-counter", proAssets: "pws-asset-manager-pro-v2", proSettings: "pws-settings-pro-v2", proService: "pws-service-log-v2" };
const CATEGORIES = ["Intake", "Treatment", "Storage", "Distribution", "Wells", "Power/Emergency", "Machinery", "Buildings", "Compliance", "Other"];
const CONDITIONS = [{ value: 5, label: "Excellent" }, { value: 4, label: "Good" }, { value: 3, label: "Fair" }, { value: 2, label: "Poor" }, { value: 1, label: "Critical" }];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Active", "Planning", "Retired"];
const HORIZON_OPTIONS = [10, 15, 20, 25, 30];
function uid(prefix = "id") { return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-6)}`; }
function buildDefaultFinancial() {
  return {
    schemaVersion: 1,
    assumptions: {
      laborEscalationRate: 3,
      overheadEscalationRate: 3,
      materialsEscalationRate: 3,
      contractorEscalationRate: 3,
      defaultBurdenPercent: 25,
      defaultOverheadAllocationMode: "percent-of-labor",
      defaultOverheadPercent: 15,
      workingHoursPerYear: 2080
    },
    laborRoles: [
      { id: uid("lr"), name: "Operator", active: true, payType: "salary", annualSalary: 0, hourlyRate: 0, burdenPercent: 25, overtimeMultiplier: 1.5, annualHours: 2080, defaultFte: 1, notes: "" }
    ],
    overheadCategories: [
      { id: uid("oh"), name: "Insurance / Admin", active: true, costType: "flat-annual", annualAmount: 0, monthlyAmount: 0, percent: 0, escalationRate: 3, notes: "" }
    ],
    maintenanceProfiles: [],
    budgetModel: {
      includeLaborInForecast: true,
      includeOverheadInForecast: true,
      includeMaintenanceInForecast: true,
      includeCapitalReplacementInForecast: true,
      contingencyPercent: 0
    }
  };
}
const DEFAULT_SETTINGS = { schemaVersion: 2, orgName: "Choctaw Nation EPS", pwsId: "", inflationRate: 3, reserveBalance: 0, annualContribution: 0, annualBudget: 0, annualGrantFunding: 0, reserveInterestRate: 0, scenarioMode: "Standard", showDepreciation: true, showWarranty: true, currency: "USD", depreciationMethod: "straight-line", financial: buildDefaultFinancial() };
const DEPRECIATION_METHODS = [{ value: "straight-line", label: "Straight-Line" }, { value: "declining-balance", label: "Declining Balance (150%)" }, { value: "sum-of-years", label: "Sum-of-Years Digits" }];
// FEATURE 2: Added imageUrl and docUrl to import mapping
const IMPORT_COLUMN_MAP = {
  id: ["id", "asset id", "assetid"], assetName: ["asset name", "assetname", "name", "asset", "description"], category: ["category", "cat"], type: ["type", "asset type"],
  quantity: ["quantity", "qty"], location: ["location", "loc", "site"], installYear: ["install year", "installyear", "year installed", "year"], installDate: ["install date", "installdate", "date installed"], usefulLife: ["useful life", "usefullife", "life"],
  condition: ["condition", "cond"], priority: ["priority", "pri"], status: ["status"], replacementCost: ["replacement cost", "replacementcost", "cost", "unit cost", "value"],
  manufacturer: ["manufacturer", "mfg"], model: ["model"], serialNum: ["serial", "serial number", "serialnum"], notes: ["notes", "comments"],
  lastMaint: ["last maintenance", "lastmaint", "last maint"], maintInt: ["maintenance interval", "maintint", "maint interval"], warrantyExp: ["warranty", "warranty expiration", "warrantyexp"],
  imageUrl: ["image url", "imageurl", "photo url", "photo link"], docUrl: ["doc url", "docurl", "document url", "manual url", "document link"],
  isCritical: ["is critical", "iscritical", "critical asset", "awia critical"], latitude: ["latitude", "lat"], longitude: ["longitude", "long", "lng"]
};
const currencyFormatter = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat(undefined);
function sameLocalDay(a, b = new Date()) { try { const da = new Date(a); return da.getFullYear() === b.getFullYear() && da.getMonth() === b.getMonth() && da.getDate() === b.getDate(); } catch { return false; } }
function getLastJsonBackupLabel(ts) { return ts ? (sameLocalDay(ts) ? "today" : new Date(ts).toLocaleDateString()) : "never"; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function toInt(v) { const n = parseInt(String(v).replace(/[^\d\-]/g, ""), 10); return Number.isFinite(n) ? n : null; }
function toFloat(v) { const n = parseFloat(String(v).replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; }
function safeClone(obj) { try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }
function normalizeLaborRole(raw = {}) {
  return { id: String(raw.id || uid("lr")), name: String(raw.name || "Labor Role").trim(), active: raw.active !== false, payType: raw.payType === "hourly" ? "hourly" : "salary", annualSalary: toFloat(raw.annualSalary) ?? 0, hourlyRate: toFloat(raw.hourlyRate) ?? 0, burdenPercent: toFloat(raw.burdenPercent) ?? 25, overtimeMultiplier: toFloat(raw.overtimeMultiplier) ?? 1.5, annualHours: toFloat(raw.annualHours) ?? 2080, defaultFte: toFloat(raw.defaultFte) ?? 1, notes: String(raw.notes || "") };
}
function normalizeOverheadCategory(raw = {}) {
  return { id: String(raw.id || uid("oh")), name: String(raw.name || "Overhead Category").trim(), active: raw.active !== false, costType: ["flat-annual", "flat-monthly", "percent-of-labor", "percent-of-direct-maintenance"].includes(raw.costType) ? raw.costType : "flat-annual", annualAmount: toFloat(raw.annualAmount) ?? 0, monthlyAmount: toFloat(raw.monthlyAmount) ?? 0, percent: toFloat(raw.percent) ?? 0, escalationRate: toFloat(raw.escalationRate) ?? 3, notes: String(raw.notes || "") };
}
function normalizeMaintenanceProfile(raw = {}) {
  return { id: String(raw.id || uid("mp")), name: String(raw.name || "Maintenance Profile").trim(), assetCategory: String(raw.assetCategory || "Other"), serviceFrequencyMonths: Math.max(1, toInt(raw.serviceFrequencyMonths) ?? 12), defaultLaborRoleId: String(raw.defaultLaborRoleId || ""), defaultLaborHours: toFloat(raw.defaultLaborHours) ?? 0, defaultMaterialsCost: toFloat(raw.defaultMaterialsCost) ?? 0, defaultContractorCost: toFloat(raw.defaultContractorCost) ?? 0, defaultOverheadMode: ["use-system-default", "none", "manual"].includes(raw.defaultOverheadMode) ? raw.defaultOverheadMode : "use-system-default", defaultOverheadAmount: toFloat(raw.defaultOverheadAmount) ?? 0, notes: String(raw.notes || "") };
}
function normalizeServiceCost(raw = {}) {
  const cost = { laborRoleId: String(raw.laborRoleId || ""), laborHours: toFloat(raw.laborHours) ?? 0, laborRate: toFloat(raw.laborRate), materialsCost: toFloat(raw.materialsCost) ?? 0, contractorCost: toFloat(raw.contractorCost) ?? 0, overheadAmount: toFloat(raw.overheadAmount) ?? 0, totalCost: toFloat(raw.totalCost) ?? null, costSource: raw.costSource || "manual" };
  const computed = (cost.laborRate != null ? (cost.laborHours * cost.laborRate) : 0) + cost.materialsCost + cost.contractorCost + cost.overheadAmount;
  cost.totalCost = cost.totalCost != null ? cost.totalCost : computed;
  return cost;
}
function normalizeServiceEntry(entry = {}) {
  const topLevelCost = toFloat(entry.cost);
  const topLevelHours = toFloat(entry.hours);
  const next = { ...entry };
  next.hours = topLevelHours ?? null;
  next.serviceCost = normalizeServiceCost({ laborRoleId: entry?.serviceCost?.laborRoleId || entry?.laborRoleId || "", laborHours: entry?.serviceCost?.laborHours ?? topLevelHours ?? 0, laborRate: entry?.serviceCost?.laborRate, materialsCost: entry?.serviceCost?.materialsCost ?? (topLevelCost ?? 0), contractorCost: entry?.serviceCost?.contractorCost ?? 0, overheadAmount: entry?.serviceCost?.overheadAmount ?? 0, totalCost: entry?.serviceCost?.totalCost ?? topLevelCost, costSource: entry?.serviceCost?.costSource || (entry?.serviceCost ? "manual" : "legacy") });
  next.cost = toFloat(next.serviceCost.totalCost) ?? topLevelCost ?? 0;
  return next;
}
function migrateSettings(rawSettings) {
  const incoming = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const financialRaw = incoming.financial && typeof incoming.financial === "object" ? incoming.financial : {};
  return { ...DEFAULT_SETTINGS, ...incoming, schemaVersion: 2, financial: { ...buildDefaultFinancial(), ...financialRaw, schemaVersion: 1, assumptions: { ...buildDefaultFinancial().assumptions, ...(financialRaw.assumptions || {}) }, laborRoles: Array.isArray(financialRaw.laborRoles) && financialRaw.laborRoles.length ? financialRaw.laborRoles.map(normalizeLaborRole) : buildDefaultFinancial().laborRoles.map(normalizeLaborRole), overheadCategories: Array.isArray(financialRaw.overheadCategories) && financialRaw.overheadCategories.length ? financialRaw.overheadCategories.map(normalizeOverheadCategory) : buildDefaultFinancial().overheadCategories.map(normalizeOverheadCategory), maintenanceProfiles: Array.isArray(financialRaw.maintenanceProfiles) ? financialRaw.maintenanceProfiles.map(normalizeMaintenanceProfile) : [], budgetModel: { ...buildDefaultFinancial().budgetModel, ...(financialRaw.budgetModel || {}) } } };
}
function getRoleLoadedHourlyRate(role, assumptions = {}) {
  if (!role) return 0;
  const annualHours = Math.max(1, toFloat(role.annualHours) ?? toFloat(assumptions.workingHoursPerYear) ?? 2080);
  const burdenPct = toFloat(role.burdenPercent) ?? toFloat(assumptions.defaultBurdenPercent) ?? 25;
  const baseRate = role.payType === "hourly" ? (toFloat(role.hourlyRate) ?? 0) : ((toFloat(role.annualSalary) ?? 0) / annualHours);
  return baseRate * (1 + (burdenPct / 100));
}
function getServiceEntryDirectCost(entry, settings) {
  const migrated = migrateSettings(settings);
  const financial = migrated.financial || buildDefaultFinancial();
  const cost = normalizeServiceCost(entry?.serviceCost || {});
  const role = (financial.laborRoles || []).find(r => r.id === cost.laborRoleId);
  const laborRate = cost.laborRate != null ? cost.laborRate : getRoleLoadedHourlyRate(role, financial.assumptions);
  const laborCost = (toFloat(cost.laborHours) ?? 0) * (toFloat(laborRate) ?? 0);
  const materialsCost = toFloat(cost.materialsCost) ?? 0;
  const contractorCost = toFloat(cost.contractorCost) ?? 0;
  const overheadAmount = toFloat(cost.overheadAmount) ?? 0;
  const directTotal = laborCost + materialsCost + contractorCost + overheadAmount;
  const fallback = toFloat(entry?.cost) ?? 0;
  return { laborCost, materialsCost, contractorCost, overheadAmount, total: directTotal > 0 ? directTotal : fallback };
}
function estimateAnnualMaintenanceFromProfiles(assetRows, settings) {
  const migrated = migrateSettings(settings);
  const financial = migrated.financial || buildDefaultFinancial();
  const profiles = financial.maintenanceProfiles || [];
  const assumptions = financial.assumptions || {};
  return (assetRows || []).filter(a => a && a.status !== "Retired" && a.maintenanceProfileId).reduce((sum, asset) => {
    const profile = profiles.find(p => p.id === asset.maintenanceProfileId);
    if (!profile) return sum;
    const role = (financial.laborRoles || []).find(r => r.id === profile.defaultLaborRoleId);
    const laborCost = (toFloat(profile.defaultLaborHours) ?? 0) * getRoleLoadedHourlyRate(role, assumptions);
    const materialsCost = toFloat(profile.defaultMaterialsCost) ?? 0;
    const contractorCost = toFloat(profile.defaultContractorCost) ?? 0;
    let overhead = 0;
    if (profile.defaultOverheadMode === "manual") overhead = toFloat(profile.defaultOverheadAmount) ?? 0;
    else if (profile.defaultOverheadMode === "use-system-default") overhead = (laborCost * ((toFloat(assumptions.defaultOverheadPercent) ?? 0) / 100));
    const perOccurrence = laborCost + materialsCost + contractorCost + overhead;
    const annualized = perOccurrence * (12 / Math.max(1, toInt(profile.serviceFrequencyMonths) ?? 12));
    return sum + (annualized * Math.max(1, toInt(asset.quantity) ?? 1));
  }, 0);
}
function estimateHistoricalAnnualMaintenance(serviceLog, settings) {
  const lookbackStart = new Date();
  lookbackStart.setMonth(lookbackStart.getMonth() - 12);
  const recent = (serviceLog || []).filter(e => {
    const d = e?.date ? new Date(`${e.date}T00:00:00`) : null;
    return d && !Number.isNaN(d.getTime()) && d >= lookbackStart;
  });
  return recent.reduce((sum, entry) => sum + getServiceEntryDirectCost(entry, settings).total, 0);
}
function buildOperatingForecastRows(assetRows, serviceLog, settings, startYear, horizonYears) {
  const migrated = migrateSettings(settings);
  const financial = migrated.financial || buildDefaultFinancial();
  const assumptions = financial.assumptions || {};
  const budgetModel = financial.budgetModel || {};
  const baseLabor = (financial.laborRoles || []).filter(r => r.active !== false).reduce((sum, role) => {
    const annualHours = Math.max(1, toFloat(role.annualHours) ?? toFloat(assumptions.workingHoursPerYear) ?? 2080);
    const loadedRate = getRoleLoadedHourlyRate(role, assumptions);
    const annualBase = role.payType === "hourly" ? ((toFloat(role.hourlyRate) ?? 0) * annualHours) : (toFloat(role.annualSalary) ?? 0);
    const annualLoaded = role.payType === "hourly" ? (loadedRate * annualHours) : (annualBase * (1 + ((toFloat(role.burdenPercent) ?? toFloat(assumptions.defaultBurdenPercent) ?? 25) / 100)));
    return sum + (annualLoaded * Math.max(0, toFloat(role.defaultFte) ?? 1));
  }, 0);
  const profileBasedMaintenance = estimateAnnualMaintenanceFromProfiles(assetRows, migrated);
  const historicalMaintenance = estimateHistoricalAnnualMaintenance(serviceLog, migrated);
  const baseMaintenance = Math.max(profileBasedMaintenance, historicalMaintenance, 0);
  return Array.from({ length: horizonYears }, (_, index) => {
    const year = startYear + index;
    const laborNeed = budgetModel.includeLaborInForecast === false ? 0 : Math.round(baseLabor * Math.pow(1 + ((toFloat(assumptions.laborEscalationRate) ?? 0) / 100), index));
    const maintenanceNeed = budgetModel.includeMaintenanceInForecast === false ? 0 : Math.round(baseMaintenance * Math.pow(1 + ((toFloat(assumptions.materialsEscalationRate) ?? 0) / 100), index));
    const overheadNeed = budgetModel.includeOverheadInForecast === false ? 0 : Math.round((financial.overheadCategories || []).filter(c => c.active !== false).reduce((sum, cat) => {
      if (cat.costType === "flat-monthly") return sum + ((toFloat(cat.monthlyAmount) ?? 0) * 12 * Math.pow(1 + ((toFloat(cat.escalationRate) ?? 0) / 100), index));
      if (cat.costType === "flat-annual") return sum + ((toFloat(cat.annualAmount) ?? 0) * Math.pow(1 + ((toFloat(cat.escalationRate) ?? 0) / 100), index));
      if (cat.costType === "percent-of-labor") return sum + (laborNeed * ((toFloat(cat.percent) ?? 0) / 100));
      if (cat.costType === "percent-of-direct-maintenance") return sum + (maintenanceNeed * ((toFloat(cat.percent) ?? 0) / 100));
      return sum;
    }, 0));
    const operatingNeed = laborNeed + maintenanceNeed + overheadNeed;
    return { year, laborNeed, maintenanceNeed, overheadNeed, operatingNeed, profileBasedMaintenance, historicalMaintenance };
  });
}
function normalizeText(v) { return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " "); }
function parseBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = normalizeText(v);
  if (!s) return false;
  return ["true", "1", "yes", "y", "checked", "critical"].includes(s);
}
function assetMatchKey(asset) {
  return [normalizeText(asset?.assetName || asset?.name), normalizeText(asset?.location), normalizeText(asset?.serialNum)].join("|");
}
function findExistingAssetMatch(assetRows, incoming) {
  const incomingId = String(incoming?.id || "").trim();
  if (incomingId) {
    const byId = (assetRows || []).find(a => String(a?.id || "").trim() === incomingId);
    if (byId) return byId;
  }
  const incomingSerial = normalizeText(incoming?.serialNum);
  if (incomingSerial) {
    const bySerial = (assetRows || []).find(a => normalizeText(a?.serialNum) === incomingSerial);
    if (bySerial) return bySerial;
  }
  const incomingNameLocation = [normalizeText(incoming?.assetName || incoming?.name), normalizeText(incoming?.location)].join("|");
  if (incomingNameLocation !== "|") {
    const byNameLocation = (assetRows || []).find(a => [normalizeText(a?.assetName || a?.name), normalizeText(a?.location)].join("|") === incomingNameLocation);
    if (byNameLocation) return byNameLocation;
  }
  return null;
}
function isoDate(d = new Date()) { return d.toISOString().split("T")[0]; }
function safeJSONParse(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
function readLS(key, fallback) { try { return safeJSONParse(localStorage.getItem(key), fallback); } catch { return fallback; } }
function writeLS(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
// IndexedDB silent backup
const IDB_NAME = "ov-backup-db";
const IDB_STORE = "snapshots";
function openIDB() { return new Promise((resolve, reject) => { const req = indexedDB.open(IDB_NAME, 1); req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function writeIDB(data) { try { const db = await openIDB(); const tx = db.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).put(data, "latest"); await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; }); db.close(); } catch(e) { console.warn("IDB backup failed:", e); } }
async function readIDB() { try { const db = await openIDB(); const tx = db.transaction(IDB_STORE, "readonly"); const req = tx.objectStore(IDB_STORE).get("latest"); return new Promise((res) => { req.onsuccess = () => { db.close(); res(req.result || null); }; req.onerror = () => { db.close(); res(null); }; }); } catch { return null; } }
function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
function escHtml(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }
function formatDateTime(ts) { if (!ts) return ""; try { const d = new Date(ts); if (Number.isNaN(d.getTime())) return String(ts); return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return String(ts); } }
function addMonths(dateStr, months) { if (!dateStr || !months) return null; const d = new Date(dateStr + "T00:00:00"); if (Number.isNaN(d.getTime())) return null; const m = d.getMonth(); d.setMonth(m + months); if (d.getMonth() !== ((m + months) % 12 + 12) % 12) d.setDate(0); return d; }
function calcRemaining(installYear, usefulLife, installDate) { const y = getInstallYear(installYear, installDate); const life = toInt(usefulLife); if (!y || !life) return null; return Math.max(0, life - (new Date().getFullYear() - y)); }
function calcReplaceYear(installYear, usefulLife, installDate) { const y = getInstallYear(installYear, installDate); const life = toInt(usefulLife); if (!y || !life) return null; return y + life; }
function calcDepreciated(unitCost, installYear, usefulLife, installDate, method) {
  const cost = toFloat(unitCost); const y = getInstallYear(installYear, installDate); const life = toInt(usefulLife);
  if (cost == null || !y || !life) return null;
  const age = Math.max(0, new Date().getFullYear() - y);
  if (method === "declining-balance") {
    const rate = 1.5 / life;
    let val = cost;
    for (let i = 0; i < Math.min(age, life); i++) val = val * (1 - rate);
    return Math.round(Math.max(0, val));
  }
  if (method === "sum-of-years") {
    const soy = (life * (life + 1)) / 2;
    let deprecTotal = 0;
    for (let i = 1; i <= Math.min(age, life); i++) deprecTotal += cost * ((life - i + 1) / soy);
    return Math.round(Math.max(0, cost - deprecTotal));
  }
  return Math.round(cost * clamp(1 - (age / life), 0, 1));
}
function calcRisk(condition, installYear, usefulLife, priority, installDate, isCritical) { const cond = toInt(condition); const y = getInstallYear(installYear, installDate); const life = toInt(usefulLife); if (!cond || !y || !life) return null; const age = clamp(new Date().getFullYear() - y, 0, life); const agePct = life ? age / life : 0; const condPct = clamp((6 - cond) / 5, 0, 1); let risk = Math.round((agePct * 0.65 + condPct * 0.35) * 100); if (priority === "Critical") risk = clamp(risk + 10, 0, 100); if (priority === "High") risk = clamp(risk + 5, 0, 100); if (isCritical) risk = clamp(risk + 8, 0, 100); return risk; }
function getInstallYear(installYear, installDate) { if (installDate) { const s = String(installDate).trim(); if (/^\d{4}/.test(s)) { const y = toInt(s.substring(0, 4)); if (y && y >= 1900 && y <= 2100) return y; } } return toInt(installYear) ?? null; }
function formatInstallDate(a) { if (a.installDate) { const s = String(a.installDate).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { try { return new Date(s+"T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}); } catch{} } if (/^\d{4}-\d{2}$/.test(s)) { try { return new Date(s+"-01T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short"}); } catch{} } if (/^\d{4}$/.test(s)) return s; return s; } if (a.installYear) return String(a.installYear); return null; }
function riskBucket(risk) { if (risk == null) return { label: "—", cls: "risk-low" }; if (risk >= 80) return { label: "Critical", cls: "risk-critical" }; if (risk >= 60) return { label: "High", cls: "risk-high" }; if (risk >= 40) return { label: "Medium", cls: "risk-medium" }; return { label: "Low", cls: "risk-low" }; }
function maintStatus(lastMaint, maintIntMonths) { const months = toInt(maintIntMonths); if (!months || !lastMaint) return null; const due = addMonths(lastMaint, months); if (!due) return null; const days = Math.round((due.getTime() - new Date(isoDate() + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)); if (days < 0) return { status: "overdue", dueDate: isoDate(due), days }; if (days <= 30) return { status: "due", dueDate: isoDate(due), days }; return { status: "ok", dueDate: isoDate(due), days }; }
function warrantyStatus(warrantyExp) { if (!warrantyExp) return null; const d = new Date(warrantyExp + "T00:00:00"); if (Number.isNaN(d.getTime())) return null; const days = Math.round((d.getTime() - new Date(isoDate() + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)); if (days < 0) return { status: "expired", days }; if (days <= 90) return { status: "expiring", days }; return { status: "ok", days }; }

function forecastScenarioMultiplier(mode) {
  if (mode === "Conservative") return 1.2;
  if (mode === "Aggressive" || mode === "Stretch") return 0.9;
  return 1;
}
function assessForecastConfidence(asset) {
  const missing = [];
  if (!getInstallYear(asset.installYear, asset.installDate)) missing.push("install date/year");
  if (!(toInt(asset.usefulLife) > 0)) missing.push("useful life");
  if (!(toFloat(asset.replacementCost) > 0)) missing.push("replacement cost");
  if (!(toInt(asset.condition) > 0)) missing.push("condition");
  if (!asset.category) missing.push("category");
  const score = Math.max(0, 100 - missing.length * 20);
  return { score, label: score >= 80 ? "High" : score >= 60 ? "Medium" : "Low", missing };
}
function detectDuplicateAssetGroups(assetRows) {
  const groups = new Map();
  (assetRows || []).forEach(a => {
    const key = [String(a.assetName || "").trim().toLowerCase(), String(a.location || "").trim().toLowerCase(), String(a.serialNum || "").trim().toLowerCase()].join("|");
    if (key === "||") return;
    const arr = groups.get(key) || [];
    arr.push(a);
    groups.set(key, arr);
  });
  return Array.from(groups.values()).filter(g => g.length > 1);
}
function buildForecastModel(assetRows, opts = {}) {
  const startYear = toInt(opts.startYear) ?? new Date().getFullYear();
  const horizonYears = Math.max(1, toInt(opts.horizonYears) ?? 5);
  const inflationRate = toFloat(opts.inflationRate) ?? 3;
  const annualContribution = toFloat(opts.annualContribution) ?? 0;
  const annualGrantFunding = toFloat(opts.annualGrantFunding) ?? 0;
  const reserveInterestRate = toFloat(opts.reserveInterestRate) ?? 0;
  const startingReserve = toFloat(opts.startingReserve) ?? 0;
  const annualBudget = toFloat(opts.annualBudget) ?? 0;
  const scenarioMode = opts.scenarioMode || "Standard";
  const scenarioMultiplier = forecastScenarioMultiplier(scenarioMode);
  const activeSettings = migrateSettings(opts.settings || DEFAULT_SETTINGS);
  const operatingRows = buildOperatingForecastRows(assetRows, opts.serviceLog || [], activeSettings, startYear, horizonYears);
  const includeCapital = activeSettings.financial?.budgetModel?.includeCapitalReplacementInForecast !== false;
  const contingencyPercent = toFloat(activeSettings.financial?.budgetModel?.contingencyPercent) ?? 0;
  const baseItems = (assetRows || []).filter(a => a && a.status !== "Retired").map(a => {
    const replaceYear = calcReplaceYear(a.installYear, a.usefulLife, a.installDate);
    if (!replaceYear) return null;
    const qty = Math.max(0, toInt(a.quantity) ?? 1);
    const base = (toFloat(a.replacementCost) ?? 0) * qty;
    const risk = calcRisk(a.condition, a.installYear, a.usefulLife, a.priority, a.installDate, a.isCritical);
    const confidence = assessForecastConfidence(a);
    return { id: a.id, assetName: a.assetName, category: a.category, location: a.location, replaceYear, baseCost: base, risk, confidence };
  }).filter(Boolean);
  let reserve = startingReserve;
  let backlog = [];
  const years = Array.from({ length: horizonYears }, (_, i) => startYear + i);
  return years.map((year, idx) => {
    const operating = operatingRows[idx] || { laborNeed: 0, maintenanceNeed: 0, overheadNeed: 0, operatingNeed: 0 };
    const inflateCost = (baseCost) => Math.round((baseCost || 0) * Math.pow(1 + (inflationRate / 100), year - startYear) * scenarioMultiplier);
    const carriedForward = backlog.map(item => {
      const overdueYears = Math.max(0, year - item.replaceYear);
      const inflatedCost = inflateCost(item.baseCost);
      return { ...item, overdueYears, lane: "Overdue / Deferred", inflatedCost, reason: `Overdue / Deferred because target replace year is ${item.replaceYear}${overdueYears ? ` and it is ${overdueYears} year(s) late` : ""}.` };
    });
    const scheduled = baseItems.filter(item => item.replaceYear === year).map(item => ({ ...item, overdueYears: 0, lane: "Scheduled", inflatedCost: inflateCost(item.baseCost), reason: `Scheduled because target replace year is ${item.replaceYear}.` }));
    const currentNeedItems = [...carriedForward, ...scheduled].sort((a, b) => ((b.overdueYears ?? 0) - (a.overdueYears ?? 0)) || ((b.risk ?? 0) - (a.risk ?? 0)) || ((b.inflatedCost ?? 0) - (a.inflatedCost ?? 0)));
    const scheduledNeed = includeCapital ? scheduled.reduce((s, i) => s + (i.inflatedCost || 0), 0) : 0;
    const overdueNeed = includeCapital ? carriedForward.reduce((s, i) => s + (i.inflatedCost || 0), 0) : 0;
    const deferredIn = overdueNeed;
    reserve = reserve + annualContribution + annualGrantFunding + (reserve * (reserveInterestRate / 100));
    const availableFunding = annualBudget > 0 ? Math.min(reserve, annualBudget) : reserve;
    let remainingFunding = availableFunding;
    const operatingNeedWithContingency = Math.round((operating.operatingNeed || 0) * (1 + (contingencyPercent / 100)));
    const operatingFunded = Math.min(remainingFunding, operatingNeedWithContingency);
    remainingFunding = Math.max(0, remainingFunding - operatingFunded);
    const fundedAssets = [];
    const deferredAssets = [];
    currentNeedItems.forEach(item => {
      if ((item.inflatedCost || 0) <= remainingFunding) {
        remainingFunding -= item.inflatedCost || 0;
        fundedAssets.push({ ...item, funded: true, fundedAmount: item.inflatedCost || 0 });
      } else {
        deferredAssets.push({ ...item, funded: false, fundedAmount: 0 });
      }
    });
    const fundedCapital = fundedAssets.reduce((sum, item) => sum + (item.fundedAmount || 0), 0);
    const funded = operatingFunded + fundedCapital;
    reserve = Math.max(0, reserve - funded);
    const capitalNeed = scheduledNeed + overdueNeed;
    const totalNeed = capitalNeed + operatingNeedWithContingency;
    const operatingShortfall = Math.max(0, operatingNeedWithContingency - operatingFunded);
    const capitalShortfall = Math.max(0, capitalNeed - fundedCapital);
    const shortfall = operatingShortfall + capitalShortfall;
    backlog = deferredAssets.map(item => ({ id: item.id, assetName: item.assetName, category: item.category, location: item.location, replaceYear: item.replaceYear, baseCost: item.baseCost, risk: item.risk, confidence: item.confidence }));
    const highConfidenceCount = currentNeedItems.filter(i => i.confidence.label === "High").length;
    const lowConfidenceCount = currentNeedItems.filter(i => i.confidence.label === "Low").length;
    const budgetStatus = annualBudget > 0 ? (totalNeed > annualBudget ? "Over annual budget" : "Within annual budget") : "No annual budget set";
    return { year, totalCost: totalNeed, capitalNeed, operatingNeed: operatingNeedWithContingency, laborNeed: operating.laborNeed || 0, maintenanceNeed: operating.maintenanceNeed || 0, overheadNeed: operating.overheadNeed || 0, scheduledNeed, overdueNeed, deferredIn, funded, fundedCapital, fundedOperating: operatingFunded, shortfall, endingReserve: reserve, annualBudget, budgetStatus, assets: currentNeedItems, fundedAssets, deferredAssets, highConfidenceCount, lowConfidenceCount };
  });
}

function buildFiveYearCIP(assetRows, inflationRate = 3, startYear = new Date().getFullYear(), horizonYears = 5, settings = {}) {
  return buildForecastModel(assetRows, { ...settings, inflationRate, startYear, horizonYears });
}

function projectFunding(cip) {
  return (cip || []).map(y => ({ year: y.year, need: y.totalCost || 0, funded: y.funded || 0, shortfall: y.shortfall || 0, endingReserve: y.endingReserve || 0, overdueNeed: y.overdueNeed || 0, deferredIn: y.deferredIn || 0 }));
}
function normalizeAsset(raw) {
  const a = { ...raw };
  Object.keys(a).forEach(k => { if (k.startsWith("_")) delete a[k]; });
  if (a.name && !a.assetName) a.assetName = a.name;
  if (a.assetName != null) a.assetName = String(a.assetName).trim();
  if (a.location != null) a.location = String(a.location).trim();
  if (a.serialNum != null) a.serialNum = String(a.serialNum).trim();
  a.quantity = toInt(a.quantity) ?? (a.quantity === 0 ? 0 : 1);
  a.installDate = a.installDate || "";
  a.installYear = toInt(a.installYear) ?? null;
  a.usefulLife = toInt(a.usefulLife) ?? null;
  a.condition = toInt(a.condition) ?? 3;
  a.replacementCost = toFloat(a.replacementCost) ?? null;
  a.maintInt = toInt(a.maintInt) ?? null;
  a.category = a.category || "Other";
  a.priority = a.priority || "Medium";
  a.status = a.status || "Active";
  a.imageUrl = a.imageUrl || "";
  a.docUrl = a.docUrl || "";
  a.maintenanceProfileId = String(a.maintenanceProfileId || "");
  a.isCritical = parseBool(a.isCritical);
  a.photos = Array.isArray(a.photos) ? a.photos : [];
  const lat = a.latitude === "" || a.latitude == null ? null : toFloat(a.latitude);
  const lon = a.longitude === "" || a.longitude == null ? null : toFloat(a.longitude);
  a.latitude = lat == null ? "" : lat;
  a.longitude = lon == null ? "" : lon;
  ["lastMaint", "warrantyExp"].forEach(k => {
    if (!a[k]) return;
    if (typeof a[k] === "number") {
      const date = XLSX.SSF.parse_date_code(a[k]);
      if (date) a[k] = new Date(Date.UTC(date.y, date.m - 1, date.d)).toISOString().split("T")[0];
    } else {
      const s = String(a[k]).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) a[k] = s;
      else {
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) a[k] = d.toISOString().split("T")[0];
      }
    }
  });
  return a;
}
function getChanges(prev, next) { const changes = {}; const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]); keys.forEach(k => { if (k === "updatedAt" || k === "createdAt" || k.startsWith("_")) return; const a = prev?.[k]; const b = next?.[k]; if (!((a === b) || (a == null && b === "") || (b == null && a === ""))) changes[k] = { from: a, to: b }; }); return Object.keys(changes).length ? changes : null; }
// Step 3: Global flag to suppress localStorage writes during Scenario Mode
const _scenarioWriteBlock = { active: false };
function useLocalStorageState(key, initialValue) { const [state, setState] = useState(() => readLS(key, initialValue)); const timeoutRef = useRef(null); const suppressRef = useRef(false); useEffect(() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => { if (!_scenarioWriteBlock.active) { writeLS(key, state); if (typeof BroadcastChannel !== "undefined") { try { const bc = new BroadcastChannel("ov-sync"); bc.postMessage({ key, ts: Date.now() }); bc.close(); } catch(e) {} } } }, 150); return () => timeoutRef.current && clearTimeout(timeoutRef.current); }, [key, state]); useEffect(() => { function onStorage(e) { if (e.key === key && e.newValue != null) { try { const parsed = JSON.parse(e.newValue); suppressRef.current = true; setState(parsed); setTimeout(() => { suppressRef.current = false; }, 200); } catch {} } } window.addEventListener("storage", onStorage); let bc; if (typeof BroadcastChannel !== "undefined") { try { bc = new BroadcastChannel("ov-sync"); bc.onmessage = (e) => { if (e.data?.key === key) { const fresh = readLS(key, initialValue); suppressRef.current = true; setState(fresh); setTimeout(() => { suppressRef.current = false; }, 200); } }; } catch(e) {} } return () => { window.removeEventListener("storage", onStorage); if (bc) bc.close(); }; }, [key]); return [state, setState]; }
// FEATURE 2: Added photo, file icons. FEATURE 4: calendar. FEATURE 5: bulkEdit
function Icon({ name, size = 18, className = "" }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />, edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></>, download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></>,
    help: <><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 4.6 2.6c-.9.6-1.7 1.1-1.7 2.4"/><path d="M12 17h.01"/></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5.7 5.6L3 18l3 3 6.1-6a4 4 0 0 0 5.6-5.7l-2.3 2.3-3-3z"/></>,
    printer: <><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></>, x: <path d="M18 6L6 18M6 6l12 12"/>, check: <path d="M20 6L9 17l-5-5"/>,
    photo: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></>,
    qr: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></>,
    bulkEdit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    bookOpen: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>,
    chevronRight: <path d="M9 18l6-6-6-6"/>,
    chevronLeft: <path d="M15 18l-6-6 6-6"/>,
    moreH: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
    award: <><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    messageBug: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></>,
    externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></>, save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></>, refresh: <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    flask: <><path d="M9 3h6"/><path d="M10 3v7.4a2 2 0 0 1-.5 1.3L4 19a2.5 2.5 0 0 0 2 4h12a2.5 2.5 0 0 0 2-4l-5.5-7.3a2 2 0 0 1-.5-1.3V3"/></>
  };
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || null}</svg>;
}
function Logo({ orgName, pwsId, sealOk = true }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:"1.1rem"}}>
      <div style={{width:78,height:78,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {sealOk ? <img src="HeroImage_CH.png" alt="Great Seal of the Choctaw Nation" width="78" height="78" style={{objectFit:"contain",display:"block"}} /> : <div style={{width:72,height:72,borderRadius:999,background:"rgba(255,255,255,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,textAlign:"center",padding:8,lineHeight:1.1}}>CNO<br/>EPS</div>}
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",alignSelf:"stretch",gap:0,flexShrink:0,padding:"4px 0"}}>
        <div style={{flex:1,width:1,background:"rgba(212,217,106,0.5)"}} />
        <div style={{width:8,height:8,background:"#D4D96A",transform:"rotate(45deg)",flexShrink:0,margin:"3px 0"}} />
        <div style={{flex:1,width:1,background:"rgba(212,217,106,0.5)"}} />
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:0,lineHeight:1.3}}>
        <div style={{fontFamily:"'Gill Sans','Gill Sans MT','Trebuchet MS','DM Sans',sans-serif",fontSize:"1.05rem",fontWeight:700,letterSpacing:"0.02em",color:"#fff"}}>Choctaw Nation of Oklahoma</div>
        <div style={{fontFamily:"'Gill Sans','Gill Sans MT','Trebuchet MS','DM Sans',sans-serif",fontSize:"0.78rem",fontWeight:600,color:"#76B900",letterSpacing:"0.01em"}}>Environmental Protection Service</div>
        <div style={{width:"100%",height:1,background:"#D4D96A",margin:"3px 0",opacity:0.6}} />
        <div style={{fontFamily:"'Gill Sans','Gill Sans MT','Trebuchet MS','DM Sans',sans-serif",fontSize:"0.76rem",fontWeight:400,color:"rgba(255,255,255,0.85)",letterSpacing:"0.02em"}}>Office of Water Resource Management</div>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginTop:4,paddingTop:4,borderTop:"1px solid rgba(255,255,255,0.1)"}}>
          <div style={{fontFamily:"'Gill Sans','Gill Sans MT','Trebuchet MS','DM Sans',sans-serif",fontSize:"0.82rem",fontWeight:700,color:"#EFF2CC",letterSpacing:"0.02em",display:"flex",alignItems:"center",gap:"0.4rem"}}>{APP_NAME} <span style={{display:"inline-block",width:6,height:6,background:"#D4D96A",transform:"rotate(45deg)",flexShrink:0}}></span> {APP_SUBTITLE}</div>
          {pwsId ? <span style={{fontFamily:"'Gill Sans','Gill Sans MT','Trebuchet MS','DM Sans',sans-serif",fontSize:"0.78rem",color:"rgba(255,255,255,0.5)"}}>&middot; {pwsId}</span> : null}
        </div>
      </div>
    </div>
  );
}
function Toast({ toast, onClose, tutorialActive }) { if (!toast) return null; const bg = toast.type === "error" ? "bg-red-600" : toast.type === "warn" ? "bg-amber-600" : "bg-emerald-600"; return <div className={`fixed ${tutorialActive ? "bottom-[360px]" : "bottom-5"} right-5 z-50 no-print transition-all`}><div className={`${bg} text-white px-4 py-3 rounded-xl shadow-lg flex items-start gap-3 max-w-md`}><div className="mt-0.5">{toast.type === "error" ? "⚠️" : toast.type === "warn" ? "🟡" : "✅"}</div><div className="text-sm font-medium">{toast.msg}</div><button className="ml-auto opacity-80 hover:opacity-100" onClick={onClose}><Icon name="x" /></button></div></div>; }
function Modal({ title, subtitle, isOpen, onClose, children, footer, size = "lg" }) { const maxW = size === "sm" ? "max-w-md" : size === "md" ? "max-w-2xl" : "max-w-4xl"; useEffect(() => { if (!isOpen) return; function onKey(e) { if (e.key === "Escape") onClose(); } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [isOpen, onClose]); if (!isOpen) return null; return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay no-print" role="dialog"><div className="absolute inset-0 bg-black/40" onClick={onClose}></div><div className={`relative w-full ${maxW} glass-card p-5 sm:p-6 animate-in max-h-[90vh] overflow-y-auto`}><div className="flex items-start gap-3"><div className="min-w-0"><div className="text-lg font-bold text-slate-900">{title}</div>{subtitle ? <div className="text-sm text-slate-500 mt-1">{subtitle}</div> : null}<div style={{width:40,height:3,background:"linear-gradient(90deg, #1E3D3B, #76B900)",borderRadius:2,marginTop:8}}></div></div><button className="ml-auto p-2 rounded-lg hover:bg-slate-100" onClick={onClose}><Icon name="x" /></button></div><div className="mt-4">{children}</div>{footer ? <div className="mt-5 pt-4 border-t border-slate-200">{footer}</div> : null}</div></div>; }
function ConfirmDialog({ isOpen, title, body, confirmText="Confirm", cancelText="Cancel", danger=false, onConfirm, onCancel }) { return <Modal title={title} subtitle={body} isOpen={isOpen} onClose={onCancel} size="sm" footer={<div className="flex items-center justify-end gap-2"><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onCancel}>{cancelText}</button><button className={`px-4 py-2 rounded-lg font-semibold text-white ${danger ? "bg-red-600 hover:bg-red-700" : "bg-[#76B900] hover:bg-[#5A9400]"}`} onClick={onConfirm}>{confirmText}</button></div>}><div /></Modal>; }
function Chip({ label, cls }) { if (!label) return null; return <span className={`chip ${cls}`}>{label}</span>; }
function AlertRow({ count, bgCls, borderCls, textCls, subtextCls, label, subtitle, onClick }) {
  const isEmpty = count === 0;
  if (isEmpty) return <div className={`w-full flex items-center justify-between p-3 rounded-xl ${bgCls} ${borderCls} opacity-50`}>
    <div className="flex items-center gap-2"><div className={`font-semibold ${textCls}`}>{label}</div><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">All clear</span></div>
    <div className={`font-semibold ${textCls}`}>0</div>
  </div>;
  return <button className={`w-full flex items-center justify-between p-3 rounded-xl ${bgCls} ${borderCls} text-left hover:opacity-80 transition cursor-pointer`} onClick={onClick}>
    <div><div className={`font-semibold ${textCls}`}>{label}</div>{subtitle && count > 0 && <div className={`text-xs ${subtextCls || textCls} mt-0.5`}>{subtitle}</div>}</div>
    <div className="flex items-center gap-2"><div className={`font-semibold ${textCls}`}>{count}</div><Icon name="chevronRight" size={14} className={textCls} /></div>
  </button>;
}
function SectionHeader({ badge, title, subtitle, right }) { return <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4"><div>{badge ? <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide" style={{background:"rgba(118,185,0,0.1)", color:"#5A9400"}}><span style={{width:6,height:6,background:"#76B900",transform:"rotate(45deg)",display:"inline-block",borderRadius:1}}></span>{badge}</div> : null}<div className="text-2xl font-semibold text-slate-900 mt-2">{title}</div>{subtitle ? <div className="text-sm text-slate-600 mt-1 max-w-3xl">{subtitle}</div> : null}</div>{right ? <div className="flex items-center gap-2 flex-wrap">{right}</div> : null}</div>; }
function SortableTH({ label, field, sortBy, sortDir, onSort }) { const active = sortBy === field; return <th className="py-2 px-2 select-none cursor-pointer" onClick={onSort}><div className="flex items-center gap-1"><span>{label}</span>{active ? <span className="text-slate-400">{sortDir === "asc" ? "▲" : "▼"}</span> : <span className="text-slate-300">↕</span>}</div></th>; }
function Assumption({ label, value }) { return <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-slate-700 font-semibold">{label}</div><div className="text-slate-900 font-semibold">{value}</div></div>; }
function BreakdownTable({ rows }) { return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Group</th><th className="py-2">Count</th><th className="py-2">Value</th></tr></thead><tbody>{rows.map(r => <tr key={r.label} className="border-t border-slate-100"><td className="py-2 font-semibold text-slate-900">{r.label}</td><td className="py-2">{numberFormatter.format(r.count)}</td><td className="py-2">{currencyFormatter.format(r.value)}</td></tr>)}{!rows.length && <tr><td colSpan="3" className="py-8 text-center text-slate-500">No data</td></tr>}</tbody></table></div>; }
function ReportCard({ label, value }) { return <div className="p-4 rounded-xl bg-slate-50 border border-slate-100" style={{borderLeft:"3px solid #76B900"}}><div className="text-xs font-medium text-slate-500 uppercase">{label}</div><div className="text-2xl font-semibold text-slate-900 mt-1">{value}</div></div>; }
function Toggle({ label, checked, onChange }) { return <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-sm font-semibold text-slate-900">{label}</div><button type="button" onClick={() => onChange(!checked)} className={`w-12 h-7 rounded-full transition flex items-center ${checked ? "bg-[#76B900] justify-end" : "bg-slate-300 justify-start"}`}><div className="w-5 h-5 bg-white rounded-full shadow mx-1"></div></button></div>; }
function SettingField({ label, value, onChange }) { return <div><label className="text-xs font-medium text-slate-600 uppercase">{label}</label><input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" /></div>; }
function FormattedDollarInput({ label, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value ?? ""));
  const formatted = useMemo(() => { const n = toFloat(value); return n != null ? numberFormatter.format(n) : ""; }, [value]);
  return <div>
    <label className="text-xs font-medium text-slate-600 uppercase">{label}</label>
    <div className="flex items-center mt-1">
      <span className="px-2 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-sm text-slate-500 font-semibold">$</span>
      <input
        value={editing ? raw : formatted}
        onFocus={() => { setEditing(true); setRaw(String(value ?? "")); }}
        onChange={(e) => { setRaw(e.target.value); const n = toFloat(e.target.value); if (n != null) onChange(n); else if (e.target.value === "" || e.target.value === "-") onChange(0); }}
        onBlur={() => setEditing(false)}
        className="w-full px-3 py-2 border border-slate-200 rounded-r-lg bg-white"
      />
    </div>
  </div>;
}
// Global HelpLink component - uses CustomEvent so it works from any component
function HelpLink({ tab, scrollTo }) {
  return <button type="button" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("ov-open-help", { detail: { tab: tab || "definitions", scrollTo } })); }} className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 hover:bg-[#76B900] hover:text-white text-slate-500 text-[9px] font-semibold leading-none cursor-pointer align-middle ml-1 transition" title="Learn more">?</button>;
}
// FEATURE 2: AssetForm includes imageUrl and docUrl fields
function AssetForm({ initial, catalog, maintenanceProfiles = [], onSubmit, onCancel, onSavePhoto, onSaveDocument, onSaveInspection, onDeleteFile, assetFiles }) {
  const [data, setData] = useState(() => normalizeAsset(initial || { assetName: "", category: "Other", type: "", status: "Active", priority: "Medium", quantity: 1, location: "", installDate: "", installYear: null, usefulLife: null, condition: 3, replacementCost: null, manufacturer: "", model: "", serialNum: "", lastMaint: "", maintInt: null, warrantyExp: "", notes: "", imageUrl: "", docUrl: "", maintenanceProfileId: "", isCritical: false, latitude: "", longitude: "" }));
  const [catalogSearch, setCatalogSearch] = useState("");
  const filteredCatalog = useMemo(() => { const s = catalogSearch.trim().toLowerCase(); if (!s) return catalog.slice(0, 30); return catalog.filter(c => (c.item || "").toLowerCase().includes(s) || (c.category || "").toLowerCase().includes(s)).slice(0, 50); }, [catalog, catalogSearch]);
  function applyCatalogItem(c) { setData(prev => normalizeAsset({ ...prev, assetName: prev.assetName || c.item, category: c.category || prev.category, type: c.type || prev.type, usefulLife: prev.usefulLife || c.expectedLife || null, replacementCost: prev.replacementCost || c.estimatedPrice || null, maintInt: prev.maintInt || c.maintInt || null })); }
  function update(k, v) { setData(prev => ({ ...prev, [k]: v })); }
  function submit() {
    const cleaned = normalizeAsset(data);
    delete cleaned._maintIntDisplay; delete cleaned._maintIntUnit; delete cleaned._dateMode;
    if (!cleaned.assetName?.trim()) return alert("Asset name is required.");
    const iy = getInstallYear(cleaned.installYear, cleaned.installDate);
    const ul = toInt(cleaned.usefulLife);
    const rc = toFloat(cleaned.replacementCost);
    const lat = cleaned.latitude === "" ? null : toFloat(cleaned.latitude);
    const lon = cleaned.longitude === "" ? null : toFloat(cleaned.longitude);
    if (iy && (iy < 1900 || iy > new Date().getFullYear() + 5)) return alert("Install year looks out of range. Check the date/year.");
    if (ul != null && ul <= 0) return alert("Useful life must be greater than 0.");
    if (rc != null && rc < 0) return alert("Replacement cost cannot be negative.");
    if (iy && ul && (iy + ul) < iy) return alert("Replacement year would be before install year. Check useful life.");
    if (toInt(cleaned.quantity) != null && toInt(cleaned.quantity) < 0) return alert("Quantity cannot be negative.");
    if (cleaned.lastMaint && cleaned.maintInt != null && cleaned.maintInt <= 0) return alert("Maintenance interval must be greater than 0 when a maintenance date is entered.");
    if (cleaned.latitude !== "" && (lat == null || lat < -90 || lat > 90)) return alert("Latitude must be between -90 and 90.");
    if (cleaned.longitude !== "" && (lon == null || lon < -180 || lon > 180)) return alert("Longitude must be between -180 and 180.");
    onSubmit(cleaned);
  }
  return <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div className="lg:col-span-2 space-y-4">
      <div className="glass-card p-4 border border-emerald-200 bg-emerald-50/70"><div className="text-sm font-semibold text-emerald-900">Required now</div><div className="text-sm text-emerald-800 mt-1">Fill in the minimum details needed to get the asset into the system and make the forecast usable.</div></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="text-xs font-medium text-slate-600 uppercase">Asset name *</label><input value={data.assetName || ""} onChange={(e) => update("assetName", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="e.g., High Service Pump #1"/></div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Category</label><select value={data.category || "Other"} onChange={(e) => update("category", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Type</label><input value={data.type || ""} onChange={(e) => update("type", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Pump / Valve / Electrical"/></div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Maintenance profile</label><select value={data.maintenanceProfileId || ""} onChange={(e) => update("maintenanceProfileId", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="">None assigned</option>{maintenanceProfiles.map(mp => <option key={mp.id} value={mp.id}>{mp.name}</option>)}</select><div className="text-[11px] text-slate-500 mt-1">Links this asset to recurring maintenance cost assumptions.</div></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-slate-600 uppercase">Status</label><select value={data.status || "Active"} onChange={(e) => update("status", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase">Priority</label><select value={data.priority || "Medium"} onChange={(e) => update("priority", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">
              <option value="Critical">Critical - must function for the system to operate</option>
              <option value="High">High - major impact if it fails</option>
              <option value="Medium">Medium - standard importance</option>
              <option value="Low">Low - minor or redundant component</option>
            </select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-slate-600 uppercase">Quantity</label><input type="number" value={data.quantity ?? 1} onChange={(e) => update("quantity", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" min="0"/></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase">Condition</label><select value={data.condition ?? 3} onChange={(e) => update("condition", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">{CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.value} - {c.label}</option>)}</select></div>
        </div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Location</label><input value={data.location || ""} onChange={(e) => update("location", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Treatment Plant / Well Site"/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-slate-600 uppercase">Latitude</label><input value={data.latitude || ""} onChange={(e) => update("latitude", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="34.0000"/></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase">Longitude</label><input value={data.longitude || ""} onChange={(e) => update("longitude", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="-96.0000"/></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 uppercase">Install Date</label>
            <div className="flex gap-1 mt-1 mb-1">
              {[["year","Year"],["month","Mo/Yr"],["full","Full Date"]].map(([m,l]) => {
                const curMode = data.installDate ? (/^\d{4}-\d{2}-\d{2}$/.test(data.installDate) ? "full" : /^\d{4}-\d{2}$/.test(data.installDate) ? "month" : "year") : "year";
                return <button key={m} type="button" onClick={() => { update("installDate",""); update("installYear",null); update("_dateMode",m); }} className={`px-2 py-0.5 rounded text-xs font-bold ${(data._dateMode||curMode)===m?"bg-[#1E3D3B] text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>;
              })}
            </div>
            {(data._dateMode||"year")==="year" && <input type="number" value={data.installYear ?? ""} onChange={e => { update("installYear",e.target.value); update("installDate",""); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="e.g., 2015" min="1900" max="2100"/>}
            {(data._dateMode)==="month" && <input type="month" value={data.installDate && /^\d{4}-\d{2}/.test(data.installDate)?data.installDate.substring(0,7):""} onChange={e => { update("installDate",e.target.value); update("installYear",null); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/>}
            {(data._dateMode)==="full" && <input type="date" value={data.installDate && /^\d{4}-\d{2}-\d{2}/.test(data.installDate)?data.installDate:""} onChange={e => { update("installDate",e.target.value); update("installYear",null); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/>}
          </div>
          <div><label className="text-xs font-medium text-slate-600 uppercase">Useful life (yrs)</label><input type="number" value={data.usefulLife ?? ""} onChange={(e) => update("usefulLife", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" min="1" max="200"/></div>
        </div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Replacement cost (unit)</label><input value={data.replacementCost ?? ""} onChange={(e) => update("replacementCost", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="45000"/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-slate-600 uppercase">Last maintenance</label><input type="date" value={data.lastMaint || ""} onChange={(e) => update("lastMaint", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div>
          <div><label className="text-xs font-medium text-slate-600 uppercase">Maint interval</label><div className="flex gap-1 mt-1"><input type="number" value={data._maintIntDisplay ?? data.maintInt ?? ""} onChange={(e) => { const val = toFloat(e.target.value); const unit = data._maintIntUnit || "months"; update("_maintIntDisplay", e.target.value); if (val != null) { if (unit === "years") update("maintInt", Math.round(val * 12)); else if (unit === "weeks") update("maintInt", Math.max(1, Math.round(val / 4.33))); else if (unit === "days") update("maintInt", Math.max(1, Math.round(val / 30.44))); else update("maintInt", val); } else { update("maintInt", null); } }} className="w-full px-3 py-3 text-lg border border-slate-200 rounded-lg bg-white font-semibold" min="0" placeholder="12"/><select value={data._maintIntUnit || "months"} onChange={(e) => { const unit = e.target.value; const raw = toFloat(data.maintInt); update("_maintIntUnit", unit); if (raw != null) { if (unit === "years") update("_maintIntDisplay", Math.round(raw / 12 * 10) / 10); else if (unit === "weeks") update("_maintIntDisplay", Math.round(raw * 4.33)); else if (unit === "days") update("_maintIntDisplay", Math.round(raw * 30.44)); else update("_maintIntDisplay", raw); } }} className="w-28 px-2 py-2 border border-slate-200 rounded-lg bg-white text-sm"><option value="months">Months</option><option value="weeks">Weeks</option><option value="days">Days</option><option value="years">Years</option></select></div></div>
        </div>
        <div className="sm:col-span-2 mt-2 pt-4 border-t border-slate-200"><div className="text-sm font-semibold text-slate-900">Add later</div><div className="text-sm text-slate-600 mt-1">These details improve record quality, service history, and file tracking, but they can wait until you have time.</div></div><div><label className="text-xs font-medium text-slate-600 uppercase">Warranty expiration</label><input type="date" value={data.warrantyExp || ""} onChange={(e) => update("warrantyExp", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Manufacturer / Model / Serial</label><div className="grid grid-cols-3 gap-2 mt-1"><input value={data.manufacturer || ""} onChange={(e) => update("manufacturer", e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Mfg"/><input value={data.model || ""} onChange={(e) => update("model", e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Model"/><input value={data.serialNum || ""} onChange={(e) => update("serialNum", e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Serial"/></div></div>
        <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-600 uppercase">Photos & Documents</label>
          <div className="mt-1 space-y-2">
            {initial?.id && (() => {
              const imgs = (assetFiles || []).filter(f => f.type === "image");
              const docs = (assetFiles || []).filter(f => f.type === "document");
              return <>
                {imgs.length > 0 && <div><div className="text-xs font-semibold text-slate-500 mb-1">Photos ({imgs.length})</div><div className="flex flex-wrap gap-2">{imgs.map((p, i) => <div key={p.name || i} className="relative group">
                  <img src={p.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 py-0.5 rounded-b-lg text-center truncate">{new Date(p.date).toLocaleDateString()}</div>
                  {onDeleteFile && <button type="button" onClick={() => onDeleteFile(initial.id, p.name)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition">x</button>}
                </div>)}</div></div>}
                {docs.length > 0 && <div><div className="text-xs font-semibold text-slate-500 mb-1">Documents ({docs.length})</div><div className="space-y-1">{docs.map((d, i) => <div key={d.name || i} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div className="flex items-center gap-2"><Icon name="file" size={14} /><span className="font-semibold text-slate-900 truncate max-w-[200px]">{d.name}</span><span className="text-slate-400">{Math.round((d.size || 0) / 1024)} KB</span></div>
                  <div className="flex items-center gap-1"><span className="text-slate-400">{new Date(d.date).toLocaleDateString()}</span>{onDeleteFile && <button type="button" onClick={() => onDeleteFile(initial.id, d.name)} className="p-1 rounded hover:bg-red-100 text-red-600"><Icon name="x" size={12} /></button>}</div>
                </div>)}</div></div>}
                <div className="flex items-center gap-2 flex-wrap">
                  {onSavePhoto && <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white text-xs font-semibold cursor-pointer">
                    <Icon name="photo" size={14} /> Add photo
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSavePhoto(initial.id, f); e.target.value = ""; }} />
                  </label>}
                  {onSavePhoto && <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white text-xs font-semibold cursor-pointer">
                    <Icon name="photo" size={14} /> Take photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSavePhoto(initial.id, f); e.target.value = ""; }} />
                  </label>}
                  {onSaveInspection && <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer">
                    <Icon name="wrench" size={14} /> Inspection photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSaveInspection(initial.id, initial.assetName || initial.id, f); e.target.value = ""; }} />
                  </label>}
                  {onSaveDocument && <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer">
                    <Icon name="file" size={14} /> Attach document
                    <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSaveDocument(initial.id, f); e.target.value = ""; }} />
                  </label>}
                </div>
              </>;
            })()}
            {!initial?.id && <div className="text-xs text-slate-500 italic p-2 bg-slate-50 rounded-lg">Save the asset first, then you can add photos and documents.</div>}
            <div><label className="text-xs text-slate-500">Or link to an external photo URL:</label><input value={data.imageUrl || ""} onChange={(e) => update("imageUrl", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm" placeholder="https://example.com/photo.jpg"/></div>
          </div>
        </div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Document/Manual Link (optional)</label><input value={data.docUrl || ""} onChange={(e) => update("docUrl", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="https://example.com/manual.pdf"/></div>
        <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-600 uppercase">Notes</label><textarea value={data.notes || ""} onChange={(e) => update("notes", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" rows="2" placeholder="Details..."></textarea></div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2"><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onCancel}>Cancel</button><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={submit}>Save asset</button></div>
    </div>
    <div className="glass-card p-4"><div className="flex items-center justify-between gap-2"><div><div className="text-sm font-semibold text-slate-900">Catalog quick-fill</div><div className="text-xs text-slate-500 mt-0.5">Pick to auto-fill</div></div><div className="text-xs font-bold text-slate-500 uppercase">Optional</div></div><div className="mt-3 relative"><div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></div><input value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Search catalog…"/></div><div className="mt-3 max-h-80 overflow-y-auto pr-1 space-y-2">{filteredCatalog.map((c, idx) => <button key={idx} className="w-full text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition" onClick={() => applyCatalogItem(c)} type="button"><div className="text-sm font-bold text-slate-900">{c.item}</div><div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-2"><span className="px-2 py-0.5 rounded-full bg-slate-100">{c.category}</span>{c.expectedLife && <span className="px-2 py-0.5 rounded-full bg-slate-100">{c.expectedLife} yrs</span>}{c.estimatedPrice && <span className="px-2 py-0.5 rounded-full bg-slate-100">{currencyFormatter.format(c.estimatedPrice)}</span>}</div></button>)}</div></div>
  </div>;
}
// Action overflow menu for asset table rows
function ActionMenu({ asset, onDuplicate, onPrintLabel, onMarkMaint }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);
  return <div className="relative" ref={ref}>
    <button className="p-2 rounded-lg hover:bg-white border border-slate-200" title="More actions" onClick={() => setOpen(p => !p)}><Icon name="moreH" size={16} /></button>
    {open && <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44 animate-in">
      <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 font-semibold text-slate-700" onClick={() => { onDuplicate(asset); setOpen(false); }}><Icon name="copy" size={14} /> Duplicate</button>
      <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 font-semibold text-slate-700" onClick={() => { onPrintLabel(asset); setOpen(false); }}><Icon name="printer" size={14} /> Print Label</button>
      <button className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 font-semibold text-slate-700" onClick={() => { onMarkMaint(asset); setOpen(false); }}><Icon name="wrench" size={14} /> Mark Maint Complete</button>
    </div>}
  </div>;
}
// Searchable asset picker for service log form
function AssetPicker({ assets, value, onChange, showAll, onToggleShowAll }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectedAsset = (assets || []).find(a => a.id === value);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = showAll ? assets : (assets || []).filter(a => (a.status || "Active") === "Active");
    if (!q) return list.slice().sort((a, b) => (a.assetName || "").localeCompare(b.assetName || "")).slice(0, 50);
    return list.filter(a => (a.assetName || "").toLowerCase().includes(q) || (a.id || "").toLowerCase().includes(q) || (a.location || "").toLowerCase().includes(q)).sort((a, b) => (a.assetName || "").localeCompare(b.assetName || "")).slice(0, 50);
  }, [assets, query, showAll]);
  useEffect(() => {
    if (!open) return;
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);
  return <div className="relative" ref={ref}>
    <div className="mt-1 relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" size={14} /></div>
      <input
        value={open ? query : (selectedAsset ? `${selectedAsset.id} — ${selectedAsset.assetName}` : "")}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(""); }}
        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white"
        placeholder="Search by name, ID, or location..."
      />
      {value && !open && <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 text-slate-400" onClick={() => { onChange(""); setQuery(""); }} title="Clear"><Icon name="x" size={14} /></button>}
    </div>
    {open && <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
      {matches.length > 0 ? matches.map(a => <button key={a.id} type="button" className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${a.id === value ? "bg-emerald-50 font-bold" : ""}`} onClick={() => { onChange(a.id); setOpen(false); setQuery(""); }}>
        <div><span className="font-mono text-slate-500 text-xs">{a.id}</span> <span className="font-semibold text-slate-900">{a.assetName}</span>{a.status !== "Active" && <span className="text-xs text-slate-500 ml-1">({a.status})</span>}</div>
        {a.location && <span className="text-xs text-slate-400 ml-2 truncate max-w-[120px]">{a.location}</span>}
      </button>) : <div className="px-3 py-3 text-sm text-slate-500">No assets match "{query}"</div>}
      <div className="border-t border-slate-100 px-3 py-2"><label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer"><input type="checkbox" checked={showAll} onChange={(e) => onToggleShowAll(e.target.checked)} /> Include retired/planning</label></div>
    </div>}
  </div>;
}
function ServiceLogForm({ assets, initial, onSubmit, onCancel, laborRoles = [], settings = DEFAULT_SETTINGS }) {
  const [data, setData] = useState(() => {
    const normalized = normalizeServiceEntry(initial || {});
    return { id: normalized?.id || null, assetId: normalized?.assetId || "", assetName: normalized?.assetName || "", date: normalized?.date || isoDate(), type: normalized?.type || "Scheduled Maintenance", vendor: normalized?.vendor || "", cost: normalized?.cost || "", hours: normalized?.hours || "", notes: normalized?.notes || "", serviceCost: normalized?.serviceCost || normalizeServiceCost({}) };
  });
  const [showAllAssets, setShowAllAssets] = useState(false);
  const migratedSettings = useMemo(() => migrateSettings(settings), [settings]);
  const assumptions = migratedSettings.financial?.assumptions || buildDefaultFinancial().assumptions;
  const activeRoles = laborRoles || [];
  const selectedRole = activeRoles.find(r => r.id === data.serviceCost?.laborRoleId);
  const suggestedRate = selectedRole ? getRoleLoadedHourlyRate(selectedRole, assumptions) : 0;
  const calculatedTotal = useMemo(() => {
    const laborHours = toFloat(data.serviceCost?.laborHours) ?? 0;
    const laborRate = toFloat(data.serviceCost?.laborRate) ?? (suggestedRate || 0);
    const materialsCost = toFloat(data.serviceCost?.materialsCost) ?? 0;
    const contractorCost = toFloat(data.serviceCost?.contractorCost) ?? 0;
    const laborCost = laborHours * laborRate;
    let overheadAmount = toFloat(data.serviceCost?.overheadAmount) ?? 0;
    if (overheadAmount === 0 && (migratedSettings.financial?.assumptions?.defaultOverheadAllocationMode || "") === "percent-of-labor") overheadAmount = laborCost * ((toFloat(migratedSettings.financial?.assumptions?.defaultOverheadPercent) ?? 0) / 100);
    return Math.round((laborCost + materialsCost + contractorCost + overheadAmount) * 100) / 100;
  }, [data.serviceCost, suggestedRate, migratedSettings]);
  function update(k, v) { setData(prev => ({ ...prev, [k]: v })); }
  function updateCost(k, v) { setData(prev => ({ ...prev, serviceCost: { ...(prev.serviceCost || {}), [k]: v } })); }
  function submit() {
    if (!data.assetId) return alert("Select an asset.");
    const asset = assets.find(a => a.id === data.assetId);
    const serviceCost = normalizeServiceCost({ ...(data.serviceCost || {}), laborRate: toFloat(data.serviceCost?.laborRate) ?? suggestedRate ?? 0, totalCost: calculatedTotal });
    onSubmit({ ...data, id: data.id || Date.now(), assetName: asset?.assetName || data.assetName || "", cost: toFloat(serviceCost.totalCost) ?? null, hours: toFloat(serviceCost.laborHours) ?? toFloat(data.hours) ?? null, serviceCost, createdAt: initial?.createdAt || new Date().toISOString() });
  }
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {initial?.assetId && <div className="sm:col-span-2 p-2 rounded-lg bg-blue-50 border border-blue-200 text-sm font-semibold text-blue-900">Editing entry for: {initial.assetName || initial.assetId}</div>}
    <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-600 uppercase">Asset</label><AssetPicker assets={assets} value={data.assetId} onChange={(id) => update("assetId", id)} showAll={showAllAssets} onToggleShowAll={setShowAllAssets} /></div>
    <div><label className="text-xs font-medium text-slate-600 uppercase">Date</label><input type="date" value={data.date} onChange={(e) => update("date", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div>
    <div><label className="text-xs font-medium text-slate-600 uppercase">Type</label><select value={data.type} onChange={(e) => update("type", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option>Scheduled Maintenance</option><option>Repair</option><option>Inspection</option><option>Calibration</option><option>Replacement</option><option>Sampling / Testing</option><option>Sanitary Survey</option><option>Regulatory Report</option><option>Emergency Response</option><option>Other</option></select></div>
    <div><label className="text-xs font-medium text-slate-600 uppercase">Vendor</label><input value={data.vendor} onChange={(e) => update("vendor", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Optional"/></div>
    <div><label className="text-xs font-medium text-slate-600 uppercase">Labor role</label><select value={data.serviceCost?.laborRoleId || ""} onChange={(e) => updateCost("laborRoleId", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="">None / outside cost only</option>{activeRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
    <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-slate-600 uppercase">Labor hours</label><div className="flex items-center mt-1"><input value={data.serviceCost?.laborHours ?? ""} onChange={(e) => { updateCost("laborHours", e.target.value); update("hours", e.target.value); }} className="w-full px-3 py-2 border border-slate-200 rounded-l-lg bg-white" placeholder="0"/><span className="px-2 py-2 bg-slate-100 border border-l-0 border-slate-200 rounded-r-lg text-sm text-slate-500 font-semibold">hrs</span></div></div><div><label className="text-xs font-medium text-slate-600 uppercase">Labor rate</label><div className="flex items-center mt-1"><span className="px-2 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-sm text-slate-500 font-semibold">$</span><input value={data.serviceCost?.laborRate ?? (selectedRole ? String(Math.round(suggestedRate * 100) / 100) : "")} onChange={(e) => updateCost("laborRate", e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-r-lg bg-white" placeholder={selectedRole ? String(Math.round(suggestedRate * 100) / 100) : "0"}/></div></div></div>
    <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-slate-600 uppercase">Materials</label><div className="flex items-center mt-1"><span className="px-2 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-sm text-slate-500 font-semibold">$</span><input value={data.serviceCost?.materialsCost ?? ""} onChange={(e) => updateCost("materialsCost", e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-r-lg bg-white" placeholder="0"/></div></div><div><label className="text-xs font-medium text-slate-600 uppercase">Contractor</label><div className="flex items-center mt-1"><span className="px-2 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-sm text-slate-500 font-semibold">$</span><input value={data.serviceCost?.contractorCost ?? ""} onChange={(e) => updateCost("contractorCost", e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-r-lg bg-white" placeholder="0"/></div></div></div>
    <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-slate-600 uppercase">Overhead</label><div className="flex items-center mt-1"><span className="px-2 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-sm text-slate-500 font-semibold">$</span><input value={data.serviceCost?.overheadAmount ?? ""} onChange={(e) => updateCost("overheadAmount", e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-r-lg bg-white" placeholder="0"/></div></div><div><label className="text-xs font-medium text-slate-600 uppercase">Total service cost</label><div className="mt-1 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-semibold text-slate-900">{currencyFormatter.format(calculatedTotal || 0)}</div></div></div>
    <div className="sm:col-span-2 text-[11px] text-slate-500">This entry now supports labor-loaded maintenance costing. Labor defaults from the selected role, and you can override the rate when needed.</div>
    <div className="sm:col-span-2"><label className="text-xs font-medium text-slate-600 uppercase">Notes</label><textarea value={data.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" rows="2" placeholder="What happened?"></textarea></div>
    <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2"><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onCancel}>Cancel</button><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={submit}>Save entry</button></div>
  </div>;
}
// Charts
function ProjectionChart({ rows }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || chartRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: { labels: [], datasets: [
        { label: "Replacement cost", data: [], yAxisID: "y", backgroundColor: "rgba(59, 130, 246, 0.7)" },
        { label: "Reserve balance", data: [], type: "line", yAxisID: "y1", tension: 0.25, pointRadius: 2, borderColor: "#10b981" }
      ] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: { legend: { display: true } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => currencyFormatter.format(v) } },
          y1: { beginAtZero: false, position: "right", grid: { drawOnChartArea: false }, ticks: { callback: (v) => currencyFormatter.format(v) } }
        }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.labels = (rows || []).map(r => r.year);
    chartRef.current.data.datasets[0].data = (rows || []).map(r => r.cost);
    chartRef.current.data.datasets[1].data = (rows || []).map(r => r.reserve);
    chartRef.current.update('none');
  }, [rows]);
  return <div className="h-80"><canvas ref={canvasRef}></canvas></div>;
}
// FEATURE 1: Doughnut Chart for Category Breakdown

function FiveYearFundingChart({ funding }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || chartRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { label: "Funded", data: [], stack: "cap", backgroundColor: "rgba(30, 61, 59, 0.75)" },
          { label: "Unfunded gap", data: [], stack: "cap", backgroundColor: "rgba(239, 55, 62, 0.75)" },
          { label: "Ending reserve", data: [], type: "line", yAxisID: "y1", tension: 0.25, pointRadius: 2, borderColor: "#7BC8E5" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: { legend: { display: true } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => currencyFormatter.format(v) } },
          y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, ticks: { callback: (v) => currencyFormatter.format(v) } }
        }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);
  useEffect(() => {
    if (!chartRef.current) return;
    const labels = (funding || []).map(r => r.year);
    chartRef.current.data.labels = labels;
    chartRef.current.data.datasets[0].data = (funding || []).map(r => r.funded);
    chartRef.current.data.datasets[1].data = (funding || []).map(r => r.shortfall);
    chartRef.current.data.datasets[2].data = (funding || []).map(r => r.endingReserve);
    chartRef.current.update('none');
  }, [funding]);
  return <div className="h-80"><canvas ref={canvasRef}></canvas></div>;
}
function CategoryDoughnutChart({ assets, categories }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const chartData = useMemo(() => {
    const labels = categories.filter(cat => assets.filter(a => (a.category || "Other") === cat && a.status !== "Retired").length > 0);
    const values = labels.map(cat => assets.filter(a => (a.category || "Other") === cat && a.status !== "Retired").reduce((s, a) => s + (a.totalCost || 0), 0));
    return { labels, values };
  }, [assets, categories]);
  useEffect(() => {
    if (!canvasRef.current || chartRef.current) return;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${currencyFormatter.format(ctx.raw)}` } }
        }
      }
    });
    chartRef.current._okaColors = colors;
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);
  useEffect(() => {
    if (!chartRef.current) return;
    const colors = chartRef.current._okaColors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
    chartRef.current.data.labels = chartData.labels;
    chartRef.current.data.datasets[0].data = chartData.values;
    chartRef.current.data.datasets[0].backgroundColor = colors.slice(0, chartData.labels.length);
    chartRef.current.update('none');
  }, [chartData]);
  return <div className="h-64"><canvas ref={canvasRef}></canvas></div>;
}
// FEATURE 1: Risk Heatmap (Bubble Chart)
function RiskHeatmapChart({ assets }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const chartData = useMemo(() => {
    const priorityMap = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
    return assets.filter(a => a.status !== "Retired" && a.condition).map(a => ({ x: toInt(a.condition) || 3, y: priorityMap[a.priority] || 2, r: Math.min(20, Math.max(5, (a.totalCost || 0) / 50000 + 5)), asset: a }));
  }, [assets]);
  useEffect(() => {
    if (!canvasRef.current || chartRef.current) return;
    chartRef.current = new Chart(canvasRef.current, {
      type: "bubble",
      data: { datasets: [{ label: "Assets", data: [], backgroundColor: [], borderWidth: 1 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        scales: {
          x: { min: 0.5, max: 5.5, title: { display: true, text: 'Condition (1=Critical, 5=Excellent)', font: { weight: 'bold' } }, ticks: { stepSize: 1, callback: (v) => ({ 1: 'Critical', 2: 'Poor', 3: 'Fair', 4: 'Good', 5: 'Excellent' }[v] || v) } },
          y: { min: 0.5, max: 4.5, title: { display: true, text: 'Priority', font: { weight: 'bold' } }, ticks: { stepSize: 1, callback: (v) => ({ 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Critical' }[v] || v) } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => [ctx.raw.asset.assetName, `Condition: ${ctx.raw.asset.condition}/5`, `Priority: ${ctx.raw.asset.priority}`, `Value: ${currencyFormatter.format(ctx.raw.asset.totalCost || 0)}`] } }
        }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, []);
  useEffect(() => {
    if (!chartRef.current) return;
    const getColor = (p) => { if (p.x <= 2 && p.y >= 3) return 'rgba(239, 68, 68, 0.7)'; if (p.x <= 3 && p.y >= 3) return 'rgba(249, 115, 22, 0.7)'; if (p.x <= 3 || p.y >= 3) return 'rgba(245, 158, 11, 0.7)'; return 'rgba(16, 185, 129, 0.7)'; };
    chartRef.current.data.datasets[0].data = chartData;
    chartRef.current.data.datasets[0].backgroundColor = chartData.map(getColor);
    chartRef.current.update('none');
  }, [chartData]);
  return <div className="h-64"><canvas ref={canvasRef}></canvas></div>;
}
// FEATURE 4: Calendar View - shows maintenance, warranty, and replacement events
function CalendarView({ assets, onOpenAsset }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [eventFilter, setEventFilter] = useState("all");
  const [calMode, setCalMode] = useState("calendar");
  const calendarData = useMemo(() => { const year = currentDate.getFullYear(); const month = currentDate.getMonth(); const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0); const startDate = new Date(firstDay); startDate.setDate(startDate.getDate() - startDate.getDay()); const endDate = new Date(lastDay); endDate.setDate(endDate.getDate() + (6 - endDate.getDay())); const days = []; const current = new Date(startDate); while (current <= endDate) { days.push(new Date(current)); current.setDate(current.getDate() + 1); } return { year, month, days, firstDay, lastDay }; }, [currentDate]);
  const allEvents = useMemo(() => {
    const events = {};
    function addEvent(dateStr, evt) { if (!dateStr) return; if (!events[dateStr]) events[dateStr] = []; events[dateStr].push(evt); }
    assets.forEach(a => {
      if (a.maint && a.maint.dueDate) addEvent(a.maint.dueDate, { asset: a, status: a.maint.status, type: "maint", label: "Maint" });
      if (a.warrantyExp) {
        const wDays = warrantyStatus(a.warrantyExp);
        if (wDays) {
          if (wDays.status === "expired") addEvent(a.warrantyExp, { asset: a, status: "warranty-expired", type: "warranty", label: "Warranty expired" });
          else if (wDays.status === "expiring") addEvent(a.warrantyExp, { asset: a, status: "warranty-expiring", type: "warranty", label: "Warranty expires" });
        }
      }
      if (a.replaceYear) {
        const repDate = `${a.replaceYear}-01-01`;
        const curYear = new Date().getFullYear();
        if (a.replaceYear <= curYear) addEvent(repDate, { asset: a, status: "replacement-overdue", type: "replacement", label: `Replace est. ${a.replaceYear} (overdue)` });
        else if (a.replaceYear <= curYear + 5) addEvent(repDate, { asset: a, status: "replacement-due", type: "replacement", label: `Replace est. ${a.replaceYear}` });
      }
    });
    return events;
  }, [assets]);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = isoDate();
  const filterEvents = (evts) => eventFilter === "all" ? evts : evts.filter(e => e.type === eventFilter);
  // All events for current month, sorted, for list view
  const monthEventsList = useMemo(() => {
    const items = [];
    const ym = `${calendarData.year}-${String(calendarData.month + 1).padStart(2, "0")}`;
    Object.entries(allEvents).forEach(([dateStr, evts]) => {
      if (dateStr.substring(0, 7) === ym) filterEvents(evts).forEach(evt => items.push({ ...evt, date: dateStr }));
    });
    Object.entries(allEvents).forEach(([dateStr, evts]) => {
      if (dateStr.substring(0, 7) !== ym && dateStr < ym + "-32") {
        filterEvents(evts).filter(e => e.status === "overdue" || e.status === "replacement-overdue" || e.status === "warranty-expired").forEach(evt => {
          if (!items.some(i => i.asset.id === evt.asset.id && i.type === evt.type)) items.push({ ...evt, date: dateStr });
        });
      }
    });
    return items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [allEvents, calendarData.year, calendarData.month, eventFilter]);
  const upcomingItems = useMemo(() => {
    const items = [];
    assets.forEach(a => {
      if (a.maint && a.maint.dueDate) items.push({ asset: a, date: a.maint.dueDate, type: "maint", status: a.maint.status, label: `Maint ${a.maint.status}` });
      if (a.warrantyExp) { const w = warrantyStatus(a.warrantyExp); if (w && (w.status === "expiring" || w.status === "expired")) items.push({ asset: a, date: a.warrantyExp, type: "warranty", status: w.status === "expired" ? "warranty-expired" : "warranty-expiring", label: w.status === "expired" ? "Warranty expired" : "Warranty expiring" }); }
      if (a.replaceYear && a.replaceYear <= new Date().getFullYear() + 5) { const curYear = new Date().getFullYear(); items.push({ asset: a, date: `${a.replaceYear}-01-01`, type: "replacement", status: a.replaceYear <= curYear ? "replacement-overdue" : "replacement-due", label: a.replaceYear <= curYear ? `Replace est. ${a.replaceYear} (overdue)` : `Replace est. ${a.replaceYear}` }); }
    });
    const filtered = eventFilter === "all" ? items : items.filter(i => i.type === eventFilter);
    return filtered.sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 12);
  }, [assets, eventFilter]);
  function evtBgCls(s) { return s === "overdue" ? "bg-red-50 border-red-200" : s === "due" ? "bg-amber-50 border-amber-200" : s === "warranty-expired" || s === "warranty-expiring" ? "bg-purple-50 border-purple-200" : s.startsWith("replacement") ? "bg-orange-50 border-orange-200" : "bg-blue-50 border-blue-200"; }
  function evtBadgeCls(s) { return s === "overdue" ? "bg-red-200 text-red-800" : s === "due" ? "bg-amber-200 text-amber-800" : s.startsWith("warranty") ? "bg-purple-200 text-purple-800" : s.startsWith("replacement") ? "bg-orange-200 text-orange-800" : "bg-blue-200 text-blue-800"; }
  return <div className="glass-card p-5">
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">&larr;</button>
        <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">&rarr;</button>
        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-semibold">Today</button>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden ml-2">
          <button onClick={() => setCalMode("calendar")} className={`px-3 py-1.5 text-xs font-bold ${calMode === "calendar" ? "bg-[#1E3D3B] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="calendar" size={14} /></button>
          <button onClick={() => setCalMode("list")} className={`px-3 py-1.5 text-xs font-bold ${calMode === "list" ? "bg-[#1E3D3B] text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="file" size={14} /></button>
        </div>
      </div>
      <div className="text-xl font-bold text-slate-900">{monthNames[calendarData.month]} {calendarData.year}</div>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg bg-white text-xs font-semibold"><option value="all">All events</option><option value="maint">Maintenance only</option><option value="warranty">Warranty only</option><option value="replacement">Replacement only</option></select>
        <div className="flex items-center gap-2 text-xs"><div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-200"></div><span>Overdue</span></div><div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-200"></div><span>Due</span></div><div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-200"></div><span>Maint OK</span></div><div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{background:"#e8daef"}}></div><span>Warranty</span></div><div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{background:"#fde2cc"}}></div><span>Replace</span></div></div>
      </div>
    </div>
    {calMode === "calendar" && <div className="calendar-grid">{dayNames.map(day => <div key={day} className="calendar-day-header">{day}</div>)}{calendarData.days.map((day, idx) => { const dateStr = isoDate(day); const isCurrentMonth = day.getMonth() === calendarData.month; const isToday = dateStr === today; const events = filterEvents(allEvents[dateStr] || []); return <div key={idx} className={`calendar-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}><div className={`text-right font-semibold ${isToday ? 'text-blue-700' : ''}`}>{day.getDate()}</div><div className="mt-1 space-y-1 overflow-y-auto max-h-16">{events.slice(0, 3).map((evt, i) => <button type="button" key={i} onClick={() => onOpenAsset?.(evt.asset)} className={`maint-marker ${evt.status} w-full text-left hover:opacity-90`} title={`${evt.asset.assetName} - ${evt.label || evt.status}${evt.type === "replacement" ? " (based on install year + useful life)" : ""} | Click to view`}><span className="block truncate">{evt.asset.assetName}</span></button>)}{events.length > 3 && <div className="text-xs text-slate-500 font-semibold">+{events.length - 3} more</div>}</div></div>; })}</div>}
    {calMode === "list" && <div className="space-y-1 max-h-[60vh] overflow-y-auto">{monthEventsList.length > 0 ? (() => { let lastDate = ""; return monthEventsList.map((item, idx) => { const showHeader = item.date !== lastDate; lastDate = item.date; const d = new Date(item.date + "T00:00:00"); const isT = item.date === today; return <React.Fragment key={`${item.asset.id}-${item.type}-${idx}`}>{showHeader && <div className={`flex items-center gap-2 pt-3 pb-1 ${idx > 0 ? "mt-2 border-t border-slate-100" : ""}`}><div className={`text-sm font-semibold ${isT ? "text-blue-700" : "text-slate-900"}`}>{d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>{isT && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Today</span>}</div>}<button type="button" onClick={() => onOpenAsset?.(item.asset)} className={`w-full flex items-center justify-between p-3 rounded-xl border text-left hover:opacity-90 transition ${evtBgCls(item.status)}`}><div className="flex-1 min-w-0"><div className="font-semibold text-slate-900 text-sm truncate">{item.asset.assetName}</div><div className="text-xs text-slate-600 mt-0.5">{item.asset.id} &middot; {item.asset.location || "No location"} &middot; {item.asset.category || ""}</div></div><span className={`text-xs font-bold px-2 py-1 rounded flex-shrink-0 ml-3 ${evtBadgeCls(item.status)}`}>{(item.label || item.status).toUpperCase()}</span></button></React.Fragment>; }); })() : <div className="text-sm text-slate-500 text-center py-8">No events this month.</div>}</div>}
    <div className="mt-6"><div className="text-lg font-bold text-slate-900 mb-1">Upcoming Events</div><div className="text-xs text-slate-500 mb-3">Click any item to view the asset record.</div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{upcomingItems.map((item, idx) => <button type="button" onClick={() => onOpenAsset?.(item.asset)} key={`${item.asset.id}-${item.type}-${idx}`} className={`p-3 rounded-xl border text-left ${evtBgCls(item.status)}`}><div className="font-semibold text-slate-900 text-sm">{item.asset.assetName}</div><div className="text-xs text-slate-600 mt-1">{item.asset.id} &middot; {item.asset.location || "No location"}</div><div className="mt-2 flex items-center justify-between"><span className={`text-xs font-bold px-2 py-1 rounded ${evtBadgeCls(item.status)}`}>{item.label.toUpperCase()}</span><span className="text-xs text-slate-500">{item.date}</span></div></button>)}{!upcomingItems.length && <div className="text-sm text-slate-500 col-span-3">No upcoming events.</div>}</div></div>
  </div>;
}
// FEATURE 5: Bulk Edit Modal
function BulkEditModal({ isOpen, onClose, selectedAssets, onSave }) {
  const [bulkData, setBulkData] = useState({ location: { enabled: false, value: "" }, category: { enabled: false, value: "" }, status: { enabled: false, value: "" }, priority: { enabled: false, value: "" }, condition: { enabled: false, value: "" }, usefulLife: { enabled: false, value: "" }, maintInt: { enabled: false, value: "" }, replacementCost: { enabled: false, value: "" } });
  function toggleField(field) { setBulkData(prev => ({ ...prev, [field]: { ...prev[field], enabled: !prev[field].enabled } })); }
  function updateFieldValue(field, value) { setBulkData(prev => ({ ...prev, [field]: { ...prev[field], value } })); }
  function handleSave() { const updates = {}; if (bulkData.location.enabled) updates.location = bulkData.location.value; if (bulkData.category.enabled && bulkData.category.value) updates.category = bulkData.category.value; if (bulkData.status.enabled && bulkData.status.value) updates.status = bulkData.status.value; if (bulkData.priority.enabled && bulkData.priority.value) updates.priority = bulkData.priority.value; if (bulkData.condition.enabled && bulkData.condition.value !== "") updates.condition = toInt(bulkData.condition.value); if (bulkData.usefulLife.enabled && bulkData.usefulLife.value !== "") updates.usefulLife = toInt(bulkData.usefulLife.value); if (bulkData.maintInt.enabled && bulkData.maintInt.value !== "") updates.maintInt = toInt(bulkData.maintInt.value); if (bulkData.replacementCost.enabled && bulkData.replacementCost.value !== "") updates.replacementCost = toFloat(bulkData.replacementCost.value); if (Object.keys(updates).length === 0) { alert("Please select at least one field and set a value to update."); return; } onSave(updates); }
  return <Modal title="Bulk Edit Assets" subtitle={`Update ${selectedAssets.length} selected asset${selectedAssets.length === 1 ? '' : 's'}`} isOpen={isOpen} onClose={onClose} size="md" footer={<div className="flex items-center justify-between"><div className="text-sm text-slate-500">Only checked fields will be updated</div><div className="flex items-center gap-2"><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onClose}>Cancel</button><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={handleSave}>Update {selectedAssets.length} Asset{selectedAssets.length === 1 ? '' : 's'}</button></div></div>}>
    <div className="space-y-4">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800"><strong>Note:</strong> This will update the selected fields for all {selectedAssets.length} selected assets. Other fields remain unchanged.</div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.location.enabled} onChange={() => toggleField('location')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Location</label><input value={bulkData.location.value} onChange={(e) => updateFieldValue('location', e.target.value)} disabled={!bulkData.location.enabled} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400" placeholder="Enter new location"/></div></div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.category.enabled} onChange={() => toggleField('category')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Category</label><select value={bulkData.category.value} onChange={(e) => updateFieldValue('category', e.target.value)} disabled={!bulkData.category.enabled} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400"><option value="">-- Select --</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div></div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.status.enabled} onChange={() => toggleField('status')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Status</label><select value={bulkData.status.value} onChange={(e) => updateFieldValue('status', e.target.value)} disabled={!bulkData.status.enabled} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400"><option value="">-- Select --</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div></div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.priority.enabled} onChange={() => toggleField('priority')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Priority</label><select value={bulkData.priority.value} onChange={(e) => updateFieldValue('priority', e.target.value)} disabled={!bulkData.priority.enabled} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400"><option value="">-- Select --</option>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div></div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.condition.enabled} onChange={() => toggleField('condition')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Condition</label><select value={bulkData.condition.value} onChange={(e) => updateFieldValue('condition', e.target.value)} disabled={!bulkData.condition.enabled} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400"><option value="">-- Select --</option>{CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.value} - {c.label}</option>)}</select></div></div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.usefulLife.enabled} onChange={() => toggleField('usefulLife')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Useful Life (years)</label><input type="number" value={bulkData.usefulLife.value} onChange={(e) => updateFieldValue('usefulLife', e.target.value)} disabled={!bulkData.usefulLife.enabled} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400" placeholder="e.g., 15" min="1" max="200"/></div></div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.maintInt.enabled} onChange={() => toggleField('maintInt')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Maintenance Interval (months)</label><input type="number" value={bulkData.maintInt.value} onChange={(e) => updateFieldValue('maintInt', e.target.value)} disabled={!bulkData.maintInt.enabled} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400" placeholder="e.g., 12" min="0" max="240"/></div></div>
      <div className="flex items-start gap-3 p-4 border border-slate-200 rounded-xl"><input type="checkbox" checked={bulkData.replacementCost.enabled} onChange={() => toggleField('replacementCost')} className="mt-1" /><div className="flex-1"><label className="text-sm font-bold text-slate-700">Replacement Cost (unit)</label><div className="flex items-center mt-1"><span className="px-2 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-lg text-sm text-slate-500 font-semibold">$</span><input type="number" value={bulkData.replacementCost.value} onChange={(e) => updateFieldValue('replacementCost', e.target.value)} disabled={!bulkData.replacementCost.enabled} className="w-full px-3 py-2 border border-slate-200 rounded-r-lg bg-white disabled:bg-slate-100 disabled:text-slate-400" placeholder="e.g., 45000" min="0"/></div></div></div>
      <div className="mt-4"><div className="text-sm font-bold text-slate-700 mb-2">Selected Assets:</div><div className="max-h-32 overflow-y-auto bg-slate-50 rounded-lg p-3 text-xs">{selectedAssets.map(a => <div key={a.id} className="py-1 border-b border-slate-200 last:border-0"><span className="font-mono text-slate-500">{a.id}</span> — {a.assetName}</div>)}</div></div>
    </div>
  </Modal>;
}
// Asset Label Modal (print-ready, QR-ready for future hosting)
function AssetLabelModal({ isOpen, onClose, asset, orgName, pwsId }) {
  const [labelSize, setLabelSize] = useState("2x1");
  function printLabel() {
    if (!asset) return;
    const sizes = { "2x1": { w: "2in", h: "1in", fs: "7pt", titleFs: "9pt", idFs: "11pt" }, "2.5x1": { w: "2.5in", h: "1in", fs: "7.5pt", titleFs: "10pt", idFs: "12pt" }, "3x2": { w: "3in", h: "2in", fs: "9pt", titleFs: "12pt", idFs: "14pt" } };
    const sz = sizes[labelSize] || sizes["2x1"];
    const isLarge = labelSize === "3x2";
    const labelHtml = `<!DOCTYPE html><html><head><title>Asset Label - ${escHtml(asset.id)}</title><style>
      @page { size: ${sz.w} ${sz.h}; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { width: ${sz.w}; height: ${sz.h}; font-family: 'Gill Sans', 'Gill Sans MT', 'Trebuchet MS', 'DM Sans', sans-serif; display: flex; align-items: center; justify-content: center; }
      .label { border: 0.5pt solid #ccc; border-radius: 3pt; width: calc(100% - 4pt); height: calc(100% - 4pt); padding: ${isLarge ? "6pt 8pt" : "3pt 6pt"}; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
      .org { font-size: 5pt; color: #888; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .id { font-size: ${sz.idFs}; font-weight: 800; color: #000; margin-top: ${isLarge ? "3pt" : "1pt"}; letter-spacing: 0.02em; }
      .name { font-size: ${sz.titleFs}; font-weight: 600; color: #333; margin-top: 1pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .meta { font-size: ${sz.fs}; color: #666; margin-top: ${isLarge ? "3pt" : "1pt"}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      ${isLarge ? `.detail { font-size: 7pt; color: #888; margin-top: 3pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` : ""}
    </style></head><body><div class="label">
      <div class="org">${escHtml(orgName || "")}${pwsId ? " | " + escHtml(pwsId) : ""}</div>
      <div class="id">${escHtml(asset.id)}</div>
      <div class="name">${escHtml(asset.assetName || "")}</div>
      <div class="meta">${[asset.category, asset.location, asset.type].filter(Boolean).map(escHtml).join(" | ")}</div>
      ${isLarge && asset.serialNum ? `<div class="detail">S/N: ${escHtml(asset.serialNum)}${asset.manufacturer ? " | " + escHtml(asset.manufacturer) : ""}${asset.model ? " " + escHtml(asset.model) : ""}</div>` : ""}
    </div></body></html>`;
    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow || printWindow.closed || typeof printWindow.closed === "undefined") {
      // Fallback: use hidden iframe for environments that block popups
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:400px;height:300px;border:none;";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open(); doc.write(labelHtml); doc.close();
      setTimeout(() => { try { iframe.contentWindow.print(); } catch(e) { alert("Could not print label. Try allowing popups for this page."); } setTimeout(() => document.body.removeChild(iframe), 1000); }, 400);
      return;
    }
    printWindow.document.write(labelHtml);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  }
  if (!isOpen || !asset) return null;
  return <Modal title="Print Asset Label" subtitle={`${asset.id} - ${asset.assetName}`} isOpen={isOpen} onClose={onClose} size="sm" footer={
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500 uppercase">Label size</label>
        <select value={labelSize} onChange={(e) => setLabelSize(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg bg-white text-sm">
          <option value="2x1">2" x 1"</option>
          <option value="2.5x1">2.5" x 1"</option>
          <option value="3x2">3" x 2"</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onClose}>Close</button>
        <button className="px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center gap-2" onClick={printLabel}><Icon name="printer" size={16} /> Print Label</button>
      </div>
    </div>
  }>
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <div className="text-2xl font-semibold text-slate-900 font-mono">{asset.id}</div>
        <div className="text-sm font-semibold text-slate-700 mt-1">{asset.assetName}</div>
        <div className="text-xs text-slate-500 mt-1">{[asset.category, asset.location, asset.type].filter(Boolean).join(" | ")}</div>
        {asset.serialNum && <div className="text-xs text-slate-400 mt-1">S/N: {asset.serialNum}{asset.manufacturer ? ` | ${asset.manufacturer}` : ""}{asset.model ? ` ${asset.model}` : ""}</div>}
      </div>
      <div className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600">
        <div className="font-bold text-slate-700 mb-1">Label Preview</div>
        <div className="p-2 border border-slate-200 rounded-lg bg-white">
          <div style={{fontSize:"8px", color:"#999", textTransform:"uppercase"}}>{orgName || ""}{pwsId ? " | " + pwsId : ""}</div>
          <div style={{fontSize:"13px", fontWeight:800, marginTop:"2px"}}>{asset.id}</div>
          <div style={{fontSize:"10px", fontWeight:600, color:"#555", marginTop:"1px"}}>{asset.assetName}</div>
          <div style={{fontSize:"8px", color:"#888", marginTop:"1px"}}>{[asset.category, asset.location, asset.type].filter(Boolean).join(" | ")}</div>
        </div>
      </div>
      <div className="text-xs text-slate-400 text-center mt-2">If the print dialog doesn't appear, your browser's popup blocker may be preventing it. Allow popups for this page and try again.</div>
    </div>
  </Modal>;
}
// Import Wizard Modal
function ImportWizardModal({ isOpen, onClose, onImportFile, onExportExcel, onExportBackup, onDownloadTemplate, parseExcelToAssets, parseCsvToAssets }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("merge");
  const [includeAll, setIncludeAll] = useState(true);
  const [preview, setPreview] = useState(null);
  const [parseError, setParseError] = useState("");
  function handleDrop(e) { e.preventDefault(); e.stopPropagation(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); setPreview(null); setParseError(""); } }
  function pickFile(e) { const f = e.target.files?.[0]; if (f) { setFile(f); setPreview(null); setParseError(""); } }
  function parsePreview() {
    if (!file) return;
    const name = (file.name || "").toLowerCase();
    if (name.endsWith(".json")) { setPreview({ type: "json", count: null, rows: [], unmapped: [] }); return; }
    const reader = new FileReader();
    reader.onerror = () => setParseError("Failed to read file.");
    if (name.endsWith(".csv") || name.endsWith(".tsv")) {
      reader.onload = () => { try {
        const result = parseCsvToAssets(reader.result, name.endsWith(".tsv") ? "\t" : ",");
        setPreview({ type: "csv", count: result.assets.length, rows: result.assets.slice(0, 5), unmapped: result.unmappedCols || [], allAssets: result.assets });
      } catch(e) { setParseError("Could not parse CSV: " + (e.message || "Check format.")); } };
      reader.readAsText(file); return;
    }
    reader.onload = () => { try {
      const result = parseExcelToAssets(reader.result);
      setPreview({ type: "xlsx", count: result.assets.length, rows: result.assets.slice(0, 5), unmapped: result.unmappedCols || [], allAssets: result.assets });
    } catch(e) { setParseError("Could not parse Excel: " + (e.message || "Check format.")); } };
    reader.readAsArrayBuffer(file);
  }
  function confirmImport() { if (!file) return; onImportFile(file, mode, includeAll, preview?.unmapped); }
  function resetWizard() { setFile(null); setPreview(null); setParseError(""); }
  return <Modal title="Import / Restore / Backup tools" subtitle="Import, restore, export, and backup tools." isOpen={isOpen} onClose={() => { resetWizard(); onClose(); }} footer={<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div className="flex gap-2"><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onDownloadTemplate}>Download template</button><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onExportExcel}>Export Excel</button><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onExportBackup}>Export JSON backup</button></div><div className="flex items-center justify-end gap-2"><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={() => { resetWizard(); onClose(); }}>Close</button>{!preview ? <button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={parsePreview} disabled={!file}>Preview import</button> : <><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={resetWizard}>Back</button><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={confirmImport}>Confirm import</button></>}</div></div>}>
    {!preview ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={`drop-zone p-5 ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}><div className="text-sm font-semibold text-slate-900">Drop a file here</div><div className="text-sm text-slate-600 mt-1">.xlsx or .csv for assets, or .json backup to restore everything.</div><div className="mt-4 flex items-center gap-2"><input type="file" accept=".xlsx,.xls,.csv,.tsv,.json" onChange={pickFile} className="block w-full text-sm" /></div>{file && <div className="mt-3 text-sm"><div className="font-semibold text-slate-900">{file.name}</div><div className="text-xs text-slate-500">{Math.round(file.size/1024)} KB</div></div>}{parseError && <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">{parseError}</div>}</div>
      <div className="glass-card p-4"><div className="text-sm font-semibold text-slate-900">Import mode</div><div className="text-xs text-slate-600 mt-1">Pick how incoming assets interact with existing data.</div><div className="mt-3 space-y-2"><label className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"><input type="radio" name="mode" checked={mode==="merge"} onChange={() => setMode("merge")} className="mt-1" /><div><div className="font-bold text-slate-900">Smart merge (recommended)</div><div className="text-xs text-slate-600">Matches by ID, then serial number, then name + location. Updates existing, adds new.</div></div></label><label className="flex items-start gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"><input type="radio" name="mode" checked={mode==="append"} onChange={() => setMode("append")} className="mt-1" /><div><div className="font-bold text-slate-900">Append</div><div className="text-xs text-slate-600">Add everything as new assets. Duplicates get new IDs.</div></div></label><label className="flex items-start gap-2 p-3 rounded-xl border border-red-200 hover:bg-red-50 cursor-pointer"><input type="radio" name="mode" checked={mode==="replace"} onChange={() => setMode("replace")} className="mt-1" /><div><div className="font-bold text-red-800">Replace all</div><div className="text-xs text-red-700">Wipes current register first. Cannot be undone without a backup.</div></div></label></div><div className="mt-3"><label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"><div><div className="text-sm font-semibold text-slate-900">JSON: include settings + logs</div><div className="text-xs text-slate-600">Only applies when importing JSON backup.</div></div><input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} /></label></div></div>
    </div> : <div className="space-y-4">
      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
        <div className="text-sm font-semibold text-emerald-900">Preview: {preview.type === "json" ? "JSON backup detected" : `${preview.count} asset${preview.count === 1 ? "" : "s"} found`}</div>
        <div className="text-xs text-emerald-800 mt-1">Mode: <strong>{mode === "merge" ? "Smart Merge" : mode === "append" ? "Append" : "Replace All"}</strong>{mode === "replace" && <span className="text-red-700 font-bold ml-2">This will wipe your current data!</span>}</div>
      </div>
      {preview.unmapped && preview.unmapped.length > 0 && <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
        <div className="text-sm font-semibold text-amber-900">Unmapped columns ({preview.unmapped.length})</div>
        <div className="text-xs text-amber-800 mt-1">These columns from your file were not recognized and will be skipped:</div>
        <div className="mt-2 flex flex-wrap gap-1">{preview.unmapped.map((col, i) => <span key={i} className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 text-xs font-semibold">{col}</span>)}</div>
        <div className="text-xs text-amber-700 mt-2">Use the template (Download template button) for the correct column names.</div>
      </div>}
      {preview.rows && preview.rows.length > 0 && <div className="glass-card p-4">
        <div className="text-sm font-semibold text-slate-900 mb-2">First {Math.min(preview.rows.length, 5)} rows:</div>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-slate-500 bg-slate-50"><tr><th className="py-1 px-2">Name</th><th className="py-1 px-2">Category</th><th className="py-1 px-2">Location</th><th className="py-1 px-2">Status</th><th className="py-1 px-2">Cost</th><th className="py-1 px-2">Condition</th></tr></thead><tbody>
          {preview.rows.slice(0, 5).map((a, i) => <tr key={i} className="border-t border-slate-100"><td className="py-1 px-2 font-semibold">{a.assetName || "---"}</td><td className="py-1 px-2">{a.category || "---"}</td><td className="py-1 px-2">{a.location || "---"}</td><td className="py-1 px-2">{a.status || "Active"}</td><td className="py-1 px-2">{a.replacementCost ? currencyFormatter.format(a.replacementCost) : "---"}</td><td className="py-1 px-2">{a.condition || "---"}</td></tr>)}
        </tbody></table></div>
      </div>}
      {preview.type === "json" && <div className="text-sm text-slate-600">JSON backups import all data (assets, settings, service log, history). Click "Confirm import" to proceed.</div>}
    </div>}
  </Modal>;
}
// Depreciation Mini Chart for Asset Detail
function DepreciationMiniChart({ asset, method }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const depMethod = method || "straight-line";
  const methodLabel = (DEPRECIATION_METHODS.find(m => m.value === depMethod) || {}).label || "Straight-Line";
  const chartData = useMemo(() => {
    const cost = toFloat(asset.replacementCost);
    const iy = getInstallYear(asset.installYear, asset.installDate);
    const life = toInt(asset.usefulLife);
    if (!cost || !iy || !life) return null;
    const points = [];
    for (let yr = iy; yr <= iy + life; yr++) {
      const val = calcDepreciated(cost, iy, life, null, depMethod);
      // recalc per-year by simulating age
      const age = yr - iy;
      let v;
      if (depMethod === "declining-balance") {
        const rate = 1.5 / life; v = cost;
        for (let i = 0; i < age; i++) v = v * (1 - rate);
        v = Math.round(Math.max(0, v));
      } else if (depMethod === "sum-of-years") {
        const soy = (life * (life + 1)) / 2; let dt = 0;
        for (let i = 1; i <= age; i++) dt += cost * ((life - i + 1) / soy);
        v = Math.round(Math.max(0, cost - dt));
      } else { v = Math.round(cost * Math.max(0, 1 - age / life)); }
      points.push({ year: yr, value: v });
    }
    return points;
  }, [asset, depMethod]);
  useEffect(() => {
    if (!canvasRef.current || chartRef.current || !chartData) return;
    chartRef.current = new Chart(canvasRef.current, { type: "bar", data: { labels: [], datasets: [{ label: "Book value", data: [], backgroundColor: [], borderRadius: 2 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "nearest", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => currencyFormatter.format(ctx.raw) } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => currencyFormatter.format(v) } }, x: { ticks: { maxTicksLimit: 10 } } } } });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [chartData]);
  useEffect(() => {
    if (!chartRef.current || !chartData) return;
    const currentYear = new Date().getFullYear();
    const colors = chartData.map(p => p.year <= currentYear ? "rgba(30,61,59,0.8)" : "rgba(118,185,0,0.5)");
    chartRef.current.data.labels = chartData.map(p => p.year);
    chartRef.current.data.datasets[0].data = chartData.map(p => p.value);
    chartRef.current.data.datasets[0].backgroundColor = colors;
    chartRef.current.update('none');
  }, [chartData]);
  if (!chartData) return <div className="text-sm text-slate-500 italic">Depreciation data requires replacement cost, install year, and useful life.</div>;
  return <div><div className="text-xs text-slate-500 mb-2">Method: {methodLabel}</div><div className="h-48"><canvas ref={canvasRef}></canvas></div></div>;
}
// Asset Detail Modal
function AssetDetailModal({ isOpen, onClose, asset, serviceLog, settings, onEdit, onDuplicate, onPrintLabel, onMarkMaint, onDelete, onLogService, sortedAssets, onNavigate, assetFiles, onSavePhoto, onSaveDocument, onSaveInspection, onDeleteFile }) {
  if (!isOpen || !asset) return null;
  const rb = riskBucket(asset.risk);
  const assetServices = useMemo(() => (serviceLog || []).filter(e => e.assetId === asset.id).sort((a, b) => (b.date || "").localeCompare(a.date || "")), [serviceLog, asset.id]);
  const condLabel = (CONDITIONS.find(c => c.value === toInt(asset.condition)) || {}).label || "Unknown";
  const wStatus = asset.warranty;
  const mStatus = asset.maint;
  const currentIdx = (sortedAssets || []).findIndex(a => a.id === asset.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < (sortedAssets || []).length - 1;
  function goPrev() { if (hasPrev && onNavigate) onNavigate(sortedAssets[currentIdx - 1]); }
  function goNext() { if (hasNext && onNavigate) onNavigate(sortedAssets[currentIdx + 1]); }
  function MetaRow({ label, value, highlight }) {
    if (value == null || value === "") return null;
    return <div className="flex items-start justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-bold text-slate-500 uppercase w-40 flex-shrink-0">{label}</span>
      <span className={`text-sm text-right ${highlight || "text-slate-900"}`}>{value}</span>
    </div>;
  }
  const plainSummary = `${asset.assetName || "This asset"} is a ${asset.type || asset.category || "system asset"}${asset.location ? ` at ${asset.location}` : ""}. ${asset.replaceYear ? `It is currently planned for replacement around ${asset.replaceYear}.` : "Replacement timing is not fully set yet."}`;
  return <Modal title={asset.assetName} subtitle={`${asset.id} · ${asset.category} · ${asset.type || "No type"}`} isOpen={isOpen} onClose={onClose} size="lg" footer={
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold flex items-center gap-2" onClick={() => { onClose(); onEdit(asset); }}><Icon name="edit" size={14} /> Edit</button>
        {onLogService && <button className="px-3 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center gap-2" onClick={() => { onClose(); onLogService(asset); }}><Icon name="wrench" size={14} /> Log Service</button>}
        <button className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold flex items-center gap-2" onClick={() => { onMarkMaint(asset); onClose(); }}><Icon name="check" size={14} /> Complete Maint</button>
        <button className="hidden md:flex px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold items-center gap-2" onClick={() => onDuplicate(asset)}><Icon name="copy" size={14} /> Duplicate</button>
        <button className="hidden md:flex px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold items-center gap-2" onClick={() => onPrintLabel(asset)}><Icon name="printer" size={14} /> Label</button>
      </div>
      <button className="hidden md:flex px-3 py-2 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 font-semibold items-center gap-2" onClick={() => { onClose(); onDelete([asset.id]); }}><Icon name="trash" size={14} /> Delete</button>
    </div>
  }>
    <div className="space-y-5">
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700">{plainSummary}</div>
      {/* Prev/Next navigation */}
      {sortedAssets && sortedAssets.length > 1 && <div className="flex items-center justify-between">
        <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed" disabled={!hasPrev} onClick={goPrev}><Icon name="chevronLeft" size={16} /> Previous</button>
        <div className="text-xs text-slate-500">{currentIdx >= 0 ? `${currentIdx + 1} of ${sortedAssets.length}` : ""}</div>
        <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed" disabled={!hasNext} onClick={goNext}>Next <Icon name="chevronRight" size={16} /></button>
      </div>}
      {/* Top row: photos + key stats */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Photo & Document gallery */}
        {((() => { const imgs = (assetFiles || []).filter(f => f.type === "image"); const docs = (assetFiles || []).filter(f => f.type === "document"); return imgs.length > 0 || docs.length > 0 || asset.imageUrl; })()) && <div className="flex-shrink-0 space-y-2 max-w-[220px]">
          <div className="flex flex-wrap gap-2">
            {(assetFiles || []).filter(f => f.type === "image").map((p, i) => <div key={p.name || i} className="relative group">
              <img src={p.url} alt={asset.assetName} className="w-20 h-20 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80" onClick={() => window.open(p.url, "_blank")} />
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 py-0.5 rounded-b-lg text-center">{new Date(p.date).toLocaleDateString()}</div>
              {onDeleteFile && <button type="button" onClick={() => onDeleteFile(asset.id, p.name)} className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition">x</button>}
            </div>)}
            {asset.imageUrl && <img src={asset.imageUrl} alt={asset.assetName} className="w-20 h-20 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80" onClick={() => window.open(asset.imageUrl, "_blank")} onError={(e) => { e.target.style.display = "none"; }} />}
          </div>
          {(assetFiles || []).filter(f => f.type === "document").length > 0 && <div className="space-y-1">{(assetFiles || []).filter(f => f.type === "document").map((d, i) => <div key={d.name || i} className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-100 text-[10px] group">
            <Icon name="file" size={12} /><span className="font-semibold text-slate-700 truncate flex-1">{d.name.replace(/^AM-\d+_doc_\d+/, "doc")}</span>
            {onDeleteFile && <button type="button" onClick={() => onDeleteFile(asset.id, d.name)} className="p-0.5 rounded hover:bg-red-100 text-red-600 opacity-0 group-hover:opacity-100"><Icon name="x" size={10} /></button>}
          </div>)}</div>}
          <div className="flex flex-wrap gap-1">
            {onSavePhoto && <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white text-[10px] font-semibold cursor-pointer"><Icon name="photo" size={11} /> Photo<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSavePhoto(asset.id, f); e.target.value = ""; }} /></label>}
            {onSaveInspection && <label className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold cursor-pointer"><Icon name="wrench" size={11} /> Inspect<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSaveInspection(asset.id, asset.assetName, f); e.target.value = ""; }} /></label>}
            {onSaveDocument && <label className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-[10px] font-semibold cursor-pointer"><Icon name="file" size={11} /> Doc<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onSaveDocument(asset.id, f); e.target.value = ""; }} /></label>}
          </div>
        </div>}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-bold text-slate-500 uppercase">Risk</div><div className="mt-1"><Chip label={asset.risk != null ? `${asset.risk}` : "N/A"} cls={rb.cls} /></div></div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-bold text-slate-500 uppercase">Condition</div><div className="text-lg font-semibold text-slate-900 mt-1">{asset.condition}/5</div><div className="text-xs text-slate-600">{condLabel}</div></div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-bold text-slate-500 uppercase">Total Value</div><div className="text-lg font-semibold text-slate-900 mt-1">{currencyFormatter.format(asset.totalCost || 0)}</div>{asset.deprec != null && <div className="text-xs text-slate-600">Book: {currencyFormatter.format(asset.deprec)}</div>}</div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-bold text-slate-500 uppercase">Status</div><div className="text-sm font-bold mt-1">{asset.status || "Active"}</div></div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-bold text-slate-500 uppercase">Priority</div><div className="text-sm font-bold mt-1">{asset.priority || "Medium"}</div></div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-bold text-slate-500 uppercase">Replace Year</div><div className="text-lg font-semibold text-slate-900 mt-1">{asset.replaceYear || "N/A"}</div>{asset.remaining != null && <div className="text-xs text-slate-600">{asset.remaining} yrs remaining</div>}</div>
        </div>
      </div>
      {/* Alerts row */}
      <div className="flex flex-wrap gap-2">
        
        {mStatus && mStatus.status === "overdue" && <div className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-bold">Maintenance OVERDUE (due {mStatus.dueDate})</div>}
        {mStatus && mStatus.status === "due" && <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">Maintenance due {mStatus.dueDate}</div>}
        {wStatus && wStatus.status === "expired" && <div className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold">Warranty expired</div>}
        {wStatus && wStatus.status === "expiring" && <div className="px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold">Warranty expiring in {wStatus.days} days</div>}
        {asset.remaining === 0 && asset.replaceYear && asset.replaceYear <= new Date().getFullYear() && <div className="px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold">Past useful life</div>}
      </div>
      {/* All metadata */}
      <div className="glass-card p-4">
        <div className="text-sm font-semibold text-slate-900 mb-2">Details</div>
        <MetaRow label="Location" value={asset.location} />
        <MetaRow label="Category" value={asset.category} />
        <MetaRow label="Type" value={asset.type} />
        <MetaRow label="Quantity" value={asset.quantity} />
        <MetaRow label="Installed" value={asset.installDisplay} />
        <MetaRow label="Useful Life" value={asset.usefulLife ? `${asset.usefulLife} years` : null} />
        <MetaRow label="Unit Cost" value={asset.replacementCost ? currencyFormatter.format(asset.replacementCost) : null} />
        <MetaRow label="Manufacturer" value={asset.manufacturer} />
        <MetaRow label="Model" value={asset.model} />
        <MetaRow label="Serial Number" value={asset.serialNum} />
        <MetaRow label="Last Maintenance" value={asset.lastMaint} />
        <MetaRow label="Maint Interval" value={asset.maintInt ? `${asset.maintInt} months` : null} />
        <MetaRow label="Warranty Exp" value={asset.warrantyExp} />
        <MetaRow label="GPS" value={(asset.latitude && asset.longitude) ? `${asset.latitude}, ${asset.longitude}` : null} />
        {asset.docUrl && <MetaRow label="Document" value={<a href={asset.docUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline text-xs">Open document</a>} />}
        {asset.notes && <div className="mt-2 pt-2 border-t border-slate-100"><div className="text-xs font-bold text-slate-500 uppercase mb-1">Notes</div><div className="text-sm text-slate-700 whitespace-pre-wrap">{asset.notes}</div></div>}
      </div>
      {/* Depreciation chart */}
      <div className="glass-card p-4">
        <div className="text-sm font-semibold text-slate-900 mb-2">Depreciation Curve<HelpLink tab="definitions" scrollTo="def-depreciation" /></div>
        <DepreciationMiniChart asset={asset} method={settings.depreciationMethod} />
      </div>
      {/* Service history for this asset */}
      <div className="glass-card p-4">
        <div className="text-sm font-semibold text-slate-900 mb-2">Service History ({assetServices.length} entries)</div>
        {assetServices.length > 0 ? <div className="space-y-3 max-h-64 overflow-y-auto pr-1">{assetServices.map(e => <div key={e.id} className="history-item"><div className="history-dot maintenance"></div><div className="p-3 bg-slate-50 rounded-xl border border-slate-100"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">{e.type || "Service"}</span><span className="text-xs text-slate-500 font-mono">{e.date || "No date"}</span></div><div className="text-xs text-slate-500">{e.vendor || ""}</div></div>{(e.cost != null || e.hours != null) && <div className="mt-1 flex gap-3 text-xs text-slate-600">{e.cost != null && <span>Cost: {currencyFormatter.format(e.cost)}</span>}{e.hours != null && <span>Hours: {e.hours}</span>}</div>}{e.notes && <div className="mt-1 text-xs text-slate-600">{e.notes}</div>}</div></div>)}</div> : <div className="text-center py-4"><div className="text-sm text-slate-500">No service entries recorded for this asset.</div>{onLogService && <button className="mt-2 px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold text-sm flex items-center gap-2 mx-auto" onClick={() => { onClose(); onLogService(asset); }}><Icon name="wrench" size={14} /> Log a service entry</button>}</div>}
      </div>
    </div>
  </Modal>;
}
// Batch Service Log Modal
function BatchServiceModal({ isOpen, onClose, selectedAssets, onSave }) {
  const [data, setData] = useState({ date: isoDate(), type: "Scheduled Maintenance", vendor: "", cost: "", hours: "", notes: "", updateLastMaint: true });
  function update(k, v) { setData(prev => ({ ...prev, [k]: v })); }
  if (!isOpen) return null;
  return <Modal title="Batch Service Log" subtitle={`Log the same action for ${selectedAssets.length} selected asset${selectedAssets.length === 1 ? "" : "s"}`} isOpen={isOpen} onClose={onClose} size="md" footer={
    <div className="flex items-center justify-between">
      <div className="text-sm text-slate-500">{selectedAssets.length} asset{selectedAssets.length === 1 ? "" : "s"} will receive this entry</div>
      <div className="flex items-center gap-2">
        <button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={onClose}>Cancel</button>
        <button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={() => onSave(data)}>Log {selectedAssets.length} Entries</button>
      </div>
    </div>
  }>
    <div className="space-y-3">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800"><strong>Batch mode:</strong> One service entry will be created for each selected asset with the details below.</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className="text-xs font-medium text-slate-600 uppercase">Date</label><input type="date" value={data.date} onChange={(e) => update("date", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Type</label><select value={data.type} onChange={(e) => update("type", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option>Scheduled Maintenance</option><option>Repair</option><option>Inspection</option><option>Calibration</option><option>Replacement</option><option>Sampling / Testing</option><option>Sanitary Survey</option><option>Regulatory Report</option><option>Emergency Response</option><option>Other</option></select></div>
        <div><label className="text-xs font-medium text-slate-600 uppercase">Vendor</label><input value={data.vendor} onChange={(e) => update("vendor", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Optional"/></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-slate-600 uppercase">Cost (each)</label><input value={data.cost} onChange={(e) => update("cost", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Optional"/></div><div><label className="text-xs font-medium text-slate-600 uppercase">Hours (each)</label><input value={data.hours} onChange={(e) => update("hours", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Optional"/></div></div>
      </div>
      <div><label className="text-xs font-medium text-slate-600 uppercase">Notes</label><textarea value={data.notes} onChange={(e) => update("notes", e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" rows="2" placeholder="What happened? Applied to all selected assets."></textarea></div>
      <label className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100 cursor-pointer">
        <input type="checkbox" checked={data.updateLastMaint} onChange={(e) => update("updateLastMaint", e.target.checked)} className="accent-emerald-600" />
        <div><div className="text-sm font-semibold text-emerald-900">Also update "Last Maintenance" date on each asset</div><div className="text-xs text-emerald-700">Sets each asset's last maintenance date to the service date above</div></div>
      </label>
      <div className="mt-2"><div className="text-xs font-bold text-slate-600 mb-1">Selected Assets:</div><div className="max-h-28 overflow-y-auto bg-slate-50 rounded-lg p-2 text-xs">{selectedAssets.map(a => <div key={a.id} className="py-0.5 border-b border-slate-200 last:border-0"><span className="font-mono text-slate-500">{a.id}</span> {a.assetName}</div>)}</div></div>
    </div>
  </Modal>;
}
// Offline / Status Indicator
function StatusIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return <div className="no-print" style={{position:"fixed",bottom:12,left:12,zIndex:50,display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:10,background:"rgba(255,255,255,0.95)",border:"1px solid #e2e8f0",boxShadow:"0 2px 8px rgba(0,0,0,0.08)",fontSize:11,fontWeight:600,color:"#475569"}}>
    <div style={{width:8,height:8,borderRadius:999,background:online?"#22c55e":"#ef4444",boxShadow:online?"0 0 4px #22c55e":"0 0 4px #ef4444"}}></div>
    <span>{online ? "Online" : "Offline"}</span>
    <span style={{color:"#94a3b8",fontWeight:400}}>|</span>
    <span style={{color:"#94a3b8",fontWeight:400}}>Data stored locally in this browser</span>
  </div>;
}
// Main App Component


function TutorialSpotlight({ step, current, total, isFirst, isLast, onPrev, onNext, onClose }) {
  const [rect, setRect] = useState(null);
  const [cardPos, setCardPos] = useState(null);
  const [arrow, setArrow] = useState("top");
  const cardRef = useRef(null);

  useEffect(() => {
    if (!step || !step.target) { setRect(null); setCardPos(null); return; }
    let cancelled = false;
    let tries = 0;
    let cleanup = null;
    const poll = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target);
      if (!el) {
        if (tries++ < 30) { setTimeout(poll, 90); return; }
        setRect(null); setCardPos(null); return;
      }
      try { el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch (e) {}
      const measure = () => {
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        // Don't spotlight targets that fill the viewport — the ring becomes meaningless.
        const targetTooBig = r.height > vh * 0.75 || r.width > vw * 0.9;
        if (targetTooBig) { setRect(null); setCardPos(null); return; }
        const pad = 6;
        setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
        const cardW = 460, cardH = 260, gap = 16;
        const spaceBelow = vh - (r.bottom + gap);
        const spaceAbove = r.top - gap;
        const spaceRight = vw - (r.right + gap);
        const spaceLeft = r.left - gap;
        let placement = "bottom";
        if (spaceBelow >= cardH) placement = "bottom";
        else if (spaceAbove >= cardH) placement = "top";
        else if (spaceRight >= cardW) placement = "right";
        else if (spaceLeft >= cardW) placement = "left";
        else placement = spaceBelow >= spaceAbove ? "bottom" : "top";
        let top, left, arr;
        const clampLeft = (x) => Math.min(vw - cardW - 16, Math.max(16, x));
        const clampTop = (y) => Math.min(vh - cardH - 16, Math.max(16, y));
        if (placement === "bottom") { top = clampTop(r.bottom + gap); left = clampLeft(r.left + r.width / 2 - cardW / 2); arr = "top"; }
        else if (placement === "top") { top = clampTop(r.top - cardH - gap); left = clampLeft(r.left + r.width / 2 - cardW / 2); arr = "bottom"; }
        else if (placement === "right") { top = clampTop(r.top + r.height / 2 - cardH / 2); left = clampLeft(r.right + gap); arr = "left"; }
        else { top = clampTop(r.top + r.height / 2 - cardH / 2); left = clampLeft(r.left - cardW - gap); arr = "right"; }
        setCardPos({ top, left }); setArrow(arr);
      };
      setTimeout(measure, 300);
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      window.addEventListener("scroll", measure, true);
      window.addEventListener("resize", measure);
      cleanup = () => { ro.disconnect(); window.removeEventListener("scroll", measure, true); window.removeEventListener("resize", measure); };
    };
    poll();
    return () => { cancelled = true; if (cleanup) cleanup(); };
  }, [step && step.id, step && step.target]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") onNext();
      else if (e.key === "ArrowLeft") { if (!isFirst) onPrev(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFirst, onNext, onPrev, onClose]);

  if (!step) return null;
  const pct = ((current + 1) / total) * 100;
  const hasSpotlight = !!rect && !!cardPos;
  const cardStyle = hasSpotlight ? { top: cardPos.top, left: cardPos.left } : {};
  const cardCls = "tut-card" + (hasSpotlight ? "" : " centered");

  return <>
    {/* Dim layer: use box-shadow technique when we have a target so the target
        itself stays fully lit. Fall back to a full backdrop when there's no
        target to highlight (welcome/summary steps). */}
    {hasSpotlight
      ? <div className="tut-spotlight no-print" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
      : <div className="tut-backdrop no-print" />}
    <div ref={cardRef} className={cardCls + " no-print"} style={cardStyle} role="dialog" aria-label={step.title} aria-modal="true">
      {hasSpotlight && arrow !== "none" && <div className={`tut-card-arrow ${arrow}`} style={
        arrow === "top" || arrow === "bottom"
          ? { left: Math.max(18, Math.min(460 - 22, (rect.left + rect.width / 2) - cardPos.left - 7)) }
          : { top: Math.max(18, Math.min(260 - 22, (rect.top + rect.height / 2) - cardPos.top - 7)) }
      } />}
      <div className="tut-progress-bar" style={{ borderRadius: "16px 16px 0 0" }}>
        <div className="tut-progress-fill" style={{ width: pct + "%" }} />
      </div>
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className={`tut-icon-box ${step.iconBg || "bg-[#1E3D3B]"} text-white`}>
            <Icon name={step.icon || "bookOpen"} size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-400 tracking-wide">Step {current + 1} of {total}</div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5 leading-snug">{step.title}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0" title="Close (Esc)"><Icon name="x" size={18} /></button>
        </div>
        <div className="mt-3 text-sm text-slate-700 leading-relaxed">{step.body}</div>
        {step.bullets && <ul className="mt-3 space-y-1.5">
          {step.bullets.map((b, i) =>
            <li key={i} className="flex items-start gap-2 text-sm text-slate-700 leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#76B900] flex-shrink-0" />
              <span>{b}</span>
            </li>
          )}
        </ul>}
        {step.tip && <div className="tut-tip mt-3"><div className="flex-shrink-0"><Icon name="info" size={16} /></div><div>{step.tip}</div></div>}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 font-medium">Skip tour</button>
          <div className="flex items-center gap-2">
            {!isFirst && <button onClick={onPrev} className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 hover:bg-slate-50 font-medium text-slate-700">Back</button>}
            {isLast
              ? <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Finish</button>
              : <button onClick={onNext} className="px-4 py-1.5 rounded-lg text-sm bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center gap-1">{isFirst ? "Start tour" : "Next"} <Icon name="chevronRight" size={14} /></button>
            }
          </div>
        </div>
      </div>
    </div>
  </>;
}

function App() {
  const [liveAssets, _setLiveAssets] = useLocalStorageState(KEYS.assets, []);
  const [liveSettings, _setLiveSettings] = useLocalStorageState(KEYS.settings, DEFAULT_SETTINGS);
  const [liveServiceLog, _setLiveServiceLog] = useLocalStorageState(KEYS.service, []);
  const [liveHistory, _setLiveHistory] = useLocalStorageState(KEYS.history, []);
  const [liveWorkOrders, _setLiveWorkOrders] = useLocalStorageState(KEYS.workOrders, []);
  const [liveIdCounter, _setLiveIdCounter] = useLocalStorageState(KEYS.idCounter, 1);
  const [prefs, setPrefs] = useLocalStorageState(KEYS.prefs, { defaultView: "dashboard", lastBackup: null, showStartHere: true, basicMode: true });
  const basicMode = prefs.basicMode !== false;
  const [isScenarioMode, setIsScenarioMode] = useState(false);
  const [scenarioDraft, setScenarioDraft] = useState(null);
  const scenarioSnapshotRef = useRef(null);
  const [scenarioDiffOpen, setScenarioDiffOpen] = useState(false);
  const [scenarioDiffData, setScenarioDiffData] = useState(null);
  const [scenarioTemplateOpen, setScenarioTemplateOpen] = useState(false);
  function applyStateUpdate(prev, updater) { return typeof updater === "function" ? updater(prev) : updater; }
  const assets = isScenarioMode ? (scenarioDraft?.assets || []) : liveAssets;
  const settings = isScenarioMode ? (scenarioDraft?.settings || DEFAULT_SETTINGS) : liveSettings;
  const serviceLog = isScenarioMode ? (scenarioDraft?.serviceLog || []) : liveServiceLog;
  const history = isScenarioMode ? (scenarioDraft?.history || []) : liveHistory;
  const workOrders = isScenarioMode ? (scenarioDraft?.workOrders || []) : liveWorkOrders;
  const idCounter = isScenarioMode ? (scenarioDraft?.idCounter ?? 1) : liveIdCounter;
  const setAssets = (updater) => {
    if (isScenarioMode) {
      setScenarioDraft(prev => ({ ...(prev || {}), assets: applyStateUpdate(prev?.assets || [], updater) }));
      return;
    }
    _setLiveAssets(updater);
  };
  const setSettings = (updater) => {
    if (isScenarioMode) {
      setScenarioDraft(prev => ({ ...(prev || {}), settings: applyStateUpdate(prev?.settings || DEFAULT_SETTINGS, updater) }));
      return;
    }
    _setLiveSettings(updater);
  };
  const setServiceLog = (updater) => {
    if (isScenarioMode) {
      setScenarioDraft(prev => ({ ...(prev || {}), serviceLog: applyStateUpdate(prev?.serviceLog || [], updater) }));
      return;
    }
    _setLiveServiceLog(updater);
  };
  const setHistory = (updater) => {
    if (isScenarioMode) {
      setScenarioDraft(prev => ({ ...(prev || {}), history: applyStateUpdate(prev?.history || [], updater) }));
      return;
    }
    _setLiveHistory(updater);
  };
  const setWorkOrders = (updater) => {
    if (isScenarioMode) {
      setScenarioDraft(prev => ({ ...(prev || {}), workOrders: applyStateUpdate(prev?.workOrders || [], updater) }));
      return;
    }
    _setLiveWorkOrders(updater);
  };
  const setIdCounter = (updater) => {
    if (isScenarioMode) {
      setScenarioDraft(prev => ({ ...(prev || {}), idCounter: applyStateUpdate(prev?.idCounter ?? 1, updater) }));
      return;
    }
    _setLiveIdCounter(updater);
  };
  const setOpeningScreen = (nextView) => {
    setPrefs(prev => ({ ...prev, defaultView: nextView }));
    if (["dashboard","assets"].includes(view)) setView(nextView);
  };
  const [view, setView] = useState(prefs.defaultView || "dashboard");
  const [overviewTab, setOverviewTab] = useState("dashboard");
  const [serviceCalTab, setServiceCalTab] = useState("service");
  const [showProfilesPanel, setShowProfilesPanel] = useState(false);
  useEffect(() => {
    if (["dashboard","reports","forecast"].includes(view)) setOverviewTab(view);
    if (["service","calendar"].includes(view)) setServiceCalTab(view);
  }, [view]);
  const showStartHere = prefs.showStartHere !== false;
  const [toast, setToast] = useState(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterCritical, setFilterCritical] = useState(false);
  const [alertFilter, setAlertFilter] = useState(null);
  const [sortBy, setSortBy] = useState("risk");
  const [sortDir, setSortDir] = useState("desc");
  const [selected, setSelected] = useState(new Set());
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editService, setEditService] = useState(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState("quickstart");
  const helpScrollTarget = useRef(null);
  function openHelpTo(tab, scrollId) { setHelpTab(tab || "quickstart"); helpScrollTarget.current = scrollId || null; setHelpOpen(true); }
  useEffect(() => { if (helpOpen && helpScrollTarget.current) { const targetId = helpScrollTarget.current; let tries = 0; function tryScroll() { const el = document.getElementById(targetId); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.outline = "3px solid #76B900"; el.style.outlineOffset = "4px"; el.style.borderRadius = "12px"; setTimeout(() => { el.style.outline = ""; el.style.outlineOffset = ""; el.style.borderRadius = ""; }, 3000); helpScrollTarget.current = null; } else if (tries < 10) { tries++; setTimeout(tryScroll, 100); } } setTimeout(tryScroll, 200); return () => { helpScrollTarget.current = null; }; } }, [helpOpen, helpTab]);
  // Listen for HelpLink events from any component
  useEffect(() => {
    function onHelpEvent(e) { const d = e.detail || {}; openHelpTo(d.tab, d.scrollTo); }
    window.addEventListener("ov-open-help", onHelpEvent);
    return () => window.removeEventListener("ov-open-help", onHelpEvent);
  }, []);
  useEffect(() => {
    setSettings(prev => migrateSettings(prev));
    setAssets(prev => Array.isArray(prev) ? prev.map(normalizeAsset) : []);
    setServiceLog(prev => Array.isArray(prev) ? prev.map(normalizeServiceEntry) : []);
  }, []);
  const [confirm, setConfirm] = useState({ open: false });
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [batchServiceOpen, setBatchServiceOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyActionFilter, setHistoryActionFilter] = useState("All");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [serviceSortBy, setServiceSortBy] = useState("date");
  const [serviceSortDir, setServiceSortDir] = useState("desc");
  const [horizon] = useState(20);
  const [forecastStartYear, setForecastStartYear] = useState(new Date().getFullYear());
  const [forecastHorizon, setForecastHorizon] = useState(5);
  const [forecastMode, setForecastMode] = useState("Basic");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [labelAsset, setLabelAsset] = useState(null);
  const [detailAsset, setDetailAsset] = useState(null);
  const [sealOk, setSealOk] = useState(true);
  const [autosaveHandle, setAutosaveHandle] = useState(null);
  const [autosaveState, setAutosaveState] = useState({ connected: false, fileName: "", lastSavedAt: null, error: "", saving: false });
  const autosaveDataRef = useRef({ assets, settings, serviceLog, history, workOrders, idCounter, prefs });
  useEffect(() => { autosaveDataRef.current = { assets, settings, serviceLog, history, workOrders, idCounter, prefs }; }, [assets, settings, serviceLog, history, workOrders, idCounter, prefs]);
  const autosaveTimeoutRef = useRef(null);
  const autosaveBusyRef = useRef(false);
  const idCounterRef = useRef(toInt(idCounter) ?? 1);
  const financial = useMemo(() => migrateSettings(settings).financial || buildDefaultFinancial(), [settings]);
  const laborRoles = financial.laborRoles || [];
  const overheadCategories = financial.overheadCategories || [];
  const maintenanceProfiles = financial.maintenanceProfiles || [];
  function updateFinancial(mutator) {
    setSettings(prev => {
      const next = migrateSettings(prev);
      const draft = safeClone(next.financial || buildDefaultFinancial());
      const result = mutator(draft) || draft;
      return migrateSettings({ ...next, financial: result, schemaVersion: 2 });
    });
  }
  function updateFinancialAssumptions(patch) { updateFinancial(fin => ({ ...fin, assumptions: { ...(fin.assumptions || {}), ...patch } })); }
  function updateBudgetModel(patch) { updateFinancial(fin => ({ ...fin, budgetModel: { ...(fin.budgetModel || {}), ...patch } })); }
  function addLaborRole() { updateFinancial(fin => ({ ...fin, laborRoles: [...(fin.laborRoles || []), normalizeLaborRole({ name: `Role ${(fin.laborRoles || []).length + 1}` })] })); }
  function updateLaborRole(roleId, patch) { updateFinancial(fin => ({ ...fin, laborRoles: (fin.laborRoles || []).map(role => role.id === roleId ? normalizeLaborRole({ ...role, ...patch }) : role) })); }
  function removeLaborRole(roleId) { updateFinancial(fin => ({ ...fin, laborRoles: (fin.laborRoles || []).filter(role => role.id !== roleId) })); }
  function addOverheadCategory() { updateFinancial(fin => ({ ...fin, overheadCategories: [...(fin.overheadCategories || []), normalizeOverheadCategory({ name: `Overhead ${(fin.overheadCategories || []).length + 1}` })] })); }
  function updateOverheadCategory(itemId, patch) { updateFinancial(fin => ({ ...fin, overheadCategories: (fin.overheadCategories || []).map(item => item.id === itemId ? normalizeOverheadCategory({ ...item, ...patch }) : item) })); }
  function removeOverheadCategory(itemId) { updateFinancial(fin => ({ ...fin, overheadCategories: (fin.overheadCategories || []).filter(item => item.id !== itemId) })); }
  function addMaintenanceProfile() { updateFinancial(fin => ({ ...fin, maintenanceProfiles: [...(fin.maintenanceProfiles || []), normalizeMaintenanceProfile({ name: `Profile ${(fin.maintenanceProfiles || []).length + 1}` })] })); }
  function updateMaintenanceProfile(profileId, patch) { updateFinancial(fin => ({ ...fin, maintenanceProfiles: (fin.maintenanceProfiles || []).map(profile => profile.id === profileId ? normalizeMaintenanceProfile({ ...profile, ...patch }) : profile) })); }
  function removeMaintenanceProfile(profileId) { updateFinancial(fin => ({ ...fin, maintenanceProfiles: (fin.maintenanceProfiles || []).filter(profile => profile.id !== profileId) })); }
  // File storage (File System Access API) - photos and documents
  const [photoHandle, setPhotoHandle] = useState(null);
  const [photoUrls, setPhotoUrls] = useState({});
  const photoSupported = typeof window !== "undefined" && "showDirectoryPicker" in window && !!window.isSecureContext;
  const isImgFile = (name) => /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isDocFile = (name) => /\.(pdf|doc|docx|xls|xlsx|txt|csv)$/i.test(name);
  async function connectPhotoDir() {
    if (!photoSupported) { showToast("File storage requires Chrome/Edge in a secure context.", "warn"); return null; }
    try {
      const handle = await window.showDirectoryPicker({ id: "ov-photos", mode: "readwrite", startIn: "documents" });
      setPhotoHandle(handle);
      showToast(`Folder connected: ${handle.name}`);
      loadAllFiles(handle);
      return handle;
    } catch (err) {
      if (err?.name !== "AbortError") showToast("Folder was not connected.", "warn");
      return null;
    }
  }
  async function ensurePhotoHandle() {
    if (photoHandle) return photoHandle;
    if (!photoSupported) { showToast("File storage requires Chrome/Edge in a secure context.", "warn"); return null; }
    return await connectPhotoDir();
  }
  async function loadAllFiles(dirHandle) {
    if (!dirHandle) return;
    const urls = {};
    try {
      for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind !== "file") continue;
        if (!isImgFile(name) && !isDocFile(name)) continue;
        const idMatch = name.match(/^(AM-\d+)/);
        if (!idMatch) continue;
        const aid = idMatch[1];
        try {
          const file = await entry.getFile();
          const isImg = isImgFile(name);
          const url = isImg ? URL.createObjectURL(file) : null;
          if (!urls[aid]) urls[aid] = [];
          urls[aid].push({ name, url, date: file.lastModified, type: isImg ? "image" : "document", size: file.size });
        } catch {}
      }
      Object.values(urls).forEach(arr => arr.sort((a, b) => b.date - a.date));
    } catch(e) { console.warn("File load error:", e); }
    setPhotoUrls(urls);
  }
  async function saveAssetFile(assetId, file, prefix) {
    const handle = await ensurePhotoHandle();
    if (!handle) return;
    try {
      const ext = (file.name.match(/\.[^.]+$/) || [".jpg"])[0].toLowerCase();
      const tag = prefix ? `${prefix}_` : "";
      const filename = `${assetId}_${tag}${Date.now()}${ext}`;
      const fileHandle = await handle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      const isImg = isImgFile(filename);
      const blob = await (await fileHandle.getFile());
      const url = isImg ? URL.createObjectURL(blob) : null;
      setPhotoUrls(prev => {
        const arr = [...(prev[assetId] || []), { name: filename, url, date: Date.now(), type: isImg ? "image" : "document", size: blob.size }];
        return { ...prev, [assetId]: arr };
      });
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, photos: [...(a.photos || []), filename], updatedAt: new Date().toISOString() } : a));
      return filename;
    } catch(e) { showToast("Failed to save file: " + (e.message || ""), "error"); return null; }
  }
  async function saveAssetPhoto(assetId, file) {
    const fn = await saveAssetFile(assetId, file);
    if (fn) showToast("Photo saved");
  }
  async function saveAssetDocument(assetId, file) {
    const fn = await saveAssetFile(assetId, file, "doc");
    if (fn) showToast("Document attached");
  }
  async function saveInspectionPhoto(assetId, assetName, file) {
    const fn = await saveAssetFile(assetId, file, "inspect");
    if (fn) {
      const entry = { id: Date.now(), assetId, assetName: assetName || assetId, date: isoDate(), type: "Inspection", vendor: "", cost: null, hours: null, notes: `Inspection photo captured: ${fn}`, createdAt: new Date().toISOString() };
      setServiceLog(prev => [...prev, entry]);
      addHistoryEntry(assetId, assetName, "maintenance", { type: { from: null, to: "Inspection" } });
      showToast("Inspection photo saved with service entry");
    }
  }
  async function deleteAssetFile(assetId, filename) {
    if (!photoHandle) return;
    try { await photoHandle.removeEntry(filename); } catch {}
    setPhotoUrls(prev => {
      const old = prev[assetId] || [];
      old.forEach(p => { if (p.name === filename && p.url) URL.revokeObjectURL(p.url); });
      return { ...prev, [assetId]: old.filter(p => p.name !== filename) };
    });
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, photos: (a.photos || []).filter(n => n !== filename), updatedAt: new Date().toISOString() } : a));
    showToast("File removed", "warn");
  }
  // Tutorial state
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialDone, setTutorialDone] = useLocalStorageState(KEYS.tutorialDone, false);

  function deepClone(obj) { try { return JSON.parse(JSON.stringify(obj)); } catch { return obj; } }

  const TYPICAL_SCENARIO_TEMPLATES = [
    {
      id: "very-small-groundwater",
      name: "Very Small Rural Groundwater PWS",
      sizeBand: "Very small PWS",
      serviceScale: "~140 connections | ~350 people",
      description: "A one-well / one-tank style rural community system with lean staffing, a standby generator, basic chlorine feed, and a tight capital reserve.",
      highlights: ["Single source groundwater", "Hydropneumatic / small storage", "Lean staffing and basic controls"]
    },
    {
      id: "small-rural-elevated",
      name: "Small Rural Elevated Storage PWS",
      sizeBand: "Small PWS",
      serviceScale: "~420 connections | ~1,200 people",
      description: "A more typical rural town setup with two wells, elevated storage, booster pumping, SCADA, and a modest operations team.",
      highlights: ["Two-well redundancy", "Elevated storage + clearwell", "Moderate budget and reserve"]
    },
    {
      id: "small-surface-water",
      name: "Small Surface Water Package Plant PWS",
      sizeBand: "Small PWS",
      serviceScale: "~950 connections | ~2,800 people",
      description: "A small surface water system with intake, package treatment, finished water pumping, generator backup, and higher operating complexity.",
      highlights: ["Surface intake + treatment train", "Higher staffing and maintenance burden", "Larger capital exposure"]
    }
  ];
  function getScenarioTemplateMeta(templateId) {
    return TYPICAL_SCENARIO_TEMPLATES.find(t => t.id === templateId) || TYPICAL_SCENARIO_TEMPLATES[0];
  }
  function buildScenarioAsset(id, patch = {}) {
    return normalizeAsset({
      id,
      assetName: "Scenario Asset",
      category: "Other",
      type: "Equipment",
      status: "Active",
      priority: "Medium",
      quantity: 1,
      location: "",
      installDate: "",
      installYear: 2014,
      usefulLife: 15,
      condition: 3,
      replacementCost: 0,
      manufacturer: "",
      model: "",
      serialNum: "",
      lastMaint: "2025-09-15",
      maintInt: 12,
      warrantyExp: "",
      notes: "Scenario-only mock data record.",
      imageUrl: "",
      docUrl: "",
      maintenanceProfileId: "",
      isCritical: false,
      latitude: "",
      longitude: "",
      createdAt: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-03-11T00:00:00.000Z",
      ...patch
    });
  }
  function buildScenarioServiceEntry(patch = {}) {
    return normalizeServiceEntry({
      id: patch.id || Date.now() + Math.round(Math.random() * 1000),
      assetId: patch.assetId || "",
      assetName: patch.assetName || "",
      date: patch.date || isoDate(),
      type: patch.type || "Scheduled Maintenance",
      vendor: patch.vendor || "",
      cost: patch.cost ?? null,
      hours: patch.hours ?? null,
      notes: patch.notes || "Scenario-only maintenance record.",
      serviceCost: patch.serviceCost || {},
      createdAt: patch.createdAt || new Date().toISOString()
    });
  }
  function buildTypicalScenarioData(templateId) {
    const meta = getScenarioTemplateMeta(templateId);
    const financialBase = buildDefaultFinancial();
    if (templateId === "small-rural-elevated") {
      const roles = [
        normalizeLaborRole({ id: "lr-superintendent", name: "Water Superintendent", payType: "salary", annualSalary: 72000, burdenPercent: 31, annualHours: 2080, defaultFte: 1 }),
        normalizeLaborRole({ id: "lr-operator", name: "Operator / Maintenance Tech", payType: "salary", annualSalary: 56000, burdenPercent: 29, annualHours: 2080, defaultFte: 1 }),
        normalizeLaborRole({ id: "lr-clerk", name: "Clerk / Billing", payType: "hourly", hourlyRate: 23, burdenPercent: 22, annualHours: 1040, defaultFte: 0.5 })
      ];
      const profiles = [
        normalizeMaintenanceProfile({ id: "mp-well", name: "Well & Vertical Turbine PM", assetCategory: "Wells", serviceFrequencyMonths: 12, defaultLaborRoleId: "lr-operator", defaultLaborHours: 10, defaultMaterialsCost: 650, defaultContractorCost: 450, defaultOverheadMode: "use-system-default" }),
        normalizeMaintenanceProfile({ id: "mp-booster", name: "Booster Pump PM", assetCategory: "Power/Emergency", serviceFrequencyMonths: 6, defaultLaborRoleId: "lr-operator", defaultLaborHours: 6, defaultMaterialsCost: 260, defaultContractorCost: 0, defaultOverheadMode: "use-system-default" }),
        normalizeMaintenanceProfile({ id: "mp-generator", name: "Generator Service", assetCategory: "Power/Emergency", serviceFrequencyMonths: 6, defaultLaborRoleId: "lr-operator", defaultLaborHours: 4, defaultMaterialsCost: 220, defaultContractorCost: 280, defaultOverheadMode: "use-system-default" }),
        normalizeMaintenanceProfile({ id: "mp-tank", name: "Storage Tank Inspection Cycle", assetCategory: "Storage", serviceFrequencyMonths: 36, defaultLaborRoleId: "lr-superintendent", defaultLaborHours: 6, defaultMaterialsCost: 0, defaultContractorCost: 3200, defaultOverheadMode: "manual", defaultOverheadAmount: 250 }),
        normalizeMaintenanceProfile({ id: "mp-scada", name: "SCADA / Controls PM", assetCategory: "Treatment", serviceFrequencyMonths: 12, defaultLaborRoleId: "lr-operator", defaultLaborHours: 5, defaultMaterialsCost: 140, defaultContractorCost: 350, defaultOverheadMode: "use-system-default" })
      ];
      const overhead = [
        normalizeOverheadCategory({ id: "oh-insurance", name: "Insurance / Admin", costType: "flat-annual", annualAmount: 26000, escalationRate: 4 }),
        normalizeOverheadCategory({ id: "oh-utilities", name: "Utilities / Communications", costType: "flat-annual", annualAmount: 34000, escalationRate: 4 }),
        normalizeOverheadCategory({ id: "oh-fuel", name: "Fuel / Fleet / Small Tools", costType: "flat-annual", annualAmount: 12000, escalationRate: 4 })
      ];
      const financial = {
        ...financialBase,
        assumptions: { ...financialBase.assumptions, laborEscalationRate: 3.5, overheadEscalationRate: 3.5, materialsEscalationRate: 3.5, contractorEscalationRate: 4, defaultBurdenPercent: 28, defaultOverheadPercent: 16 },
        laborRoles: roles,
        overheadCategories: overhead,
        maintenanceProfiles: profiles,
        budgetModel: { ...financialBase.budgetModel, contingencyPercent: 5 }
      };
      const assets = [
        buildScenarioAsset("AM-0001", { assetName: "Well No. 1 Vertical Turbine Pump", category: "Wells", type: "Well Pump", location: "Well Site No. 1", installYear: 2012, usefulLife: 18, condition: 3, replacementCost: 48000, priority: "Critical", maintInt: 12, lastMaint: "2025-10-12", maintenanceProfileId: "mp-well", isCritical: true }),
        buildScenarioAsset("AM-0002", { assetName: "Well No. 1 Motor & Starter", category: "Wells", type: "Motor Control", location: "Well Site No. 1", installYear: 2012, usefulLife: 15, condition: 3, replacementCost: 21000, priority: "High", maintInt: 12, lastMaint: "2025-10-12", isCritical: true }),
        buildScenarioAsset("AM-0003", { assetName: "Well No. 2 Vertical Turbine Pump", category: "Wells", type: "Well Pump", location: "Well Site No. 2", installYear: 2016, usefulLife: 18, condition: 4, replacementCost: 52000, priority: "Critical", maintInt: 12, lastMaint: "2025-09-28", maintenanceProfileId: "mp-well", isCritical: true }),
        buildScenarioAsset("AM-0004", { assetName: "Chlorine Feed Skid", category: "Treatment", type: "Disinfection", location: "Water Plant", installYear: 2018, usefulLife: 12, condition: 4, replacementCost: 17000, priority: "Critical", maintInt: 3, lastMaint: "2026-01-15", maintenanceProfileId: "mp-scada", isCritical: true }),
        buildScenarioAsset("AM-0005", { assetName: "Residual Analyzer", category: "Treatment", type: "Analyzer", location: "Water Plant", installYear: 2021, usefulLife: 8, condition: 4, replacementCost: 7200, priority: "High", maintInt: 6, lastMaint: "2025-11-04", maintenanceProfileId: "mp-scada" }),
        buildScenarioAsset("AM-0006", { assetName: "Ground Storage Clearwell", category: "Storage", type: "Clearwell", location: "Water Plant", installYear: 2009, usefulLife: 30, condition: 3, replacementCost: 165000, priority: "High", maintInt: 12, lastMaint: "2025-08-20", isCritical: true }),
        buildScenarioAsset("AM-0007", { assetName: "Elevated Storage Tank", category: "Storage", type: "Elevated Tank", location: "North Tower Site", installYear: 2001, usefulLife: 40, condition: 3, replacementCost: 920000, priority: "Critical", maintInt: 36, lastMaint: "2024-07-10", maintenanceProfileId: "mp-tank", isCritical: true }),
        buildScenarioAsset("AM-0008", { assetName: "Tank Mixer / Altitude Valve Assembly", category: "Storage", type: "Tank Appurtenance", location: "North Tower Site", installYear: 2014, usefulLife: 15, condition: 3, replacementCost: 38000, priority: "High", maintInt: 12, lastMaint: "2025-06-17" }),
        buildScenarioAsset("AM-0009", { assetName: "High Service Pump No. 1", category: "Power/Emergency", type: "Booster Pump", location: "Water Plant", installYear: 2013, usefulLife: 15, condition: 3, replacementCost: 43000, priority: "Critical", maintInt: 6, lastMaint: "2025-12-08", maintenanceProfileId: "mp-booster", isCritical: true }),
        buildScenarioAsset("AM-0010", { assetName: "High Service Pump No. 2", category: "Power/Emergency", type: "Booster Pump", location: "Water Plant", installYear: 2013, usefulLife: 15, condition: 3, replacementCost: 43000, priority: "Critical", maintInt: 6, lastMaint: "2025-12-08", maintenanceProfileId: "mp-booster", isCritical: true }),
        buildScenarioAsset("AM-0011", { assetName: "Standby Generator 150 kW", category: "Power/Emergency", type: "Generator", location: "Water Plant", installYear: 2011, usefulLife: 20, condition: 3, replacementCost: 86000, priority: "Critical", maintInt: 6, lastMaint: "2025-11-14", maintenanceProfileId: "mp-generator", isCritical: true }),
        buildScenarioAsset("AM-0012", { assetName: "Automatic Transfer Switch", category: "Power/Emergency", type: "ATS", location: "Water Plant", installYear: 2011, usefulLife: 18, condition: 3, replacementCost: 18000, priority: "High", maintInt: 12, lastMaint: "2025-11-14" }),
        buildScenarioAsset("AM-0013", { assetName: "SCADA PLC Panel", category: "Treatment", type: "Controls", location: "Water Plant", installYear: 2017, usefulLife: 10, condition: 3, replacementCost: 28000, priority: "High", maintInt: 12, lastMaint: "2025-09-30", maintenanceProfileId: "mp-scada" }),
        buildScenarioAsset("AM-0014", { assetName: "Master Meter at Plant Discharge", category: "Compliance", type: "Master Meter", location: "Water Plant", installYear: 2019, usefulLife: 12, condition: 4, replacementCost: 9400, priority: "High", maintInt: 12, lastMaint: "2025-10-05" }),
        buildScenarioAsset("AM-0015", { assetName: "Distribution Main Segment - Highway 3", category: "Distribution", type: "8-inch Main Segment", location: "Highway 3 Corridor", installYear: 1998, usefulLife: 45, condition: 2, replacementCost: 260000, priority: "High", maintInt: 12, lastMaint: "2025-05-15", isCritical: true }),
        buildScenarioAsset("AM-0016", { assetName: "Distribution Valve Cluster - East Zone", category: "Distribution", type: "Gate Valves", location: "East Pressure Zone", installYear: 2004, usefulLife: 30, condition: 3, replacementCost: 28000, priority: "Medium", maintInt: 12, lastMaint: "2025-04-11" }),
        buildScenarioAsset("AM-0017", { assetName: "Fire Hydrant Group - West Zone", category: "Distribution", type: "Hydrants", location: "West Zone", installYear: 2008, usefulLife: 30, condition: 3, replacementCost: 34000, priority: "Medium", maintInt: 12, lastMaint: "2025-04-11" }),
        buildScenarioAsset("AM-0018", { assetName: "Customer Meter Fleet", category: "Distribution", type: "Meters", location: "Systemwide", installYear: 2015, usefulLife: 15, condition: 3, replacementCost: 138000, priority: "High", maintInt: 12, lastMaint: "2025-08-01", quantity: 420 }),
        buildScenarioAsset("AM-0019", { assetName: "Water Plant Building HVAC", category: "Buildings", type: "HVAC", location: "Water Plant", installYear: 2010, usefulLife: 18, condition: 2, replacementCost: 21000, priority: "Medium", maintInt: 12, lastMaint: "2025-07-22" }),
        buildScenarioAsset("AM-0020", { assetName: "Lab / Sampling Equipment Set", category: "Compliance", type: "Sampling Equipment", location: "Water Plant", installYear: 2020, usefulLife: 8, condition: 4, replacementCost: 12500, priority: "Medium", maintInt: 12, lastMaint: "2025-12-20" })
      ];
      const byId = Object.fromEntries(assets.map(a => [a.id, a]));
      const serviceLog = [
        buildScenarioServiceEntry({ id: 20001, assetId: "AM-0001", assetName: byId["AM-0001"].assetName, date: "2025-10-12", type: "Scheduled Maintenance", vendor: "Rural Pump Service", notes: "Pulled amps, checked bowls, repacked seal area.", serviceCost: { laborRoleId: "lr-operator", laborHours: 8, laborRate: 34, materialsCost: 480, contractorCost: 350, overheadAmount: 90 } }),
        buildScenarioServiceEntry({ id: 20002, assetId: "AM-0007", assetName: byId["AM-0007"].assetName, date: "2024-07-10", type: "Inspection", vendor: "Tank Inspectors LLC", notes: "Interior and exterior tank inspection with minor coating notes.", serviceCost: { laborRoleId: "lr-superintendent", laborHours: 4, laborRate: 46, materialsCost: 0, contractorCost: 2950, overheadAmount: 180 } }),
        buildScenarioServiceEntry({ id: 20003, assetId: "AM-0011", assetName: byId["AM-0011"].assetName, date: "2025-11-14", type: "Scheduled Maintenance", vendor: "PowerPro Engines", notes: "Oil, filters, coolant sample, weekly exercise settings checked.", serviceCost: { laborRoleId: "lr-operator", laborHours: 3, laborRate: 34, materialsCost: 210, contractorCost: 260, overheadAmount: 55 } }),
        buildScenarioServiceEntry({ id: 20004, assetId: "AM-0013", assetName: byId["AM-0013"].assetName, date: "2025-09-30", type: "Calibration", vendor: "SCADA Integrators", notes: "PLC backup created and alarm dial-out tested.", serviceCost: { laborRoleId: "lr-operator", laborHours: 5, laborRate: 34, materialsCost: 60, contractorCost: 325, overheadAmount: 40 } }),
        buildScenarioServiceEntry({ id: 20005, assetId: "AM-0009", assetName: byId["AM-0009"].assetName, date: "2025-12-08", type: "Scheduled Maintenance", vendor: "Internal", notes: "Coupling and packing inspection, pressure check.", serviceCost: { laborRoleId: "lr-operator", laborHours: 4, laborRate: 34, materialsCost: 145, contractorCost: 0, overheadAmount: 35 } }),
        buildScenarioServiceEntry({ id: 20006, assetId: "AM-0018", assetName: byId["AM-0018"].assetName, date: "2025-08-01", type: "Replacement", vendor: "Meter Supply Co.", notes: "Rotated out failed meter batch in south pressure zone.", serviceCost: { laborRoleId: "lr-operator", laborHours: 14, laborRate: 34, materialsCost: 4200, contractorCost: 0, overheadAmount: 210 } })
      ];
      const settings = migrateSettings({
        ...DEFAULT_SETTINGS,
        orgName: `Scenario - ${meta.name}`,
        pwsId: "OK-SCN-1200",
        inflationRate: 3.5,
        reserveBalance: 220000,
        annualContribution: 55000,
        annualBudget: 420000,
        annualGrantFunding: 30000,
        reserveInterestRate: 1.5,
        scenarioMode: "Standard",
        showDepreciation: true,
        showWarranty: true,
        scenarioTemplateId: meta.id,
        scenarioTemplateName: meta.name,
        scenarioTemplateDescription: meta.description,
        financial
      });
      return { assets, settings, serviceLog, history: [], idCounter: 21, templateMeta: meta };
    }
    if (templateId === "small-surface-water") {
      const roles = [
        normalizeLaborRole({ id: "lr-manager", name: "Plant Superintendent", payType: "salary", annualSalary: 88000, burdenPercent: 32, annualHours: 2080, defaultFte: 1 }),
        normalizeLaborRole({ id: "lr-operator-a", name: "Treatment Operator", payType: "salary", annualSalary: 64000, burdenPercent: 29, annualHours: 2080, defaultFte: 2 }),
        normalizeLaborRole({ id: "lr-distribution", name: "Distribution Operator", payType: "salary", annualSalary: 57000, burdenPercent: 28, annualHours: 2080, defaultFte: 1 }),
        normalizeLaborRole({ id: "lr-admin", name: "Office / Billing", payType: "hourly", hourlyRate: 24, burdenPercent: 22, annualHours: 1560, defaultFte: 0.75 })
      ];
      const profiles = [
        normalizeMaintenanceProfile({ id: "mp-intake", name: "Raw Water Intake PM", assetCategory: "Intake", serviceFrequencyMonths: 6, defaultLaborRoleId: "lr-distribution", defaultLaborHours: 8, defaultMaterialsCost: 420, defaultContractorCost: 300 }),
        normalizeMaintenanceProfile({ id: "mp-hsp", name: "High Service Pump PM", assetCategory: "Power/Emergency", serviceFrequencyMonths: 6, defaultLaborRoleId: "lr-operator-a", defaultLaborHours: 7, defaultMaterialsCost: 360, defaultContractorCost: 220 }),
        normalizeMaintenanceProfile({ id: "mp-generator", name: "Generator PM", assetCategory: "Power/Emergency", serviceFrequencyMonths: 6, defaultLaborRoleId: "lr-distribution", defaultLaborHours: 4, defaultMaterialsCost: 280, defaultContractorCost: 340 }),
        normalizeMaintenanceProfile({ id: "mp-filter", name: "Filter / Backwash PM", assetCategory: "Treatment", serviceFrequencyMonths: 3, defaultLaborRoleId: "lr-operator-a", defaultLaborHours: 10, defaultMaterialsCost: 700, defaultContractorCost: 0 }),
        normalizeMaintenanceProfile({ id: "mp-scada", name: "SCADA & Analyzer PM", assetCategory: "Treatment", serviceFrequencyMonths: 12, defaultLaborRoleId: "lr-operator-a", defaultLaborHours: 6, defaultMaterialsCost: 220, defaultContractorCost: 580 })
      ];
      const overhead = [
        normalizeOverheadCategory({ id: "oh-insurance", name: "Insurance / Admin", costType: "flat-annual", annualAmount: 52000, escalationRate: 4 }),
        normalizeOverheadCategory({ id: "oh-power", name: "Power / Communications", costType: "flat-annual", annualAmount: 92000, escalationRate: 4 }),
        normalizeOverheadCategory({ id: "oh-fleet", name: "Fleet / Fuel / Small Tools", costType: "flat-annual", annualAmount: 26000, escalationRate: 4 }),
        normalizeOverheadCategory({ id: "oh-lab", name: "Lab / Compliance Support", costType: "flat-annual", annualAmount: 18000, escalationRate: 4 })
      ];
      const financial = {
        ...financialBase,
        assumptions: { ...financialBase.assumptions, laborEscalationRate: 3.5, overheadEscalationRate: 3.5, materialsEscalationRate: 4, contractorEscalationRate: 4.5, defaultBurdenPercent: 29, defaultOverheadPercent: 18 },
        laborRoles: roles,
        overheadCategories: overhead,
        maintenanceProfiles: profiles,
        budgetModel: { ...financialBase.budgetModel, contingencyPercent: 7 }
      };
      const assets = [
        buildScenarioAsset("AM-0001", { assetName: "River Intake Pump No. 1", category: "Intake", type: "Raw Water Pump", location: "Intake Structure", installYear: 2011, usefulLife: 18, condition: 3, replacementCost: 96000, priority: "Critical", maintInt: 6, lastMaint: "2025-11-05", maintenanceProfileId: "mp-intake", isCritical: true }),
        buildScenarioAsset("AM-0002", { assetName: "River Intake Pump No. 2", category: "Intake", type: "Raw Water Pump", location: "Intake Structure", installYear: 2011, usefulLife: 18, condition: 3, replacementCost: 96000, priority: "Critical", maintInt: 6, lastMaint: "2025-11-05", maintenanceProfileId: "mp-intake", isCritical: true }),
        buildScenarioAsset("AM-0003", { assetName: "Intake Screen & Debris Rake", category: "Intake", type: "Screening", location: "Intake Structure", installYear: 2014, usefulLife: 12, condition: 3, replacementCost: 36000, priority: "High", maintInt: 6, lastMaint: "2025-10-16" }),
        buildScenarioAsset("AM-0004", { assetName: "Package Treatment Unit", category: "Treatment", type: "Package Plant", location: "Treatment Building", installYear: 2010, usefulLife: 25, condition: 3, replacementCost: 1250000, priority: "Critical", maintInt: 3, lastMaint: "2025-12-12", maintenanceProfileId: "mp-filter", isCritical: true }),
        buildScenarioAsset("AM-0005", { assetName: "Rapid Mix / Coagulation Feed System", category: "Treatment", type: "Chemical Feed", location: "Treatment Building", installYear: 2017, usefulLife: 12, condition: 4, replacementCost: 82000, priority: "Critical", maintInt: 3, lastMaint: "2026-01-08", isCritical: true }),
        buildScenarioAsset("AM-0006", { assetName: "Dual Media Filter Train", category: "Treatment", type: "Filter System", location: "Treatment Building", installYear: 2010, usefulLife: 20, condition: 3, replacementCost: 420000, priority: "Critical", maintInt: 3, lastMaint: "2025-12-12", maintenanceProfileId: "mp-filter", isCritical: true }),
        buildScenarioAsset("AM-0007", { assetName: "Finished Water Clearwell", category: "Storage", type: "Clearwell", location: "Treatment Building", installYear: 2008, usefulLife: 30, condition: 3, replacementCost: 360000, priority: "Critical", maintInt: 12, lastMaint: "2025-08-19", isCritical: true }),
        buildScenarioAsset("AM-0008", { assetName: "High Service Pump No. 1", category: "Power/Emergency", type: "Finished Water Pump", location: "Pump Gallery", installYear: 2013, usefulLife: 15, condition: 3, replacementCost: 56000, priority: "Critical", maintInt: 6, lastMaint: "2025-11-30", maintenanceProfileId: "mp-hsp", isCritical: true }),
        buildScenarioAsset("AM-0009", { assetName: "High Service Pump No. 2", category: "Power/Emergency", type: "Finished Water Pump", location: "Pump Gallery", installYear: 2013, usefulLife: 15, condition: 3, replacementCost: 56000, priority: "Critical", maintInt: 6, lastMaint: "2025-11-30", maintenanceProfileId: "mp-hsp", isCritical: true }),
        buildScenarioAsset("AM-0010", { assetName: "Elevated Storage Tank", category: "Storage", type: "Elevated Tank", location: "Central Tower Site", installYear: 1999, usefulLife: 40, condition: 3, replacementCost: 1120000, priority: "Critical", maintInt: 36, lastMaint: "2024-06-24", isCritical: true }),
        buildScenarioAsset("AM-0011", { assetName: "Ground Storage Tank", category: "Storage", type: "Ground Storage", location: "South Storage Site", installYear: 2004, usefulLife: 35, condition: 3, replacementCost: 680000, priority: "High", maintInt: 12, lastMaint: "2025-07-18", isCritical: true }),
        buildScenarioAsset("AM-0012", { assetName: "Standby Generator 300 kW", category: "Power/Emergency", type: "Generator", location: "Treatment Plant", installYear: 2012, usefulLife: 20, condition: 3, replacementCost: 148000, priority: "Critical", maintInt: 6, lastMaint: "2025-10-27", maintenanceProfileId: "mp-generator", isCritical: true }),
        buildScenarioAsset("AM-0013", { assetName: "Automatic Transfer Switch", category: "Power/Emergency", type: "ATS", location: "Treatment Plant", installYear: 2012, usefulLife: 18, condition: 3, replacementCost: 26000, priority: "High", maintInt: 12, lastMaint: "2025-10-27" }),
        buildScenarioAsset("AM-0014", { assetName: "Plant SCADA / Historian Server", category: "Treatment", type: "SCADA", location: "Control Room", installYear: 2019, usefulLife: 8, condition: 4, replacementCost: 35000, priority: "High", maintInt: 12, lastMaint: "2025-09-19", maintenanceProfileId: "mp-scada" }),
        buildScenarioAsset("AM-0015", { assetName: "Online Turbidity Analyzer", category: "Compliance", type: "Analyzer", location: "Filter Gallery", installYear: 2021, usefulLife: 8, condition: 4, replacementCost: 14000, priority: "High", maintInt: 6, lastMaint: "2025-12-14" }),
        buildScenarioAsset("AM-0016", { assetName: "Chlorine Analyzer & Feed System", category: "Treatment", type: "Disinfection", location: "Chemical Room", installYear: 2018, usefulLife: 12, condition: 4, replacementCost: 30000, priority: "Critical", maintInt: 3, lastMaint: "2026-01-10", isCritical: true }),
        buildScenarioAsset("AM-0017", { assetName: "Finished Water Master Meter", category: "Compliance", type: "Master Meter", location: "Plant Discharge", installYear: 2018, usefulLife: 12, condition: 4, replacementCost: 12000, priority: "High", maintInt: 12, lastMaint: "2025-10-02" }),
        buildScenarioAsset("AM-0018", { assetName: "Transmission Main Segment", category: "Distribution", type: "12-inch Main Segment", location: "Plant to Town Route", installYear: 1995, usefulLife: 50, condition: 2, replacementCost: 540000, priority: "High", maintInt: 12, lastMaint: "2025-06-06", isCritical: true }),
        buildScenarioAsset("AM-0019", { assetName: "Distribution Valve Program", category: "Distribution", type: "Valves", location: "Systemwide", installYear: 2006, usefulLife: 30, condition: 3, replacementCost: 62000, priority: "Medium", maintInt: 12, lastMaint: "2025-05-09" }),
        buildScenarioAsset("AM-0020", { assetName: "Customer Meter Fleet", category: "Distribution", type: "Meters", location: "Systemwide", installYear: 2016, usefulLife: 15, condition: 3, replacementCost: 320000, priority: "High", maintInt: 12, lastMaint: "2025-08-09", quantity: 950 }),
        buildScenarioAsset("AM-0021", { assetName: "Plant Laboratory Equipment", category: "Compliance", type: "Lab Equipment", location: "Lab", installYear: 2020, usefulLife: 10, condition: 4, replacementCost: 42000, priority: "Medium", maintInt: 12, lastMaint: "2025-12-01" }),
        buildScenarioAsset("AM-0022", { assetName: "Treatment Building HVAC", category: "Buildings", type: "HVAC", location: "Treatment Building", installYear: 2011, usefulLife: 18, condition: 2, replacementCost: 31000, priority: "Medium", maintInt: 12, lastMaint: "2025-07-13" })
      ];
      const byId = Object.fromEntries(assets.map(a => [a.id, a]));
      const serviceLog = [
        buildScenarioServiceEntry({ id: 30001, assetId: "AM-0004", assetName: byId["AM-0004"].assetName, date: "2025-12-12", type: "Scheduled Maintenance", vendor: "Internal", notes: "Backwash valve inspection, actuator grease, and basin drain check.", serviceCost: { laborRoleId: "lr-operator-a", laborHours: 12, laborRate: 40, materialsCost: 680, contractorCost: 0, overheadAmount: 110 } }),
        buildScenarioServiceEntry({ id: 30002, assetId: "AM-0012", assetName: byId["AM-0012"].assetName, date: "2025-10-27", type: "Scheduled Maintenance", vendor: "GenPower South", notes: "Quarterly load test and annual fluids package.", serviceCost: { laborRoleId: "lr-distribution", laborHours: 5, laborRate: 35, materialsCost: 290, contractorCost: 520, overheadAmount: 75 } }),
        buildScenarioServiceEntry({ id: 30003, assetId: "AM-0015", assetName: byId["AM-0015"].assetName, date: "2025-12-14", type: "Calibration", vendor: "Compliance Tech", notes: "Turbidity analyzer calibration and verification standards.", serviceCost: { laborRoleId: "lr-operator-a", laborHours: 3, laborRate: 40, materialsCost: 110, contractorCost: 180, overheadAmount: 35 } }),
        buildScenarioServiceEntry({ id: 30004, assetId: "AM-0001", assetName: byId["AM-0001"].assetName, date: "2025-11-05", type: "Repair", vendor: "Raw Water Mechanical", notes: "Bearing noise and coupling alignment correction on intake pump.", serviceCost: { laborRoleId: "lr-distribution", laborHours: 7, laborRate: 35, materialsCost: 440, contractorCost: 760, overheadAmount: 90 } }),
        buildScenarioServiceEntry({ id: 30005, assetId: "AM-0020", assetName: byId["AM-0020"].assetName, date: "2025-08-09", type: "Replacement", vendor: "Meter Supply Co.", notes: "AMI pilot replacement batch and transmitter programming.", serviceCost: { laborRoleId: "lr-distribution", laborHours: 18, laborRate: 35, materialsCost: 9100, contractorCost: 0, overheadAmount: 220 } })
      ];
      const settings = migrateSettings({
        ...DEFAULT_SETTINGS,
        orgName: `Scenario - ${meta.name}`,
        pwsId: "OK-SCN-2800",
        inflationRate: 3.75,
        reserveBalance: 460000,
        annualContribution: 120000,
        annualBudget: 980000,
        annualGrantFunding: 60000,
        reserveInterestRate: 1.75,
        scenarioMode: "Conservative",
        showDepreciation: true,
        showWarranty: true,
        scenarioTemplateId: meta.id,
        scenarioTemplateName: meta.name,
        scenarioTemplateDescription: meta.description,
        financial
      });
      return { assets, settings, serviceLog, history: [], idCounter: 23, templateMeta: meta };
    }
    const roles = [
      normalizeLaborRole({ id: "lr-operator", name: "Certified Operator", payType: "salary", annualSalary: 58000, burdenPercent: 28, annualHours: 2080, defaultFte: 1 }),
      normalizeLaborRole({ id: "lr-helper", name: "Operator Helper", payType: "hourly", hourlyRate: 22, burdenPercent: 20, annualHours: 1040, defaultFte: 0.5 }),
      normalizeLaborRole({ id: "lr-clerk", name: "Part-Time Clerk", payType: "hourly", hourlyRate: 19, burdenPercent: 18, annualHours: 520, defaultFte: 0.25 })
    ];
    const profiles = [
      normalizeMaintenanceProfile({ id: "mp-well", name: "Well Pump PM", assetCategory: "Wells", serviceFrequencyMonths: 12, defaultLaborRoleId: "lr-operator", defaultLaborHours: 8, defaultMaterialsCost: 420, defaultContractorCost: 320 }),
      normalizeMaintenanceProfile({ id: "mp-chlorine", name: "Chlorine Feed PM", assetCategory: "Treatment", serviceFrequencyMonths: 3, defaultLaborRoleId: "lr-operator", defaultLaborHours: 3, defaultMaterialsCost: 90, defaultContractorCost: 0 }),
      normalizeMaintenanceProfile({ id: "mp-booster", name: "Booster PM", assetCategory: "Power/Emergency", serviceFrequencyMonths: 6, defaultLaborRoleId: "lr-helper", defaultLaborHours: 4, defaultMaterialsCost: 150, defaultContractorCost: 0 }),
      normalizeMaintenanceProfile({ id: "mp-generator", name: "Generator PM", assetCategory: "Power/Emergency", serviceFrequencyMonths: 6, defaultLaborRoleId: "lr-helper", defaultLaborHours: 3, defaultMaterialsCost: 170, defaultContractorCost: 250 })
    ];
    const overhead = [
      normalizeOverheadCategory({ id: "oh-admin", name: "Insurance / Admin", costType: "flat-annual", annualAmount: 18000, escalationRate: 4 }),
      normalizeOverheadCategory({ id: "oh-utils", name: "Utilities / Communications", costType: "flat-annual", annualAmount: 14000, escalationRate: 4 }),
      normalizeOverheadCategory({ id: "oh-fleet", name: "Fuel / Sampling / Small Tools", costType: "flat-annual", annualAmount: 8000, escalationRate: 4 })
    ];
    const financial = {
      ...financialBase,
      assumptions: { ...financialBase.assumptions, laborEscalationRate: 3, overheadEscalationRate: 3.5, materialsEscalationRate: 3.5, contractorEscalationRate: 4, defaultBurdenPercent: 24, defaultOverheadPercent: 14 },
      laborRoles: roles,
      overheadCategories: overhead,
      maintenanceProfiles: profiles,
      budgetModel: { ...financialBase.budgetModel, contingencyPercent: 4 }
    };
    const assets = [
      buildScenarioAsset("AM-0001", { assetName: "Production Well No. 1 Pump", category: "Wells", type: "Submersible Well Pump", location: "Well Site", installYear: 2013, usefulLife: 18, condition: 3, replacementCost: 36000, priority: "Critical", maintInt: 12, lastMaint: "2025-10-01", maintenanceProfileId: "mp-well", isCritical: true }),
      buildScenarioAsset("AM-0002", { assetName: "Wellhead Motor Control Panel", category: "Wells", type: "Motor Control", location: "Well Site", installYear: 2013, usefulLife: 15, condition: 3, replacementCost: 14000, priority: "High", maintInt: 12, lastMaint: "2025-10-01" }),
      buildScenarioAsset("AM-0003", { assetName: "Chlorine Feed Pump A", category: "Treatment", type: "Chemical Feed", location: "Pump House", installYear: 2019, usefulLife: 8, condition: 4, replacementCost: 3800, priority: "Critical", maintInt: 3, lastMaint: "2026-01-06", maintenanceProfileId: "mp-chlorine", isCritical: true }),
      buildScenarioAsset("AM-0004", { assetName: "Chlorine Feed Pump B", category: "Treatment", type: "Chemical Feed", location: "Pump House", installYear: 2019, usefulLife: 8, condition: 4, replacementCost: 3800, priority: "Critical", maintInt: 3, lastMaint: "2026-01-06", maintenanceProfileId: "mp-chlorine", isCritical: true }),
      buildScenarioAsset("AM-0005", { assetName: "Residual Analyzer", category: "Compliance", type: "Analyzer", location: "Pump House", installYear: 2021, usefulLife: 8, condition: 4, replacementCost: 6200, priority: "High", maintInt: 6, lastMaint: "2025-11-11" }),
      buildScenarioAsset("AM-0006", { assetName: "Hydropneumatic Tank", category: "Storage", type: "Pressure Tank", location: "Pump House", installYear: 2008, usefulLife: 25, condition: 3, replacementCost: 74000, priority: "Critical", maintInt: 12, lastMaint: "2025-08-14", isCritical: true }),
      buildScenarioAsset("AM-0007", { assetName: "Booster Pump No. 1", category: "Power/Emergency", type: "Booster Pump", location: "Pump House", installYear: 2014, usefulLife: 15, condition: 3, replacementCost: 18000, priority: "High", maintInt: 6, lastMaint: "2025-12-03", maintenanceProfileId: "mp-booster" }),
      buildScenarioAsset("AM-0008", { assetName: "Booster Pump No. 2", category: "Power/Emergency", type: "Booster Pump", location: "Pump House", installYear: 2014, usefulLife: 15, condition: 3, replacementCost: 18000, priority: "High", maintInt: 6, lastMaint: "2025-12-03", maintenanceProfileId: "mp-booster" }),
      buildScenarioAsset("AM-0009", { assetName: "Standby Generator 80 kW", category: "Power/Emergency", type: "Generator", location: "Pump House", installYear: 2012, usefulLife: 20, condition: 3, replacementCost: 54000, priority: "Critical", maintInt: 6, lastMaint: "2025-11-02", maintenanceProfileId: "mp-generator", isCritical: true }),
      buildScenarioAsset("AM-0010", { assetName: "Automatic Transfer Switch", category: "Power/Emergency", type: "ATS", location: "Pump House", installYear: 2012, usefulLife: 18, condition: 3, replacementCost: 12000, priority: "High", maintInt: 12, lastMaint: "2025-11-02" }),
      buildScenarioAsset("AM-0011", { assetName: "Distribution Main Segment - North", category: "Distribution", type: "6-inch Main Segment", location: "North Loop", installYear: 1996, usefulLife: 45, condition: 2, replacementCost: 145000, priority: "High", maintInt: 12, lastMaint: "2025-05-19", isCritical: true }),
      buildScenarioAsset("AM-0012", { assetName: "Distribution Main Segment - South", category: "Distribution", type: "4-inch Main Segment", location: "South Road", installYear: 2002, usefulLife: 40, condition: 3, replacementCost: 98000, priority: "Medium", maintInt: 12, lastMaint: "2025-05-19" }),
      buildScenarioAsset("AM-0013", { assetName: "Gate Valve Set", category: "Distribution", type: "Valves", location: "Systemwide", installYear: 2005, usefulLife: 30, condition: 3, replacementCost: 16000, priority: "Medium", maintInt: 12, lastMaint: "2025-04-08" }),
      buildScenarioAsset("AM-0014", { assetName: "Customer Meter Fleet", category: "Distribution", type: "Meters", location: "Systemwide", installYear: 2014, usefulLife: 15, condition: 3, replacementCost: 42000, priority: "High", maintInt: 12, lastMaint: "2025-07-28", quantity: 140 }),
      buildScenarioAsset("AM-0015", { assetName: "SCADA / Alarm Dialer", category: "Compliance", type: "Remote Alarm", location: "Pump House", installYear: 2017, usefulLife: 10, condition: 3, replacementCost: 11500, priority: "High", maintInt: 12, lastMaint: "2025-09-21" }),
      buildScenarioAsset("AM-0016", { assetName: "Pump House HVAC", category: "Buildings", type: "Mini-Split HVAC", location: "Pump House", installYear: 2018, usefulLife: 12, condition: 3, replacementCost: 7500, priority: "Low", maintInt: 12, lastMaint: "2025-06-12" })
    ];
    const byId = Object.fromEntries(assets.map(a => [a.id, a]));
    const serviceLog = [
      buildScenarioServiceEntry({ id: 10001, assetId: "AM-0001", assetName: byId["AM-0001"].assetName, date: "2025-10-01", type: "Scheduled Maintenance", vendor: "Rural Pump Service", notes: "Checked amp draw and pump run time trend.", serviceCost: { laborRoleId: "lr-operator", laborHours: 6, laborRate: 31, materialsCost: 260, contractorCost: 220, overheadAmount: 55 } }),
      buildScenarioServiceEntry({ id: 10002, assetId: "AM-0009", assetName: byId["AM-0009"].assetName, date: "2025-11-02", type: "Scheduled Maintenance", vendor: "PowerPro Engines", notes: "Annual service, load bank test, and battery replacement.", serviceCost: { laborRoleId: "lr-helper", laborHours: 3, laborRate: 26, materialsCost: 340, contractorCost: 280, overheadAmount: 35 } }),
      buildScenarioServiceEntry({ id: 10003, assetId: "AM-0011", assetName: byId["AM-0011"].assetName, date: "2025-05-19", type: "Repair", vendor: "Utility Crew", notes: "Clamp repair after leak complaint and pressure drop.", serviceCost: { laborRoleId: "lr-helper", laborHours: 5, laborRate: 26, materialsCost: 180, contractorCost: 0, overheadAmount: 20 } }),
      buildScenarioServiceEntry({ id: 10004, assetId: "AM-0003", assetName: byId["AM-0003"].assetName, date: "2026-01-06", type: "Calibration", vendor: "Internal", notes: "Stroked feed pump and verified chlorine residual setpoint.", serviceCost: { laborRoleId: "lr-operator", laborHours: 2, laborRate: 31, materialsCost: 35, contractorCost: 0, overheadAmount: 10 } })
    ];
    const settings = migrateSettings({
      ...DEFAULT_SETTINGS,
      orgName: `Scenario - ${meta.name}`,
      pwsId: "OK-SCN-0350",
      inflationRate: 3.25,
      reserveBalance: 85000,
      annualContribution: 22000,
      annualBudget: 165000,
      annualGrantFunding: 15000,
      reserveInterestRate: 1.25,
      scenarioMode: "Standard",
      showDepreciation: true,
      showWarranty: true,
      scenarioTemplateId: meta.id,
      scenarioTemplateName: meta.name,
      scenarioTemplateDescription: meta.description,
      financial
    });
    return { assets, settings, serviceLog, history: [], idCounter: 17, templateMeta: meta };
  }

  function computeScenarioDiff(snapAssets, snapSettings, snapService, curAssets, curSettings, curService) {
    const diff = { assetsAdded: [], assetsRemoved: [], assetsModified: [], settingsChanged: [], serviceAdded: 0, totalChanges: 0 };
    const snapMap = new Map((snapAssets || []).map(a => [a.id, a]));
    const curMap = new Map((curAssets || []).map(a => [a.id, a]));
    curMap.forEach((a, id) => { if (!snapMap.has(id)) diff.assetsAdded.push(a.assetName || id); });
    snapMap.forEach((a, id) => { if (!curMap.has(id)) diff.assetsRemoved.push(a.assetName || id); });
    snapMap.forEach((snapA, id) => {
      const curA = curMap.get(id);
      if (!curA) return;
      const fields = ["assetName","category","condition","replacementCost","usefulLife","priority","status","location","installYear","installDate","maintInt","lastMaint","warrantyExp","notes","isCritical","quantity"];
      const changed = fields.filter(f => String(snapA[f] ?? "") !== String(curA[f] ?? ""));
      if (changed.length > 0) diff.assetsModified.push({ name: curA.assetName || id, fields: changed });
    });
    const settingsKeys = ["inflationRate","reserveBalance","annualContribution","annualBudget","annualGrantFunding","reserveInterestRate","scenarioMode","orgName","pwsId","depreciationMethod"];
    settingsKeys.forEach(k => {
      if (String(snapSettings[k] ?? "") !== String(curSettings[k] ?? "")) diff.settingsChanged.push({ key: k, from: snapSettings[k], to: curSettings[k] });
    });
    const finBefore = JSON.stringify(migrateSettings(snapSettings).financial || {});
    const finAfter = JSON.stringify(migrateSettings(curSettings).financial || {});
    if (finBefore !== finAfter) {
      const snapFin = migrateSettings(snapSettings).financial || buildDefaultFinancial();
      const curFin = migrateSettings(curSettings).financial || buildDefaultFinancial();
      diff.settingsChanged.push({ key: "financial.laborRoles", from: (snapFin.laborRoles || []).length, to: (curFin.laborRoles || []).length });
      diff.settingsChanged.push({ key: "financial.overheadCategories", from: (snapFin.overheadCategories || []).length, to: (curFin.overheadCategories || []).length });
      diff.settingsChanged.push({ key: "financial.maintenanceProfiles", from: (snapFin.maintenanceProfiles || []).length, to: (curFin.maintenanceProfiles || []).length });
    }
    diff.serviceAdded = Math.max(0, (curService || []).length - (snapService || []).length);
    diff.totalChanges = diff.assetsAdded.length + diff.assetsRemoved.length + diff.assetsModified.length + diff.settingsChanged.length + diff.serviceAdded;
    return diff;
  }

  function enterScenarioMode() {
    const snapshot = {
      assets: deepClone(liveAssets),
      settings: deepClone(liveSettings),
      serviceLog: deepClone(liveServiceLog),
      history: deepClone(liveHistory),
      idCounter: liveIdCounter
    };
    scenarioSnapshotRef.current = snapshot;
    setScenarioDraft(deepClone(snapshot));
    _scenarioWriteBlock.active = true;
    setIsScenarioMode(true);
    setScenarioTemplateOpen(true);
    setView("dashboard");
    showToast("Scenario mode is on. You are working in a safe practice copy, not your real saved data.", "warn");
  }

  function exitScenarioMode(forceDiscard) {
    const snap = scenarioSnapshotRef.current;
    const draft = scenarioDraft || snap;
    if (!snap) { setScenarioDraft(null); setIsScenarioMode(false); _scenarioWriteBlock.active = false; return; }
    if (!forceDiscard && draft) {
      const diff = computeScenarioDiff(snap.assets, snap.settings, snap.serviceLog, draft.assets, draft.settings, draft.serviceLog);
      if (diff.totalChanges > 0) { setScenarioDiffData(diff); setScenarioDiffOpen(true); return; }
    }
    _scenarioWriteBlock.active = false;
    scenarioSnapshotRef.current = null;
    setScenarioDraft(null);
    setIsScenarioMode(false);
    setScenarioDiffOpen(false);
    setScenarioDiffData(null);
    showToast("Scenario mode OFF. Your real saved data was left untouched.", "warn");
  }

  function confirmDiscardScenario() { exitScenarioMode(true); }

  function toggleScenarioMode() { isScenarioMode ? exitScenarioMode(false) : enterScenarioMode(); }
  function resetScenarioToBaseline() {
    const snap = scenarioSnapshotRef.current;
    if (!isScenarioMode || !snap) return;
    setScenarioDraft(deepClone(snap));
    showToast("Scenario reset to baseline copy.", "warn");
  }
  function openScenarioChanges() {
    const snap = scenarioSnapshotRef.current;
    const draft = scenarioDraft || snap;
    if (!isScenarioMode || !snap || !draft) return;
    const diff = computeScenarioDiff(snap.assets, snap.settings, snap.serviceLog, draft.assets, draft.settings, draft.serviceLog);
    setScenarioDiffData(diff);
    setScenarioDiffOpen(true);
  }
  function loadScenarioTemplate(templateId) {
    if (!isScenarioMode) return;
    const meta = getScenarioTemplateMeta(templateId);
    const currentDraft = scenarioDraft || scenarioSnapshotRef.current;
    if (currentDraft && !window.confirm(`Load ${meta.name} into Scenario Mode? This replaces the current mock dataset only. Your saved data will remain untouched.`)) return;
    const dataset = buildTypicalScenarioData(templateId);
    setScenarioDraft(dataset);
    setScenarioTemplateOpen(false);
    setView("dashboard");
    showToast(`${meta.name} loaded into sandbox mode. Your real saved data was not changed.`, "warn");
  }
  const TUTORIAL_STEPS = useMemo(() => [
    { id: "welcome", icon: "award", iconBg: "bg-[#1E3D3B]", nav: "dashboard", target: null, title: "Welcome to Oka Vlhpisa",
      body: "This is a simple record-keeping app for public water systems. You can list the equipment you own, track when each piece was serviced, and see at a glance what needs attention. The name is Choctaw for \u201cwater measured.\u201d",
      bullets: [
        "Your data stays on this computer. Nothing is sent online.",
        "Start small. A name and a rough year is enough to get going.",
        "A short tour of each tab follows. It takes about two minutes."
      ],
      tip: "You can close this tour any time with the X in the corner, and come back later from the Tour button in the header." },
    { id: "basic-advanced", icon: "gear", iconBg: "bg-[#76B900]", nav: "settings", target: "[data-tut=\"toggle-basic-advanced\"]", title: "Basics or Advanced \u2014 your choice",
      body: "In the top navigation you\u2019ll see a Basics / Advanced switch. Basics shows only the tabs most people need day to day. Advanced turns on forecasting, reports, and financial planning features.",
      bullets: [
        "Basics shows: Overview, Assets, Service & Calendar, Import / Backup, Settings.",
        "Advanced also adds: long-range Forecast, Reports, History log, and Scenarios.",
        "You can flip between them any time. No data is lost."
      ],
      tip: "If this is your first time using the app, leave it on Basics. Switch to Advanced when you\u2019re comfortable." },
    { id: "dashboard", icon: "search", iconBg: "bg-emerald-600", nav: "dashboard", target: null, title: "Overview \u2014 your daily check-in",
      body: "The Overview page summarizes your system in one screen. It\u2019s the page worth opening each morning.",
      bullets: [
        "Total equipment count and what it would cost to replace today.",
        "Average condition across everything that\u2019s still active.",
        "Alerts for anything overdue for service or near end of useful life.",
        "Tap any alert to jump straight to those items in your Assets list."
      ],
      tip: "The more complete your asset information, the more useful this page becomes." },
    { id: "assets", icon: "plus", iconBg: "bg-blue-600", nav: "assets", target: "[data-tut=\"btn-add-asset\"]", title: "Assets \u2014 your equipment list",
      body: "The Assets tab is your master list of pumps, tanks, meters, wells, and so on. Add things as you find them. It does not have to be perfect the first time.",
      bullets: [
        "Use Add asset to enter one item. You only need a name to start.",
        "Catalog Quick-Fill on the form suggests common water-system equipment with useful life and typical costs.",
        "Don\u2019t know the install date? Pick Year Only or Month/Year instead of a full date.",
        "Attach photos and PDF manuals to any asset for quick reference later.",
        "Search, filter by category, or sort by risk to find things fast."
      ],
      tip: "Have a spreadsheet already? The Import / Backup tab can bring it in. We\u2019ll cover that in a moment." },
    { id: "service-calendar", icon: "calendar", iconBg: "bg-indigo-600", nav: "service", target: "[data-tut=\"nav-service-cal\"]", title: "Service & Calendar \u2014 keep maintenance on track",
      body: "This tab has two views. The Service log records what was done. The Calendar shows what\u2019s coming up. Both update automatically from your assets.",
      bullets: [
        "On each asset, set Last Maintenance (date last serviced) and Maintenance Interval (how often, in months).",
        "The Calendar fills in automatically from those two fields. No separate scheduling needed.",
        "Green means on schedule, yellow means due this month, red means overdue.",
        "Every service entry links back to its asset, so you build up a full history over time."
      ],
      tip: "If the Calendar looks empty, it\u2019s usually because Last Maintenance and Interval have not been filled in yet." },
    { id: "data", icon: "database", iconBg: "bg-cyan-600", nav: "data", target: "[data-tut=\"btn-import\"]", title: "Import / Backup \u2014 protect your work",
      body: "All of your data lives in this browser. If you clear browser data or switch computers, it\u2019s gone unless you have a backup. This tab is how you make one.",
      bullets: [
        "Export JSON backup writes every record to a single file. Save it on a USB drive or email it to yourself.",
        "The import wizard accepts .xlsx, .csv, and .json files. Smart Merge avoids duplicates when re-importing.",
        "Download the blank template if you want field staff to fill in a spreadsheet.",
        "On supported browsers, Autosave can keep a backup file on disk in sync automatically."
      ],
      tip: "Export a JSON backup at least once a month, and always before you import a big batch of new data." },
    { id: "scenarios", icon: "flask", iconBg: "bg-amber-700", nav: "dashboard", target: null, title: "Scenarios \u2014 a safe place to practice (Advanced)",
      body: "Scenarios appear when Advanced mode is on. They give you a sandbox copy of your data where you can try things without changing your real records.",
      bullets: [
        "Load a sample water system to explore the app with realistic data.",
        "Test what-if changes \u2014 early replacements, rate increases, labor shifts \u2014 and see the effect.",
        "Use Start Over to reset the sandbox, or Leave Scenario to return to your real data.",
        "Nothing you do in a scenario touches your saved records."
      ],
      tip: "If you\u2019re worried about breaking something, try it in Scenarios first." },
    { id: "forecast-reports", icon: "database", iconBg: "bg-purple-600", nav: "forecast", target: null, title: "Forecast & Reports \u2014 for planning and funders (Advanced)",
      body: "In Advanced mode, two more views open up. Forecast projects future replacement and operating costs. Reports turns your records into something you can email or print.",
      bullets: [
        "Forecast combines capital replacement, labor, maintenance, and overhead over 10 to 30 years.",
        "It pulls inflation, reserve balance, grants, and budget assumptions from Settings.",
        "Reports produce branded PDFs for board meetings, grant applications, or state submittals.",
        "A Data Completeness score tells you how trustworthy each year\u2019s number is."
      ],
      tip: "The forecast is only as accurate as your asset data. Filling in install year, useful life, and replacement cost makes a big difference." },
    { id: "settings", icon: "gear", iconBg: "bg-slate-700", nav: "settings", target: "[data-tut=\"btn-settings\"]", title: "Settings \u2014 the basics are enough",
      body: "You only need a few fields in Settings to get started. Everything else is optional and mostly for Advanced users.",
      bullets: [
        "Organization name and PWS ID appear on every export and report.",
        "In Advanced: inflation rate, reserve balance, annual contribution, budget, and grant funding.",
        "Workers, overhead, and maintenance templates live at the bottom of the Assets tab.",
        "You can restart this tour any time from the Settings page."
      ],
      tip: "A Health Check panel on this page tells you if browser storage, photo folders, and autosave are ready to go." },
    { id: "done", icon: "check", iconBg: "bg-emerald-600", nav: null, target: null, title: "A simple first-week plan",
      body: "You\u2019ve seen everything. Here\u2019s what to actually do next, in order:",
      bullets: [
        "Enter your organization name and PWS ID in Settings.",
        "Add five to ten assets. Start with whatever is easiest to find first.",
        "For each one, set the install year, condition, and a rough maintenance interval.",
        "Glance at the Overview and Calendar to make sure nothing looks off.",
        "Export a JSON backup from Import / Backup before you close the app."
      ],
      tip: "The Help button in the top bar has definitions, FAQs, and detailed how-tos whenever you need them." }
  ], []);
  useEffect(() => { if (!tutorialDone && assets.length === 0) { const t = setTimeout(() => setTutorialActive(true), 800); return () => clearTimeout(t); } }, []);
  useEffect(() => { const img = new Image(); img.onload = () => setSealOk(true); img.onerror = () => setSealOk(false); img.src = "HeroImage_CH.png"; }, []);
  const fileSystemSupported = typeof window !== "undefined" && "showSaveFilePicker" in window;
  const autosaveSupported = fileSystemSupported && !!window.isSecureContext;
  const appHealth = useMemo(() => ({ online: navigator.onLine, secure: !!window.isSecureContext, fileSystemSupported: autosaveSupported, storageReady: typeof localStorage !== "undefined", sealOk }), [sealOk, autosaveSupported]);
  const launchGuidance = !appHealth.secure ? "For connected autosave, launch this app through the included localhost launcher instead of opening the HTML directly." : "Connected autosave is available when a file is linked in a supported browser.";
  const missingProjectionFields = useMemo(() => (assets || []).filter(a => (a.status || "Active") !== "Retired" && (!calcReplaceYear(a.installYear, a.usefulLife, a.installDate) || !(toFloat(a.replacementCost) > 0))).length, [assets]);
  async function writeAutosaveFile(reason = "autosave", handleOverride = null) {
    const handle = handleOverride || autosaveHandle;
    if (!handle) return false;
    if (autosaveBusyRef.current) return false;
    try {
      autosaveBusyRef.current = true;
      setAutosaveState(prev => ({ ...prev, saving: true, error: "" }));
      const payload = { app: APP_NAME, version: APP_VERSION, savedAt: new Date().toISOString(), reason, data: autosaveDataRef.current };
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
      setAutosaveState(prev => ({ ...prev, connected: true, fileName: handle.name || prev.fileName, lastSavedAt: new Date().toISOString(), saving: false, error: "" }));

      return true;
    } catch (err) {
      setAutosaveState(prev => ({ ...prev, saving: false, error: err?.message || "Autosave failed" }));
      return false;
    } finally { autosaveBusyRef.current = false; }
  }
  async function connectAutosaveFile() {
    if (!autosaveSupported) { showToast("Connected autosave needs Edge/Chrome in a secure context.", "warn"); return; }
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: `OkaVlhpisa_Autosave_${settings.pwsId || "WorkingCopy"}.json`, types: [{ description: "JSON Files", accept: { "application/json": [".json"] } }] });
      setAutosaveHandle(handle);
      setAutosaveState({ connected: true, fileName: handle.name || "Autosave JSON", lastSavedAt: null, error: "", saving: false });
      setPrefs(prev => ({ ...prev, autosaveFileName: handle.name || prev.autosaveFileName || "" }));
      await writeAutosaveFile("initial-connect", handle);
      showToast("Connected autosave file");
    } catch (err) {
      if (err && err.name !== "AbortError") showToast("Autosave file was not connected", "warn");
    }
  }
  function disconnectAutosave() {
    setAutosaveHandle(null);
    setAutosaveState({ connected: false, fileName: "", lastSavedAt: null, error: "", saving: false });
    showToast("Connected autosave removed", "warn");
  }
  useEffect(() => {
    if (!autosaveHandle) return;
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => { if (!_scenarioWriteBlock.active) writeAutosaveFile("debounced-change"); }, 1500);
    return () => autosaveTimeoutRef.current && clearTimeout(autosaveTimeoutRef.current);
  }, [assets, settings, serviceLog, history, idCounter, autosaveHandle]);
  // Silent IndexedDB backup on every data change
  useEffect(() => { if (!assets.length || _scenarioWriteBlock.active) return; const payload = { app: APP_NAME, version: APP_VERSION, savedAt: new Date().toISOString(), data: { assets, settings, serviceLog, history, workOrders, idCounter, prefs } }; writeIDB(payload); }, [assets, settings, serviceLog, history, workOrders, idCounter, prefs]);
  // IDB recovery: if localStorage is empty but IDB has data, restore (with delay to let LS hydrate first)
  useEffect(() => { if (assets.length > 0) return; const timer = setTimeout(async () => { const lsCheck = readLS(KEYS.assets, []); if (Array.isArray(lsCheck) && lsCheck.length > 0) return; const snap = await readIDB(); if (snap?.data?.assets?.length > 0) { setAssets(snap.data.assets.map(normalizeAsset)); if (snap.data.settings) setSettings(prev => migrateSettings({ ...(prev || DEFAULT_SETTINGS), ...(snap.data.settings || {}) })); if (Array.isArray(snap.data.serviceLog)) setServiceLog(snap.data.serviceLog); if (Array.isArray(snap.data.history)) setHistory(snap.data.history); if (Array.isArray(snap.data.workOrders)) setWorkOrders(snap.data.workOrders); if (typeof snap.data.idCounter === "number") { setIdCounter(snap.data.idCounter); idCounterRef.current = snap.data.idCounter; } if (snap.data.prefs && typeof snap.data.prefs === "object") setPrefs(prev => ({ ...(prev || {}), ...snap.data.prefs })); showToast(`Recovered ${snap.data.assets.length} assets from browser backup`, "success"); } }, 300); return () => clearTimeout(timer); }, []);
  // First-launch autosave prompt + backup reminders
  const [showBackupBanner, setShowBackupBanner] = useState(false);
  useEffect(() => { if (!assets.length) return; const lb = prefs.lastBackup; const daysSince = lb ? Math.floor((Date.now() - new Date(lb).getTime()) / 86400000) : null; if (daysSince === null && assets.length >= 3) { const t = setTimeout(() => setShowBackupBanner(true), 1500); return () => clearTimeout(t); } if (daysSince !== null && daysSince >= 30) { const t = setTimeout(() => showToast(`Your last backup is ${daysSince} days old. Consider exporting a fresh one.`, "warn"), 2000); return () => clearTimeout(t); } }, []);
  function triggerBackupReminder(reason = "changes") { if (isScenarioMode) return; setShowBackupBanner(true); try { showToast(`Important ${reason} saved. Export a JSON backup or connect autosave.`, "warn"); } catch (_) {} }
  function startTutorial() { setTutorialStep(0); setTutorialActive(true); setView("dashboard"); }
  function endTutorial() { setTutorialActive(false); setTutorialDone(true); }
  function nextTut() { if (tutorialStep >= TUTORIAL_STEPS.length - 1) { endTutorial(); return; } const ns = TUTORIAL_STEPS[tutorialStep + 1]; if (ns.nav) setView(ns.nav); setTutorialStep(s => s + 1); }
  function prevTut() { if (tutorialStep > 0) { const ps = TUTORIAL_STEPS[tutorialStep - 1]; if (ps.nav) setView(ps.nav); setTutorialStep(s => s - 1); } }

  const ASSET_CATALOG = useMemo(() => ([
    { item: "Raw Pump (Under 10 hp)", category: "Intake", expectedLife: 15, estimatedPrice: 4500, type: "Pump", maintInt: 12 },
    { item: "Raw Pump (Over 10 hp)", category: "Intake", expectedLife: 15, estimatedPrice: 7500, type: "Pump", maintInt: 12 },
    { item: "Transfer Pump (Under 10 hp)", category: "Treatment", expectedLife: 15, estimatedPrice: 4500, type: "Pump", maintInt: 12 },
    { item: "Transfer Pump (Over 10 hp)", category: "Treatment", expectedLife: 15, estimatedPrice: 7500, type: "Pump", maintInt: 12 },
    { item: "Gate Valve (Over 6 inches)", category: "Treatment", expectedLife: 10, estimatedPrice: 1800, type: "Valve", maintInt: 60 },
    { item: "Controller", category: "Treatment", expectedLife: 15, estimatedPrice: 2500, type: "Controls", maintInt: 12 },
    { item: "Turbidity Meter", category: "Treatment", expectedLife: 10, estimatedPrice: 6000, type: "Instrumentation", maintInt: 12 },
    { item: "pH Meter", category: "Treatment", expectedLife: 10, estimatedPrice: 6000, type: "Instrumentation", maintInt: 12 },
    { item: "Chlorine analyzer", category: "Treatment", expectedLife: 10, estimatedPrice: 6000, type: "Instrumentation", maintInt: 12 },
    { item: "SCADA", category: "Treatment", expectedLife: 10, estimatedPrice: 36000, type: "Electrical/SCADA", maintInt: 12 },
    { item: "Clearwell", category: "Storage", expectedLife: 50, estimatedPrice: 500000, type: "Tank/Storage", maintInt: 12 },
    { item: "Distribution Pump", category: "Distribution", expectedLife: 25, estimatedPrice: 25000, type: "Pump", maintInt: 12 },
    { item: "Valve", category: "Distribution", expectedLife: 20, estimatedPrice: 5000, type: "Valve", maintInt: 60 },
    { item: "Booster Pump", category: "Distribution", expectedLife: 15, estimatedPrice: 6000, type: "Pump", maintInt: 12 },
    { item: "EST", category: "Storage", expectedLife: 50, estimatedPrice: 4000000, type: "Tank/Storage", maintInt: 60 },
    { item: "Generator (Stationary)", category: "Power/Emergency", expectedLife: 25, estimatedPrice: 45000, type: "Generator", maintInt: 6 },
    { item: "Truck", category: "Machinery", expectedLife: 5, estimatedPrice: 50000, type: "Vehicle", maintInt: 6 },
    { item: "UTV", category: "Machinery", expectedLife: 10, estimatedPrice: 25000, type: "Vehicle", maintInt: 6 },
    { item: "Back hoe", category: "Machinery", expectedLife: 10, estimatedPrice: 90000, type: "Equipment", maintInt: 6 },
    { item: "Generator (Portable)", category: "Power/Emergency", expectedLife: 10, estimatedPrice: 1500, type: "Generator", maintInt: 6 },
    { item: "Water Meter (Residential)", category: "Distribution", expectedLife: 20, estimatedPrice: 350, type: "Meter", maintInt: 60 },
    { item: "Water Meter (Master/Bulk)", category: "Distribution", expectedLife: 15, estimatedPrice: 3500, type: "Meter", maintInt: 12 },
    { item: "Flow Meter", category: "Treatment", expectedLife: 15, estimatedPrice: 2800, type: "Meter", maintInt: 12 },
    { item: "Pressure Reducing Valve (PRV)", category: "Distribution", expectedLife: 20, estimatedPrice: 2500, type: "Valve", maintInt: 12 },
    { item: "Fire Hydrant", category: "Distribution", expectedLife: 50, estimatedPrice: 4500, type: "Hydrant", maintInt: 12 },
    { item: "Air Release Valve", category: "Distribution", expectedLife: 15, estimatedPrice: 800, type: "Valve", maintInt: 12 },
    { item: "Check Valve", category: "Distribution", expectedLife: 20, estimatedPrice: 600, type: "Valve", maintInt: 24 },
    { item: "Chemical Feed Pump", category: "Treatment", expectedLife: 8, estimatedPrice: 1200, type: "Pump", maintInt: 6 },
    { item: "Pressure Tank", category: "Storage", expectedLife: 20, estimatedPrice: 8000, type: "Tank", maintInt: 12 },
    { item: "Well Pump (Submersible)", category: "Wells", expectedLife: 12, estimatedPrice: 6000, type: "Pump", maintInt: 12 },
    { item: "Well Casing", category: "Wells", expectedLife: 50, estimatedPrice: 15000, type: "Structure", maintInt: 60 },
    { item: "Distribution Line (per 1000ft)", category: "Distribution", expectedLife: 50, estimatedPrice: 25000, type: "Pipe", maintInt: 60 },
    { item: "Service Line (per connection)", category: "Distribution", expectedLife: 40, estimatedPrice: 3000, type: "Pipe", maintInt: 60 },
    { item: "Chlorinator", category: "Treatment", expectedLife: 10, estimatedPrice: 3500, type: "Treatment", maintInt: 6 },
    { item: "UV Disinfection System", category: "Treatment", expectedLife: 12, estimatedPrice: 8000, type: "Treatment", maintInt: 6 },
    { item: "Aerator", category: "Treatment", expectedLife: 15, estimatedPrice: 5000, type: "Treatment", maintInt: 12 },
    { item: "Sediment Filter", category: "Treatment", expectedLife: 10, estimatedPrice: 2000, type: "Filter", maintInt: 3 },
    { item: "Ground Storage Tank", category: "Storage", expectedLife: 40, estimatedPrice: 75000, type: "Tank", maintInt: 12 },
    { item: "Elevated Storage Tank", category: "Storage", expectedLife: 50, estimatedPrice: 250000, type: "Tank", maintInt: 12 }
  ]), []);
  const currentYear = new Date().getFullYear();
  function showToast(msg, type="success") { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); }
  useEffect(() => { idCounterRef.current = toInt(idCounter) ?? 1; }, [idCounter]);
  // Clear asset selection when view or filters change; show toast if user had items selected
  const prevSelectedSizeRef = useRef(0);
  useEffect(() => { prevSelectedSizeRef.current = selected.size; }, [selected]);
  useEffect(() => {
    if (prevSelectedSizeRef.current > 0) showToast(`Selection cleared (${prevSelectedSizeRef.current} item${prevSelectedSizeRef.current === 1 ? "" : "s"})`, "warn");
    setSelected(new Set());
  }, [view, filterStatus, filterCat, filterPriority, filterCritical, assetSearch, alertFilter]);
  function genId() { const next = toInt(idCounterRef.current) ?? 1; const id = `AM-${String(next).padStart(4, "0")}`; idCounterRef.current = next + 1; setIdCounter(next + 1); return id; }
  function addHistoryEntry(assetId, assetName, action, changes=null, snapshot=null) { setHistory(prev => [{ id: Date.now(), timestamp: new Date().toISOString(), assetId, assetName, action, changes, snapshot, user: "User" }, ...prev].slice(0, 5000)); }
  // Migration logic — supports v3 (PWS Asset Manager) and earlier legacy versions
  useEffect(() => { const alreadyMigrated = readLS(KEYS.migratedFlag, false); if (alreadyMigrated) return; const v4HasData = Array.isArray(assets) && assets.length > 0; if (v4HasData) { writeLS(KEYS.migratedFlag, true); return; } const v3Assets = readLS(LEGACY.v3Assets, null); if (Array.isArray(v3Assets) && v3Assets.length > 0) { setAssets(v3Assets.map(normalizeAsset)); const v3s = readLS(LEGACY.v3Settings, null); if (v3s) setSettings(prev => ({ ...prev, ...v3s })); const v3svc = readLS(LEGACY.v3Service, null); if (Array.isArray(v3svc)) setServiceLog(v3svc); const v3h = readLS(LEGACY.v3History, null); if (Array.isArray(v3h)) setHistory(v3h); const v3c = readLS(LEGACY.v3Counter, null); if (typeof v3c === "number") setIdCounter(v3c); showToast(`Migrated ${v3Assets.length} assets from PWS Asset Manager v3`, "success"); writeLS(KEYS.migratedFlag, true); return; } const legacyEnhancedAssets = readLS(LEGACY.enhancedAssets, null); const legacyProAssets = readLS(LEGACY.proAssets, null); const legacyAny = (Array.isArray(legacyEnhancedAssets) && legacyEnhancedAssets.length > 0) || (Array.isArray(legacyProAssets) && legacyProAssets.length > 0); if (!legacyAny) { writeLS(KEYS.migratedFlag, true); return; } const mergedAssets = [...(Array.isArray(legacyEnhancedAssets) ? legacyEnhancedAssets : []), ...(Array.isArray(legacyProAssets) ? legacyProAssets : [])].map(normalizeAsset); const byId = new Map(); mergedAssets.forEach(a => { const id = a.id || ""; if (id && !byId.has(id)) byId.set(id, a); }); const finalAssets = Array.from(byId.values()); if (finalAssets.length) { setAssets(finalAssets); showToast(`Migrated ${finalAssets.length} assets from prior versions`, "success"); } const proSettings = readLS(LEGACY.proSettings, null); if (proSettings && typeof proSettings === "object") setSettings(prev => ({ ...prev, ...proSettings })); const proService = readLS(LEGACY.proService, null); if (Array.isArray(proService) && proService.length) setServiceLog(proService); const enhancedHistory = readLS(LEGACY.enhancedHistory, null); if (Array.isArray(enhancedHistory) && enhancedHistory.length) setHistory(enhancedHistory); const enhancedCounter = readLS(LEGACY.enhancedIdCounter, null); if (typeof enhancedCounter === "number") setIdCounter(enhancedCounter); writeLS(KEYS.migratedFlag, true); }, []);
  // Enriched assets with computed fields
  const enriched = useMemo(() => (assets || []).map(a0 => { const a = normalizeAsset(a0); const remaining = calcRemaining(a.installYear, a.usefulLife, a.installDate); const replaceYear = calcReplaceYear(a.installYear, a.usefulLife, a.installDate); const isRetired = a.status === "Retired"; const isPlanning = a.status === "Planning"; const risk = (isRetired || isPlanning) ? null : calcRisk(a.condition, a.installYear, a.usefulLife, a.priority, a.installDate, a.isCritical); const totalCost = (toFloat(a.replacementCost) ?? 0) * (toInt(a.quantity) ?? 1); const deprec = (settings.showDepreciation && !isRetired) ? calcDepreciated(a.replacementCost, a.installYear, a.usefulLife, a.installDate, settings.depreciationMethod) : null; const maint = isRetired ? null : maintStatus(a.lastMaint, a.maintInt); const warranty = (settings.showWarranty && !isRetired) ? warrantyStatus(a.warrantyExp) : null; const installDisplay = formatInstallDate(a); return { ...a, remaining, replaceYear, risk, totalCost, deprec, maint, warranty, installDisplay }; }), [assets, settings.showDepreciation, settings.showWarranty, settings.depreciationMethod]);
  const filtered = useMemo(() => { const s = assetSearch.trim().toLowerCase(); let result = enriched.filter(a => filterStatus === "All" || (a.status || "Active") === filterStatus).filter(a => filterCat === "All" || (a.category || "Other") === filterCat).filter(a => filterPriority === "All" || (a.priority || "Medium") === filterPriority).filter(a => !filterCritical || a.isCritical).filter(a => !s || (a.assetName || "").toLowerCase().includes(s) || (a.location || "").toLowerCase().includes(s) || (a.id || "").toLowerCase().includes(s)); if (alertFilter === "maint-overdue") result = result.filter(a => a.maint && a.maint.status === "overdue"); else if (alertFilter === "maint-due") result = result.filter(a => a.maint && a.maint.status === "due" && a.maint.status !== "overdue"); else if (alertFilter === "past-life") result = result.filter(a => a.remaining === 0 && a.replaceYear && a.replaceYear <= currentYear); else if (alertFilter === "replace-5yr") result = result.filter(a => a.replaceYear && a.replaceYear <= currentYear + 5); else if (alertFilter === "no-maint") result = result.filter(a => !a.maintInt && a.status !== "Retired"); else if (alertFilter === "no-service") result = result.filter(a => !(serviceLog || []).some(e => e.assetId === a.id) && a.status !== "Retired"); else if (alertFilter === "warranty-exp") result = result.filter(a => a.warranty && a.warranty.status === "expiring"); return result; }, [enriched, assetSearch, filterStatus, filterCat, filterPriority, filterCritical, alertFilter, currentYear, serviceLog]);
  const sorted = useMemo(() => { const dir = sortDir === "asc" ? 1 : -1; const safe = (v) => (v == null || v === "" ? -Infinity : v); const getVal = (a, field) => { if (field === "installYear") return getInstallYear(a.installYear, a.installDate) ?? -Infinity; return a[field]; }; return filtered.slice().sort((a,b) => { const av = safe(getVal(a, sortBy)); const bv = safe(getVal(b, sortBy)); if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir; return (av - bv) * dir; }); }, [filtered, sortBy, sortDir]);
  const activeAssets = useMemo(() => enriched.filter(a => a.status !== "Retired"), [enriched]);
  const stats = useMemo(() => { const items = activeAssets; const totalQty = items.reduce((sum, a) => sum + (toInt(a.quantity) ?? 1), 0); const value = items.reduce((sum, a) => sum + (a.totalCost || 0), 0); const deprec = items.reduce((sum, a) => sum + (a.deprec || 0), 0); const withCond = items.filter(a => a.condition != null); const avgCond = withCond.length ? (withCond.reduce((sum, a) => sum + (toInt(a.condition) ?? 3), 0) / withCond.length) : 0; const highRisk = items.filter(a => (a.risk ?? 0) >= 60).length; const replace5 = items.filter(a => a.replaceYear && a.replaceYear <= currentYear + 5).length; const pastLife = items.filter(a => a.remaining === 0 && a.replaceYear && a.replaceYear <= currentYear).length; const maintDue = items.filter(a => a.maint && (a.maint.status === "overdue" || a.maint.status === "due")).length; const maintOverdue = items.filter(a => a.maint && a.maint.status === "overdue").length; const warrantyExp = items.filter(a => a.warranty && a.warranty.status === "expiring").length; const retiredCount = enriched.filter(a => a.status === "Retired").length; const planningCount = enriched.filter(a => a.status === "Planning").length; const totalAll = enriched.length; return { totalQty, value, deprec, avgCond, highRisk, replace5, pastLife, maintDue, maintOverdue, warrantyExp, retiredCount, planningCount, totalAll }; }, [activeAssets, enriched, currentYear]);


  const selectedAssets = useMemo(() => sorted.filter(a => selected.has(a.id)), [sorted, selected]);
  const duplicateGroups = useMemo(() => detectDuplicateAssetGroups(enriched), [enriched]);
  const forecastDataWarnings = useMemo(() => {
    const items = activeAssets || [];
    const missingInstall = items.filter(a => !getInstallYear(a.installYear, a.installDate)).length;
    const missingLife = items.filter(a => !(toInt(a.usefulLife) > 0)).length;
    const missingCost = items.filter(a => !(toFloat(a.replacementCost) > 0)).length;
    return { missingInstall, missingLife, missingCost, totalIssues: missingInstall + missingLife + missingCost };
  }, [activeAssets]);
  const dataHealth = useMemo(() => {
    const items = activeAssets || [];
    const noMaintSchedule = items.filter(a => !a.maintInt).length;
    const noServiceHistory = items.filter(a => !(serviceLog || []).some(e => e.assetId === a.id)).length;
    const invalidCoordinates = items.filter(a => {
      const hasLat = a.latitude !== "" && a.latitude != null;
      const hasLon = a.longitude !== "" && a.longitude != null;
      if (!hasLat && !hasLon) return false;
      const lat = hasLat ? toFloat(a.latitude) : null;
      const lon = hasLon ? toFloat(a.longitude) : null;
      return lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180;
    }).length;
    return { noMaintSchedule, noServiceHistory, invalidCoordinates, duplicateGroups: duplicateGroups.length };
  }, [activeAssets, serviceLog, duplicateGroups]);
  const startHereMode = !assets.length || assets.length < 3;
  const planningViewHelp = useMemo(() => ({
    Standard: "Uses your current inflation, reserve, and contribution settings as your default planning view.",
    Conservative: "Pushes projected need upward so you can see a more cautious funding picture.",
    Aggressive: "Slightly softens projected costs when testing a more favorable funding outlook."
  }), []);

  // 5-Year Forecast (rolling CIP) for PWS Asset Plan
  const forecastOptions = useMemo(() => ({ inflationRate: settings.inflationRate, annualContribution: settings.annualContribution, annualGrantFunding: settings.annualGrantFunding, reserveInterestRate: settings.reserveInterestRate, startingReserve: settings.reserveBalance, annualBudget: settings.annualBudget, scenarioMode: settings.scenarioMode, serviceLog, financial, settings }), [settings, serviceLog, financial]);
  const fiveYearCIP = useMemo(() => buildFiveYearCIP(activeAssets, settings.inflationRate, forecastStartYear, forecastHorizon, forecastOptions), [activeAssets, settings.inflationRate, forecastStartYear, forecastHorizon, forecastOptions]);
  const fiveYearNeed = useMemo(() => fiveYearCIP.reduce((s, y) => s + (y.totalCost || 0), 0), [fiveYearCIP]);
  const fiveYearCapitalNeed = useMemo(() => fiveYearCIP.reduce((s, y) => s + (y.capitalNeed || 0), 0), [fiveYearCIP]);
  const fiveYearOperatingNeed = useMemo(() => fiveYearCIP.reduce((s, y) => s + (y.operatingNeed || 0), 0), [fiveYearCIP]);
  const fiveYearLaborNeed = useMemo(() => fiveYearCIP.reduce((s, y) => s + (y.laborNeed || 0), 0), [fiveYearCIP]);
  const fiveYearMaintenanceNeed = useMemo(() => fiveYearCIP.reduce((s, y) => s + (y.maintenanceNeed || 0), 0), [fiveYearCIP]);
  const fiveYearOverheadNeed = useMemo(() => fiveYearCIP.reduce((s, y) => s + (y.overheadNeed || 0), 0), [fiveYearCIP]);
  const fiveYearFunding = useMemo(() => projectFunding(fiveYearCIP), [fiveYearCIP]);
  const fiveYearFunded = useMemo(() => fiveYearFunding.reduce((s, y) => s + (y.funded || 0), 0), [fiveYearFunding]);
  const fiveYearGap = useMemo(() => fiveYearFunding.reduce((s, y) => s + (y.shortfall || 0), 0), [fiveYearFunding]);
  const fiveYearEndingReserve = useMemo(() => (fiveYearFunding.length ? (fiveYearFunding[fiveYearFunding.length - 1].endingReserve || 0) : (toFloat(settings.reserveBalance) ?? 0)), [fiveYearFunding, settings.reserveBalance]);
  const fiveYearTopRisks = useMemo(() => fiveYearCIP.flatMap(y => (y.assets || []).map(a => ({ ...a, year: y.year }))).sort((a, b) => ((b.risk ?? 0) - (a.risk ?? 0)) || ((b.inflatedCost ?? 0) - (a.inflatedCost ?? 0))).slice(0, 15), [fiveYearCIP]);
  function toggleSelectAll(checked) { if (checked) setSelected(new Set(sorted.map(a => a.id))); else setSelected(new Set()); }
  function toggleSelected(id, checked) { setSelected(prev => { const next = new Set(prev); if (checked) next.add(id); else next.delete(id); return next; }); }
  function openAddAsset() { setEditAsset(null); setAssetModalOpen(true); }
  function navigateToAlert(filterName, sf = "risk", sd = "desc") { setAlertFilter(filterName); setSortBy(sf); setSortDir(sd); setView("assets"); }
  function openHelp(tab) { setHelpTab(tab || "quickstart"); setHelpOpen(true); }
  function openEditAsset(asset) { setEditAsset(asset); setAssetModalOpen(true); }
  function openEditWorkOrder(record) {
    setWorkOrderModalOpen(true);
  }
  function setWorkOrderStatus(id, status) {
    showToast(`Work order marked ${status}`);
  }
  function openDetailAsset(asset) { const found = enriched.find(a => a.id === asset.id); setDetailAsset(found || asset); }
  function stripInternalFields(obj) { const clean = {}; Object.keys(obj).forEach(k => { if (!k.startsWith("_")) clean[k] = obj[k]; }); return clean; }
  function saveAsset(assetData) { const cleaned = stripInternalFields(assetData); if (cleaned.id) { const prev = assets.find(a => a.id === cleaned.id); setAssets(prevArr => prevArr.map(a => a.id === cleaned.id ? { ...a, ...cleaned, updatedAt: new Date().toISOString() } : a)); addHistoryEntry(cleaned.id, cleaned.assetName, "updated", getChanges(prev, cleaned), { before: prev, after: cleaned }); showToast("Asset updated"); triggerBackupReminder("asset edits"); } else { const newAsset = { ...cleaned, id: genId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; setAssets(prevArr => [...prevArr, newAsset]); addHistoryEntry(newAsset.id, newAsset.assetName, "created", null, { after: newAsset }); showToast("Asset added"); triggerBackupReminder("asset changes"); } setAssetModalOpen(false); setEditAsset(null); }
  function duplicateAsset(asset) {
    const countStr = prompt("How many copies?", "1");
    if (countStr === null) return;
    const count = Math.max(1, Math.min(500, toInt(countStr) ?? 1));
    const dupes = [];
    for (let i = 0; i < count; i++) {
      const suffix = count > 1 ? ` - ${String(i + 1).padStart(2, "0")}` : " (Copy)";
      const dupe = { ...asset, id: genId(), assetName: `${asset.assetName}${suffix}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      dupes.push(dupe);
    }
    setAssets(prevArr => [...prevArr, ...dupes]);
    dupes.forEach(d => addHistoryEntry(d.id, d.assetName, "created", { duplicatedFrom: { from: asset.id, to: d.id } }, { after: d }));
    showToast(count === 1 ? "Asset duplicated" : `${count} copies created`);
  }
  function markMaintComplete(asset) { const today = isoDate(); const updated = { ...asset, lastMaint: today, updatedAt: new Date().toISOString() }; setAssets(prevArr => prevArr.map(a => a.id === asset.id ? updated : a)); addHistoryEntry(asset.id, asset.assetName, "maintenance", { lastMaint: { from: asset.lastMaint, to: today } }, { after: updated }); setServiceLog(prevArr => [{ id: Date.now(), assetId: asset.id, assetName: asset.assetName, date: today, type: "Scheduled Maintenance", vendor: "", cost: null, hours: null, notes: "Maintenance marked complete", createdAt: new Date().toISOString() }, ...prevArr]); showToast("Maintenance updated + logged"); }
  function askDeleteAssets(ids) { if (!ids.length) return; setConfirm({ open: true, title: ids.length === 1 ? "Delete asset?" : `Delete ${ids.length} assets?`, body: "This removes assets from the register. History will keep a record.", danger: true, confirmText: "Delete", onConfirm: () => deleteAssets(ids), onCancel: () => setConfirm({ open: false }) }); }
  function deleteAssets(ids) { const idSet = new Set(ids); const deleted = assets.filter(a => idSet.has(a.id)); deleted.forEach(a => addHistoryEntry(a.id, a.assetName, "deleted", null, { before: a })); setAssets(prevArr => prevArr.filter(a => !idSet.has(a.id))); setSelected(new Set()); showToast(ids.length === 1 ? "Asset deleted" : `${ids.length} assets deleted`, "warn"); setConfirm({ open: false }); }
  function restoreFromHistory(historyEntry) {
    const snap = historyEntry?.snapshot;
    const assetData = snap?.before || snap?.after;
    if (!assetData || !assetData.assetName) { showToast("No restorable snapshot found in this entry", "warn"); return; }
    const existing = assets.find(a => a.id === assetData.id);
    if (existing) {
      setAssets(prev => prev.map(a => a.id === assetData.id ? { ...normalizeAsset(assetData), updatedAt: new Date().toISOString() } : a));
      addHistoryEntry(assetData.id, assetData.assetName, "updated", { restoredFrom: { from: "history", to: formatDateTime(historyEntry.timestamp) } }, { before: existing, after: assetData });
      showToast(`Restored ${assetData.assetName} (overwritten current)`);
    } else {
      const restored = { ...normalizeAsset(assetData), updatedAt: new Date().toISOString() };
      setAssets(prev => [...prev, restored]);
      addHistoryEntry(restored.id, restored.assetName, "created", { restoredFrom: { from: "history", to: formatDateTime(historyEntry.timestamp) } }, { after: restored });
      showToast(`Restored ${assetData.assetName}`);
    }
  }
  function handleBulkEditSave(updates) { const ids = Array.from(selected); const historyEntries = []; setAssets(prevArr => prevArr.map(a => { if (!ids.includes(a.id)) return a; const updated = { ...a, ...updates, updatedAt: new Date().toISOString() }; const changes = getChanges(a, updated); if (changes) historyEntries.push({ id: Date.now() + Math.random(), timestamp: new Date().toISOString(), assetId: a.id, assetName: a.assetName, action: "updated", changes, snapshot: { before: a, after: updated }, user: "User" }); return updated; })); if (historyEntries.length) setHistory(prev => [...historyEntries, ...prev].slice(0, 5000)); showToast(`Updated ${ids.length} asset${ids.length === 1 ? '' : 's'}`); setBulkEditModalOpen(false); setSelected(new Set()); }
  // Batch service log for multiple selected assets
  function handleBatchServiceSave(serviceData) {
    const targetAssets = selectedAssets;
    if (!targetAssets.length) return;
    const newEntries = targetAssets.map(a => ({
      id: Date.now() + Math.random(),
      assetId: a.id,
      assetName: a.assetName,
      date: serviceData.date || isoDate(),
      type: serviceData.type || "Scheduled Maintenance",
      vendor: serviceData.vendor || "",
      cost: toFloat(serviceData.cost) ?? null,
      hours: toFloat(serviceData.hours) ?? null,
      notes: serviceData.notes || "",
      createdAt: new Date().toISOString()
    }));
    setServiceLog(prev => [...newEntries, ...prev]);
    newEntries.forEach(e => addHistoryEntry(e.assetId, e.assetName, "maintenance", { serviceDate: { from: null, to: e.date }, serviceType: { from: null, to: e.type } }, { after: e }));
    if (serviceData.updateLastMaint) {
      setAssets(prevArr => prevArr.map(a => {
        if (!targetAssets.some(t => t.id === a.id)) return a;
        return { ...a, lastMaint: serviceData.date || isoDate(), updatedAt: new Date().toISOString() };
      }));
    }
    showToast(`Logged ${newEntries.length} service entries`);
    setBatchServiceOpen(false);
    setSelected(new Set());
  }
  // PDF export
  function exportPDF() {
    
    // Render charts off-screen, capture as images, then build PDF
    function renderChartToImage(chartConfig, width, height) {
      return new Promise((resolve) => {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.style.cssText = "position:fixed;top:-9999px;left:-9999px;";
        document.body.appendChild(canvas);
        const chart = new Chart(canvas, chartConfig);
        chart.update('none');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            try { resolve(canvas.toDataURL("image/png", 0.92)); } catch { resolve(null); }
            chart.destroy();
            document.body.removeChild(canvas);
          });
        });
      });
    }
    async function buildPDF() {
      // Prepare chart configs
      const catLabels = CATEGORIES.filter(cat => activeAssets.filter(a => (a.category || "Other") === cat).length > 0);
      const catValues = catLabels.map(cat => activeAssets.filter(a => (a.category || "Other") === cat).reduce((s, a) => s + (a.totalCost || 0), 0));
      const chartColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316'];
      const doughnutConfig = { type: "doughnut", data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: chartColors.slice(0, catLabels.length), borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: false, animation: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } }, tooltip: { enabled: false } } } };
      const fundingLabels = (fiveYearFunding || []).map(r => r.year);
      const fundingConfig = { type: "bar", data: { labels: fundingLabels, datasets: [
        { label: "Funded", data: fiveYearFunding.map(r => r.funded), stack: "cap", backgroundColor: "rgba(30, 61, 59, 0.75)" },
        { label: "Unfunded", data: fiveYearFunding.map(r => r.shortfall), stack: "cap", backgroundColor: "rgba(239, 55, 62, 0.75)" },
        { label: "Reserve", data: fiveYearFunding.map(r => r.endingReserve), type: "line", yAxisID: "y1", tension: 0.25, pointRadius: 2, borderColor: "#7BC8E5" }
      ] }, options: { responsive: false, animation: false, plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true, ticks: { callback: v => currencyFormatter.format(v) } }, y1: { beginAtZero: true, position: "right", grid: { drawOnChartArea: false }, ticks: { callback: v => currencyFormatter.format(v) } } } } };
      // Render both charts
      const [doughnutImg, fundingImg] = await Promise.all([
        catLabels.length >= 2 ? renderChartToImage(doughnutConfig, 520, 280) : null,
        fiveYearFunding.length >= 1 ? renderChartToImage(fundingConfig, 520, 280) : null
      ]);
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      doc.setFont("helvetica", "normal");
      if (doc.setCharSpace) doc.setCharSpace(0);
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;
      const cw = pageW - margin * 2;
      let y = margin;
      // Header bar
      doc.setFillColor(30, 61, 59);
      doc.rect(0, 0, pageW, 60, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text(settings.orgName || "Water System", margin, 28);
      doc.setFontSize(10);
      doc.text(`${APP_NAME} v${APP_VERSION} | Asset Management Report`, margin, 44);
      if (settings.pwsId) doc.text(`PWS ID: ${settings.pwsId}`, pageW - margin, 28, { align: "right" });
      doc.text(`Generated ${new Date().toLocaleDateString()}`, pageW - margin, 44, { align: "right" });
      doc.setFillColor(118, 185, 0);
      doc.rect(0, 60, pageW, 4, "F");
      y = 84;
      // KPIs
      doc.setTextColor(30, 61, 59); doc.setFontSize(14);
      doc.text("System Summary", margin, y); y += 18;
      doc.setFontSize(9); doc.setTextColor(80, 80, 80);
      const kpis = [
        ["Active Assets", numberFormatter.format(stats.totalQty), "Replacement Value", currencyFormatter.format(stats.value)],
        ["Avg Condition", `${stats.avgCond.toFixed(1)} / 5`, "High Risk (>=60)", String(stats.highRisk)],
        ["Maint Overdue", String(stats.maintOverdue), "Replace <=5 yrs", String(stats.replace5)],
        ["Past Useful Life", String(stats.pastLife), "Retired", String(stats.retiredCount)]
      ];
      kpis.forEach(row => {
        doc.setFont(undefined, "bold"); doc.text(row[0] + ":", margin, y);
        doc.setFont(undefined, "normal"); doc.text(row[1], margin + 100, y);
        doc.setFont(undefined, "bold"); doc.text(row[2] + ":", margin + cw / 2, y);
        doc.setFont(undefined, "normal"); doc.text(row[3], margin + cw / 2 + 110, y);
        y += 14;
      });
      if (settings.showDepreciation) {
        doc.setFont(undefined, "bold"); doc.text("Estimated Depreciated Value:", margin, y);
        doc.setFont(undefined, "normal"); doc.text(currencyFormatter.format(stats.deprec), margin + 100, y);
        const ml = (DEPRECIATION_METHODS.find(m => m.value === settings.depreciationMethod) || {}).label || "Straight-Line";
        doc.setFont(undefined, "bold"); doc.text("Method:", margin + cw / 2, y);
        doc.setFont(undefined, "normal"); doc.text(ml, margin + cw / 2 + 110, y);
        y += 14;
      }
      y += 16;
      // Financial Assumptions
      doc.setFillColor(245, 245, 245); doc.rect(margin - 4, y - 4, cw + 8, 56, "F");
      doc.setTextColor(30, 61, 59); doc.setFontSize(11); doc.setFont(undefined, "bold");
      doc.text("Financial Assumptions", margin, y + 10); y += 22;
      doc.setFontSize(8); doc.setTextColor(80, 80, 80);
      const assumptions = `Inflation: ${settings.inflationRate}% | Budget: ${currencyFormatter.format(toFloat(settings.annualBudget) ?? 0)} | Reserve: ${currencyFormatter.format(toFloat(settings.reserveBalance) ?? 0)} | Contribution: ${currencyFormatter.format(toFloat(settings.annualContribution) ?? 0)} | Grants: ${currencyFormatter.format(toFloat(settings.annualGrantFunding) ?? 0)} | Scenario: ${settings.scenarioMode || "Standard"}`;
      const assumptionLines = doc.splitTextToSize(assumptions, cw - 16);
      doc.setFont(undefined, "normal"); doc.text(assumptionLines, margin, y + 6);
      y += Math.max(56, 18 + (assumptionLines.length * 10));
      // Charts section
      if (doughnutImg || fundingImg) {
        if (y > pageH - 260) { doc.addPage(); y = margin; }
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
        doc.line(margin, y - 12, margin + cw, y - 12);
        y += 4;
        doc.setTextColor(30, 61, 59); doc.setFontSize(13); doc.setFont(undefined, "bold");
        doc.text("Visual Summaries", margin, y); y += 22;
        const chartW = cw / 2 - 16;
        const chartH = Math.round(chartW * 280 / 520);
        if (doughnutImg) {
          try { doc.addImage(doughnutImg, "PNG", margin, y, chartW, chartH); } catch(e) {}
        }
        if (fundingImg) {
          try { doc.addImage(fundingImg, "PNG", margin + chartW + 32, y, chartW, chartH); } catch(e) {}
        }
        y += chartH + 16;
        doc.setFontSize(7); doc.setTextColor(120, 120, 120); doc.setFont(undefined, "italic");
        if (doughnutImg) doc.text("Replacement Value by Category", margin, y);
        if (fundingImg) doc.text("Funding vs. Need", margin + chartW + 32, y);
        y += 30;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y - 10, margin + cw, y - 10);
      }
      // Top risk assets table
      if (y > pageH - 160) { doc.addPage(); y = margin; } else { y += 18; }
      doc.setTextColor(30, 61, 59); doc.setFontSize(14); doc.setFont(undefined, "bold");
      doc.text("Top Risk Assets", margin, y); y += 10;
      const topRisks = enriched.slice().sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1)).filter(a => a.status !== "Retired").slice(0, 15);
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [["ID", "Asset", "Category", "Location", "Risk", "Condition", "Replace Yr", "Value"]],
        body: topRisks.map(a => [a.id, a.assetName, a.category || "", a.location || "", a.risk ?? "N/A", `${a.condition}/5`, a.replaceYear || "N/A", currencyFormatter.format(a.totalCost || 0)]),
        styles: { fontSize: 7, cellPadding: 3, font: "helvetica" },
        headStyles: { fillColor: [30, 61, 59], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });
      y = doc.lastAutoTable.finalY + 32;
      // Category breakdown
      if (y > pageH - 120) { doc.addPage(); y = margin; }
      doc.setTextColor(30, 61, 59); doc.setFontSize(14); doc.setFont(undefined, "bold");
      doc.text("Category Breakdown", margin, y); y += 10;
      const catRows = CATEGORIES.map(cat => { const items = activeAssets.filter(a => (a.category || "Other") === cat); const value = items.reduce((s, a) => s + (a.totalCost || 0), 0); return [cat, String(items.length), currencyFormatter.format(value)]; }).filter(r => r[1] !== "0");
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [["Category", "Count", "Replacement Value"]], body: catRows,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [30, 61, 59], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });
      y = doc.lastAutoTable.finalY + 30;
      // Forecast summary
      if (y > pageH - 100) { doc.addPage(); y = margin; }
      doc.setTextColor(30, 61, 59); doc.setFontSize(14); doc.setFont(undefined, "bold");
      doc.text(`${forecastHorizon}-Year Capital + Operating Forecast Summary`, margin, y); y += 10;
      doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [["Year", "Total Need", "Funded", "Shortfall", "Reserve Balance"]],
        body: fiveYearCIP.map(r => [String(r.year), currencyFormatter.format(r.totalCost || 0), currencyFormatter.format(r.funded || 0), currencyFormatter.format(r.shortfall || 0), currencyFormatter.format(r.endingReserve || 0)]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [30, 61, 59], textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });
      // Footer on each page
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(118, 185, 0);
        doc.rect(0, pageH - 20, pageW, 2, "F");
        doc.setFontSize(7); doc.setTextColor(150, 150, 150);
        doc.text(`${settings.orgName || ""} | ${APP_NAME} v${APP_VERSION} | ${settings.pwsId || ""} | Page ${i} of ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
      }
      doc.save(`OkaVlhpisa_Report_${settings.pwsId ? settings.pwsId + "_" : ""}${isoDate()}.pdf`);
      showToast("PDF report exported (with charts)");
    }
    buildPDF();
  }
  // Service log
  const serviceFiltered = useMemo(() => { const s = serviceSearch.trim().toLowerCase(); const filtered = (serviceLog || []).filter(e => !s || (e.assetName || "").toLowerCase().includes(s) || (e.notes || "").toLowerCase().includes(s) || (e.vendor || "").toLowerCase().includes(s)); const dir = serviceSortDir === "asc" ? 1 : -1; return filtered.slice().sort((a, b) => { const av = a[serviceSortBy] ?? ""; const bv = b[serviceSortBy] ?? ""; if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * dir; return (av - bv) * dir; }); }, [serviceLog, serviceSearch, serviceSortBy, serviceSortDir]);
  function saveServiceEntry(entry) {
    const cleanedEntry = normalizeServiceEntry({ ...entry, cost: toFloat(entry.cost), hours: toFloat(entry.hours) });
    const previous = (serviceLog || []).find(e => e.id === cleanedEntry.id);
    setServiceLog(prev => {
      const exists = prev.some(e => e.id === cleanedEntry.id);
      if (exists) return prev.map(e => e.id === cleanedEntry.id ? cleanedEntry : e);
      return [cleanedEntry, ...prev];
    });
    if (previous) addHistoryEntry(cleanedEntry.assetId, cleanedEntry.assetName, "maintenance", getChanges(previous, cleanedEntry), { before: previous, after: cleanedEntry });
    else addHistoryEntry(cleanedEntry.assetId, cleanedEntry.assetName, "maintenance", { serviceDate: { from: null, to: cleanedEntry.date }, serviceType: { from: null, to: cleanedEntry.type }, cost: { from: null, to: cleanedEntry.cost }, hours: { from: null, to: cleanedEntry.hours } }, { after: cleanedEntry });
    showToast("Service log saved"); triggerBackupReminder("service updates");
    setServiceModalOpen(false);
    setEditService(null);
  }
  function deleteServiceEntry(id) {
    setConfirm({ open: true, title: "Delete service entry?", body: "This removes the service log record permanently.", danger: true, confirmText: "Delete", onConfirm: () => {
      const removed = (serviceLog || []).find(e => e.id === id);
      setServiceLog(prev => prev.filter(e => e.id !== id));
      if (removed) addHistoryEntry(removed.assetId, removed.assetName, "maintenance", { serviceDeleted: { from: removed.type || "Entry", to: null }, serviceDate: { from: removed.date || null, to: null } }, { before: removed });
      showToast("Service log entry deleted", "warn");
      setConfirm({ open: false });
    }, onCancel: () => setConfirm({ open: false }) });
  }
  // Projection
  const projectionRows = useMemo(() => buildForecastModel(activeAssets, { ...forecastOptions, startYear: forecastStartYear, horizonYears: forecastHorizon }), [activeAssets, forecastOptions, forecastStartYear, forecastHorizon]);
  const projectionStats = useMemo(() => { const totalProjectedCost = projectionRows.reduce((s, r) => s + (r.totalCost || 0), 0); const avgAnnualCost = projectionRows.length ? totalProjectedCost / projectionRows.length : 0; let peak = { year: forecastStartYear, cost: 0 }; let peakGap = 0; let overdueNeed = 0; projectionRows.forEach(r => { if ((r.totalCost || 0) > peak.cost) peak = { year: r.year, cost: r.totalCost || 0 }; peakGap += r.shortfall || 0; overdueNeed += r.overdueNeed || 0; }); return { totalProjectedCost, avgAnnualCost, peakYear: peak.year, peakCost: peak.cost, peakGap, overdueNeed }; }, [projectionRows, forecastStartYear]);
  // Import/Export functions - FEATURE 2: includes imageUrl and docUrl
  function exportExcel(assetSource) { const sourceAssets = (Array.isArray(assetSource) ? assetSource : null) || enriched; const isFiltered = Array.isArray(assetSource); const assetRows = sourceAssets.map(a => ({ ID: a.id, Name: a.assetName, Category: a.category, Type: a.type || "", Status: a.status || "Active", Priority: a.priority || "Medium", Qty: a.quantity ?? 1, Location: a.location || "", InstallDate: a.installDate || "", InstallYear: a.installYear || (a.installDate ? "" : ""), UsefulLife: a.usefulLife || "", RemainingLife: a.remaining ?? "", ReplaceYear: a.replaceYear || "", Condition: a.condition, UnitCost: a.replacementCost || "", TotalCost: a.totalCost || "", DeprecValue: a.deprec || "", RiskScore: a.risk ?? "", Manufacturer: a.manufacturer || "", Model: a.model || "", SerialNum: a.serialNum || "", LastMaint: a.lastMaint || "", MaintIntervalMonths: a.maintInt || "", WarrantyExp: a.warrantyExp || "", ImageUrl: a.imageUrl || "", DocUrl: a.docUrl || "", IsCritical: a.isCritical ? "Yes" : "", Latitude: a.latitude || "", Longitude: a.longitude || "", Notes: a.notes || "" })); const serviceRows = (serviceLog || []).map(e => ({ ID: e.id, AssetID: e.assetId, AssetName: e.assetName, Date: e.date, Type: e.type, Vendor: e.vendor || "", Cost: e.cost ?? "", Hours: e.hours ?? "", LaborRoleID: e.serviceCost?.laborRoleId || "", LaborHours: e.serviceCost?.laborHours ?? e.hours ?? "", LaborRate: e.serviceCost?.laborRate ?? "", MaterialsCost: e.serviceCost?.materialsCost ?? "", ContractorCost: e.serviceCost?.contractorCost ?? "", OverheadAmount: e.serviceCost?.overheadAmount ?? "", Notes: e.notes || "" })); const historyRows = (history || []).slice(0, 2000).map(h => ({ ID: h.id, Timestamp: h.timestamp, AssetID: h.assetId, AssetName: h.assetName, Action: h.action, Changes: h.changes ? JSON.stringify(h.changes) : "", User: h.user || "" })); const settingsRows = Object.entries(settings || {}).map(([k, v]) => ({ Setting: k, Value: typeof v === "object" ? JSON.stringify(v) : v })); const projectionSheet = projectionRows.map(r => ({ Year: r.year, ReplacementCost: r.totalCost, ScheduledNeed: r.scheduledNeed, OverdueNeed: r.overdueNeed, DeferredIn: r.deferredIn, Funded: r.funded, Shortfall: r.shortfall, ReserveBalance: r.endingReserve, BudgetStatus: r.budgetStatus })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assetRows), isFiltered ? "Filtered Assets" : "Assets"); if (!isFiltered) { XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(serviceRows), "ServiceLog"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projectionSheet), "Projection"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsRows), "Settings"); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(historyRows), "History"); } XLSX.writeFile(wb, `OkaVlhpisa_${isFiltered ? "Filtered_" : ""}${settings.pwsId ? settings.pwsId + "_" : ""}${isoDate()}_v${APP_VERSION}.xlsx`); showToast(isFiltered ? `Exported ${sourceAssets.length} filtered assets` : "Exported Excel"); }
  function exportFilteredExcel() { exportExcel(sorted); }
  function exportBackupJSON() { const payload = { app: "Oka Vlhpisa", version: APP_VERSION, exportedAt: new Date().toISOString(), data: { assets, settings, serviceLog, history, workOrders, idCounter, prefs } }; downloadBlob(`OkaVlhpisa_Backup_${isoDate()}_v${APP_VERSION}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); setPrefs(prev => ({ ...prev, lastBackup: new Date().toISOString() })); showToast("Backup exported"); }
  function downloadTemplate() { const template = [{ ID: "", Name: "", Category: "", Type: "", Status: "Active", Priority: "Medium", Qty: 1, Location: "", InstallDate: "", InstallYear: "", UsefulLife: "", Condition: 3, UnitCost: "", Manufacturer: "", Model: "", SerialNum: "", LastMaint: "", MaintIntervalMonths: "", WarrantyExp: "", ImageUrl: "", DocUrl: "", IsCritical: "", Latitude: "", Longitude: "", Notes: "" }]; const instructions = [
    { Field: "ID", Format: "Text", Example: "AM-0001", Notes: "Optional. Auto-generated if blank. Must be unique." },
    { Field: "Name", Format: "Text", Example: "High Service Pump #1", Notes: "REQUIRED. The name of the asset." },
    { Field: "Category", Format: "Text (exact match)", Example: "Treatment", Notes: "Valid: " + CATEGORIES.join(", ") },
    { Field: "Type", Format: "Text", Example: "Pump", Notes: "Freeform sub-category (e.g., Pump, Valve, Meter, Tank, Pipe)" },
    { Field: "Status", Format: "Text (exact match)", Example: "Active", Notes: "Valid: " + STATUSES.join(", ") },
    { Field: "Priority", Format: "Text (exact match)", Example: "High", Notes: "Valid: " + PRIORITIES.join(", ") },
    { Field: "Qty", Format: "Number", Example: "1", Notes: "Defaults to 1. Use for identical units (e.g., 50 meters)." },
    { Field: "Location", Format: "Text", Example: "Plant A - Pump House", Notes: "Where the asset is physically located." },
    { Field: "InstallDate", Format: "Date (YYYY-MM-DD)", Example: "2018-06-15", Notes: "Full date preferred. Year-only is also accepted in InstallYear." },
    { Field: "InstallYear", Format: "Number (4-digit year)", Example: "2018", Notes: "Used if InstallDate is blank." },
    { Field: "UsefulLife", Format: "Number (years)", Example: "15", Notes: "Expected lifespan. Drives replacement year forecast." },
    { Field: "Condition", Format: "Number 1-5", Example: "4", Notes: "1=Critical, 2=Poor, 3=Fair, 4=Good, 5=Excellent. Do NOT use words." },
    { Field: "UnitCost", Format: "Number (dollars)", Example: "45000", Notes: "Replacement cost per unit. No $ sign or commas." },
    { Field: "Manufacturer", Format: "Text", Example: "Grundfos", Notes: "Optional." },
    { Field: "Model", Format: "Text", Example: "CR 32-2", Notes: "Optional." },
    { Field: "SerialNum", Format: "Text", Example: "SN-2024-8831", Notes: "Optional. Used for smart merge matching." },
    { Field: "LastMaint", Format: "Date (YYYY-MM-DD)", Example: "2025-11-01", Notes: "Date of last maintenance. Drives calendar scheduling." },
    { Field: "MaintIntervalMonths", Format: "Number (months)", Example: "12", Notes: "How often maintenance is due, in months." },
    { Field: "WarrantyExp", Format: "Date (YYYY-MM-DD)", Example: "2027-06-15", Notes: "Warranty expiration date." },
    { Field: "IsCritical", Format: "Yes or blank", Example: "Yes", Notes: "Mark 'Yes' for AWIA critical assets. Leave blank otherwise." },
    { Field: "Latitude", Format: "Number (-90 to 90)", Example: "34.0012", Notes: "Optional GPS coordinate." },
    { Field: "Longitude", Format: "Number (-180 to 180)", Example: "-96.3985", Notes: "Optional GPS coordinate." },
    { Field: "Notes", Format: "Text", Example: "Replaced impeller 2024", Notes: "Any additional info." }
  ]; const wb = XLSX.utils.book_new(); const ws1 = XLSX.utils.json_to_sheet(template); ws1["!cols"] = Object.keys(template[0]).map(() => ({wch: 18})); XLSX.utils.book_append_sheet(wb, ws1, "Assets"); const ws2 = XLSX.utils.json_to_sheet(instructions); ws2["!cols"] = [{wch:22},{wch:24},{wch:26},{wch:60}]; XLSX.utils.book_append_sheet(wb, ws2, "Instructions & Valid Values"); XLSX.writeFile(wb, "OkaVlhpisa_Template.xlsx"); }
  function handleImportPayload(payload, mode, includeAll=true) {
    let incomingAssets = [];
    let incomingSettings = null;
    let incomingService = null;
    let incomingHistory = null;
    let incomingWorkOrders = null;
    let incomingCounter = null;
    let incomingPrefs = null;
    if (Array.isArray(payload)) incomingAssets = payload;
    else if (payload?.data) {
      incomingAssets = payload.data.assets || [];
      incomingSettings = payload.data.settings || null;
      incomingService = payload.data.serviceLog || null;
      incomingHistory = payload.data.history || null;
      incomingWorkOrders = payload.data.workOrders || null;
      incomingCounter = payload.data.idCounter || null;
      incomingPrefs = payload.data.prefs || null;
    } else if (payload?.assets) incomingAssets = payload.assets;
    incomingAssets = (incomingAssets || []).map(normalizeAsset).filter(a => a.assetName);
    if (mode === "replace") {
      setAssets(incomingAssets.map(a => ({ ...a, id: a.id || genId(), createdAt: a.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() })));
      if (includeAll) {
        if (incomingSettings) setSettings(migrateSettings(incomingSettings));
        if (Array.isArray(incomingService)) setServiceLog(incomingService.map(normalizeServiceEntry));
        if (Array.isArray(incomingHistory)) setHistory(incomingHistory);
        if (Array.isArray(incomingWorkOrders)) setWorkOrders(incomingWorkOrders);
        if (typeof incomingCounter === "number") setIdCounter(incomingCounter);
        if (incomingPrefs && typeof incomingPrefs === "object") setPrefs(prev => ({ ...prev, ...incomingPrefs }));
      }
      showToast(`Imported ${incomingAssets.length} assets (replaced)`); triggerBackupReminder("imported data");
      return;
    }
    if (mode === "append") {
      const existing = new Set((assets || []).map(a => String(a.id || "").trim()));
      const next = incomingAssets.map(a => {
        const useExistingId = a.id && !existing.has(String(a.id).trim());
        return { ...a, id: useExistingId ? a.id : genId(), createdAt: a.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      });
      setAssets(prev => [...prev, ...next]);
      showToast(`Imported ${next.length} assets (appended)`); triggerBackupReminder("imported data");
      return;
    }
    const currentAssets = (assets || []).slice();
    const map = new Map(currentAssets.map(a => [a.id, a]));
    let mergedCount = 0;
    let newCount = 0;
    incomingAssets.forEach(a => {
      const existingMatch = findExistingAssetMatch(Array.from(map.values()), a);
      if (existingMatch) {
        const merged = normalizeAsset({ ...existingMatch, ...a, id: existingMatch.id, createdAt: existingMatch.createdAt || a.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
        map.set(existingMatch.id, merged);
        mergedCount += 1;
      } else {
        const created = { ...a, id: a.id && !map.has(a.id) ? a.id : genId(), createdAt: a.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        map.set(created.id, normalizeAsset(created));
        newCount += 1;
      }
    });
    setAssets(Array.from(map.values()));
    showToast(`Imported ${incomingAssets.length} assets (${mergedCount} merged, ${newCount} new)`); triggerBackupReminder("imported data");
  }
  function parseExcelToAssets(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = wb.SheetNames.find(n => n.toLowerCase() === "assets") || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
    if (!rows.length) return { assets: [], unmappedCols: [] };
    const headers = Object.keys(rows[0] || {});
    const normalized = headers.map(h => ({ raw: h, norm: String(h).trim().toLowerCase() }));
    const lookup = (field) => {
      const variants = IMPORT_COLUMN_MAP[field] || [];
      for (const v of variants) {
        const found = normalized.find(h => h.norm === v);
        if (found) return found.raw;
      }
      const direct = normalized.find(h => h.norm === field.toLowerCase());
      return direct ? direct.raw : null;
    };
    const keyMap = {};
    const mappedCols = new Set();
    Object.keys(IMPORT_COLUMN_MAP).forEach(field => {
      const col = lookup(field);
      if (col) {
        keyMap[field] = col;
        mappedCols.add(col);
      }
    });
    const unmappedCols = headers.filter(h => !mappedCols.has(h));
    return {
      assets: rows.map(r => {
        const o = {};
        Object.entries(keyMap).forEach(([field, col]) => { o[field] = r[col]; });
        if (!o.assetName && r.Name) o.assetName = r.Name;
        if (!o.id && r.ID) o.id = r.ID;
        if (!o.replacementCost && (r.UnitCost || r.Cost)) o.replacementCost = r.UnitCost || r.Cost;
        if (!o.maintInt && (r.MaintIntervalMonths || r.MaintInterval)) o.maintInt = r.MaintIntervalMonths || r.MaintInterval;
        if (!o.imageUrl && r.ImageUrl) o.imageUrl = r.ImageUrl;
        if (!o.docUrl && r.DocUrl) o.docUrl = r.DocUrl;
        if (!o.installDate && r.InstallDate) o.installDate = r.InstallDate;
        if (o.isCritical == null || o.isCritical === "") o.isCritical = parseBool(r.IsCritical);
        if (!o.latitude && r.Latitude) o.latitude = r.Latitude;
        if (!o.longitude && r.Longitude) o.longitude = r.Longitude;
        return normalizeAsset(o);
      }).filter(a => a.assetName),
      unmappedCols
    };
  }
  function parseCsvToAssets(text, delimiter) {
    const sep = delimiter || ",";
    const lines = [];
    let current = ""; let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') { inQuote = !inQuote; current += ch; }
      else if ((ch === "\n" || ch === "\r") && !inQuote) {
        if (current.trim()) lines.push(current);
        current = "";
        if (ch === "\r" && text[i + 1] === "\n") i++;
      } else { current += ch; }
    }
    if (current.trim()) lines.push(current);
    if (lines.length < 2) return { assets: [], unmappedCols: [] };
    function splitRow(line) {
      const cells = []; let cell = ""; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (q && line[i + 1] === '"') { cell += '"'; i++; } else { q = !q; } }
        else if (c === sep && !q) { cells.push(cell); cell = ""; }
        else { cell += c; }
      }
      cells.push(cell);
      return cells.map(c => c.trim());
    }
    const headers = splitRow(lines[0]);
    const rows = lines.slice(1).map(line => {
      const cells = splitRow(line);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cells[i] ?? ""; });
      return obj;
    }).filter(r => Object.values(r).some(v => v !== ""));
    if (!rows.length) return { assets: [], unmappedCols: [] };
    const normalized = headers.map(h => ({ raw: h, norm: String(h).trim().toLowerCase() }));
    const lookup = (field) => {
      const variants = IMPORT_COLUMN_MAP[field] || [];
      for (const v of variants) { const found = normalized.find(h => h.norm === v); if (found) return found.raw; }
      const direct = normalized.find(h => h.norm === field.toLowerCase());
      return direct ? direct.raw : null;
    };
    const keyMap = {}; const mappedCols = new Set();
    Object.keys(IMPORT_COLUMN_MAP).forEach(field => { const col = lookup(field); if (col) { keyMap[field] = col; mappedCols.add(col); } });
    const unmappedCols = headers.filter(h => !mappedCols.has(h));
    return {
      assets: rows.map(r => {
        const o = {};
        Object.entries(keyMap).forEach(([field, col]) => { o[field] = r[col]; });
        if (!o.assetName && r.Name) o.assetName = r.Name;
        if (!o.id && r.ID) o.id = r.ID;
        if (!o.replacementCost && (r.UnitCost || r.Cost)) o.replacementCost = r.UnitCost || r.Cost;
        if (!o.maintInt && (r.MaintIntervalMonths || r.MaintInterval)) o.maintInt = r.MaintIntervalMonths || r.MaintInterval;
        if (o.isCritical == null || o.isCritical === "") o.isCritical = parseBool(r.IsCritical);
        return normalizeAsset(o);
      }).filter(a => a.assetName),
      unmappedCols
    };
  }
  function handleFileImport(file, mode, includeAll, previewedUnmapped) {
    const name = (file?.name || "").toLowerCase();
    const reader = new FileReader();
    reader.onerror = () => showToast("Failed to read file", "error");
    if (name.endsWith(".json")) {
      reader.onload = () => {
        try {
          handleImportPayload(JSON.parse(reader.result), mode, includeAll);
          setImportModalOpen(false);
        } catch (e) {
          showToast("Invalid JSON", "error");
        }
      };
      reader.readAsText(file);
      return;
    }
    if (name.endsWith(".csv") || name.endsWith(".tsv")) {
      reader.onload = () => {
        try {
          const result = parseCsvToAssets(reader.result, name.endsWith(".tsv") ? "\t" : ",");
          handleImportPayload(result.assets, mode, false);
          setImportModalOpen(false);
        } catch (e) {
          console.error(e);
          showToast("CSV import failed (check format)", "error");
        }
      };
      reader.readAsText(file);
      return;
    }
    reader.onload = () => {
      try {
        const result = parseExcelToAssets(reader.result);
        handleImportPayload(result.assets, mode, false);
        setImportModalOpen(false);
      } catch (e) {
        console.error(e);
        showToast("Excel import failed (check format)", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function toggleSort(field) { if (sortBy === field) setSortDir(prev => prev === "asc" ? "desc" : "asc"); else { setSortBy(field); setSortDir("asc"); } }
  function toggleServiceSort(field) { if (serviceSortBy === field) setServiceSortDir(prev => prev === "asc" ? "desc" : "asc"); else { setServiceSortBy(field); setServiceSortDir("desc"); } }
  // FEATURE 4: Added calendar to viewMeta
  const viewMeta = useMemo(() => ({ dashboard: { badge: "Overview", title: "System health at a glance", subtitle: "Risk, value, maintenance, and what\'s about to break." }, assets: { badge: "Inventory", title: "Asset register", subtitle: `${sorted.length} item${sorted.length === 1 ? "" : "s"} match your filters.` }, service: { badge: "Maintenance", title: "Service log", subtitle: "Track maintenance, repairs, and replacements." }, forecast: { badge: "Capital Planning", title: `${forecastHorizon}-Year Capital + Operating Forecast`, subtitle: `Rolling ${forecastHorizon}-year capital and operating forecast for planning, budgeting, and funding applications.` }, calendar: { badge: "Schedule", title: "Maintenance Calendar", subtitle: "Visual overview of upcoming maintenance due dates." }, history: { badge: "Audit trail", title: "History", subtitle: "Every change leaves a breadcrumb." }, reports: { badge: "Sharing", title: "Reports", subtitle: "Quick snapshots for print or export." }, data: { badge: "Data ops", title: "Import / Restore / Backup", subtitle: "Move data in and out cleanly, and keep recoverable backups." }, settings: { badge: "Configuration", title: "Settings", subtitle: "Budget, inflation, reserve assumptions." } }), [sorted.length, forecastHorizon]);
  const meta = viewMeta[view] || viewMeta.dashboard;
  // Render
  return <div className="min-h-screen">
    {/* Header */}
    <header className={`header-custom sticky top-0 z-40 no-print ${isScenarioMode ? "scenario-hdr" : ""}`}>
      <div className="hdr-diamonds" aria-hidden="true">
        <div className="hdr-diamond outline-lime" style={{width:100,height:100,right:180,top:-18,opacity:0.5}}></div>
        <div className="hdr-diamond solid-gold" style={{width:80,height:80,right:120,top:-4,opacity:0.7}}></div>
        <div className="hdr-diamond solid-lime-deep" style={{width:64,height:64,right:72,top:28,opacity:0.65}}></div>
        <div className="hdr-diamond solid-gold-deep" style={{width:14,height:14,right:56,top:14,opacity:0.6}}></div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 app-header-inner">
        <div className="header-top-row">
          <Logo orgName={settings.orgName} pwsId={settings.pwsId} sealOk={sealOk} />
          <div className="header-actions" data-tut="header-actions">
            {!basicMode && <button onClick={toggleScenarioMode} className="hdr-btn" style={isScenarioMode ? {background:"#d97706",borderColor:"#f59e0b",color:"white"} : {}} title={isScenarioMode ? "Leave safe scenario mode" : "Open safe sample scenarios and what-if planning"}><Icon name="flask" size={14} /> {isScenarioMode ? "Leave Scenario" : "Scenarios"}</button>}
            <button onClick={() => setImportModalOpen(true)} className="hdr-btn" data-tut="btn-import" title="Import / Restore / Backup"><Icon name="database" size={14} /> Import / Backup</button>
            {!basicMode && <button onClick={() => exportExcel()} className="hdr-btn" title="Export to Excel"><Icon name="download" size={14} /> Export</button>}
            {!basicMode && <button onClick={() => window.print()} className="hdr-btn" title="Print current view"><Icon name="printer" size={14} /> Print</button>}
            <button onClick={() => setView("settings")} className="hdr-btn" data-tut="btn-settings" title="Settings"><Icon name="gear" size={14} /> Settings</button>
            <button onClick={() => startTutorial()} className={`hdr-btn${!tutorialDone && assets.length === 0 ? " nudge" : ""}`} data-tut="btn-tour" title="Guided tour"><Icon name="bookOpen" size={14} /> Tour</button>
            <button onClick={() => openHelp("quickstart")} className="hdr-btn gold" data-tut="btn-help" title="Help & changelog"><Icon name="help" size={14} /> Help</button>
          </div>
        </div>
      </div>
      {isScenarioMode ? <div className="scenario-diamond-strip"></div> : <div className="diamond-strip"></div>}
      {/* Nav Bar - inside header for sticky group */}
      <div className="nav-bar-strip no-print">
        {(basicMode
          ? [["overview","Overview","dashboard"],["assets","Assets","assets"],["service-cal","Service & Calendar","service"],["data","Import / Backup","data"],["settings","Settings","settings"]]
          : [["overview","Overview","dashboard"],["assets","Assets","assets"],["service-cal","Service & Calendar","service"],["history","History","history"],["data","Import / Backup","data"],["settings","Settings","settings"]]
        ).map(([groupKey, label]) => {
          const overviewViews = ["dashboard","reports","forecast"];
          const serviceCalViews = ["service","calendar"];
          const isActive = groupKey === "overview" ? overviewViews.includes(view) : groupKey === "service-cal" ? serviceCalViews.includes(view) : view === groupKey;
          return <div key={groupKey} data-tut={`nav-${groupKey}`} className={`nav-step ${isActive ? "active" : ""}`} onClick={() => {
            if (groupKey === "overview") setView(overviewTab || "dashboard");
            else if (groupKey === "service-cal") setView(serviceCalTab || "service");
            else setView(groupKey);
          }}>{label}</div>;
        })}
        <div className="nav-step" data-tut="toggle-basic-advanced" style={{marginLeft:"auto",fontSize:"11px",gap:"4px",opacity:0.85}} onClick={() => setPrefs(p => ({...p, basicMode: !p.basicMode}))} title={basicMode ? "Show all tabs (advanced features)" : "Simplify to basics only"}><span style={{display:"inline-block",width:"28px",height:"16px",borderRadius:"8px",background:basicMode?"#76B900":"#64748b",position:"relative",transition:"background .2s",verticalAlign:"middle"}}><span style={{position:"absolute",top:"2px",left:basicMode?"2px":"14px",width:"12px",height:"12px",borderRadius:"50%",background:"white",transition:"left .2s"}}/></span>{basicMode ? "Basics" : "Advanced"}</div>
      </div>
    </header>
    {/* Scenario Mode Banner */}
    {isScenarioMode && <div className="scenario-banner no-print">
      <div className="scenario-banner-main">
        <Icon name="flask" size={16} />
        <span>Safe Scenario Mode</span>
        {scenarioDraft?.templateMeta?.name && <span style={{background:"rgba(255,255,255,0.16)",padding:"4px 10px",borderRadius:999,fontSize:12,fontWeight:800}}>Mock System: {scenarioDraft.templateMeta.name}</span>}
        <span className="scenario-banner-copy">Practice with sample data or test what-if changes here. Your real saved records stay untouched.</span>
        <HelpLink tab="faq" scrollTo="faq-scenarios" />
      </div>
      <div className="scenario-banner-actions">
        <button className="scenario-exit-btn" onClick={() => setScenarioTemplateOpen(true)}>Pick a Scenario</button>
        <button className="scenario-exit-btn" onClick={openScenarioChanges}>View Changes</button>
        <button className="scenario-exit-btn" onClick={resetScenarioToBaseline}>Start Over</button>
        <button className="scenario-exit-btn" onClick={toggleScenarioMode}>Leave Scenario</button>
      </div>
    </div>}
    {/* Scenario Diff Summary Modal (Step 4) */}
    {scenarioDiffOpen && scenarioDiffData && <div className="modal-overlay no-print" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="glass-card animate-in" style={{maxWidth:520,width:"100%",maxHeight:"80vh",overflow:"auto",padding:0}}>
        <div style={{background:"linear-gradient(135deg,#92400e,#b45309)",color:"white",padding:"16px 20px",borderRadius:"16px 16px 0 0"}}>
          <div style={{fontWeight:800,fontSize:16,display:"flex",alignItems:"center",gap:8}}><Icon name="flask" size={18} /> Discard Scenario Changes?</div>
          <div style={{fontSize:13,opacity:0.9,marginTop:4}}>You made {scenarioDiffData.totalChanges} change{scenarioDiffData.totalChanges === 1 ? "" : "s"} during this scenario session.</div>
        </div>
        <div style={{padding:"16px 20px"}}>
          {scenarioDiffData.assetsAdded.length > 0 && <div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,color:"#059669",marginBottom:4}}>Assets Added ({scenarioDiffData.assetsAdded.length})</div>
            {scenarioDiffData.assetsAdded.slice(0, 8).map((n, i) => <div key={i} style={{fontSize:12,color:"#475569",paddingLeft:8}}>{n}</div>)}
            {scenarioDiffData.assetsAdded.length > 8 && <div style={{fontSize:11,color:"#94a3b8",paddingLeft:8}}>+{scenarioDiffData.assetsAdded.length - 8} more</div>}
          </div>}
          {scenarioDiffData.assetsRemoved.length > 0 && <div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,color:"#dc2626",marginBottom:4}}>Assets Removed ({scenarioDiffData.assetsRemoved.length})</div>
            {scenarioDiffData.assetsRemoved.slice(0, 8).map((n, i) => <div key={i} style={{fontSize:12,color:"#475569",paddingLeft:8}}>{n}</div>)}
            {scenarioDiffData.assetsRemoved.length > 8 && <div style={{fontSize:11,color:"#94a3b8",paddingLeft:8}}>+{scenarioDiffData.assetsRemoved.length - 8} more</div>}
          </div>}
          {scenarioDiffData.assetsModified.length > 0 && <div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,color:"#2563eb",marginBottom:4}}>Assets Modified ({scenarioDiffData.assetsModified.length})</div>
            {scenarioDiffData.assetsModified.slice(0, 8).map((m, i) => <div key={i} style={{fontSize:12,color:"#475569",paddingLeft:8}}>{m.name} ({m.fields.join(", ")})</div>)}
            {scenarioDiffData.assetsModified.length > 8 && <div style={{fontSize:11,color:"#94a3b8",paddingLeft:8}}>+{scenarioDiffData.assetsModified.length - 8} more</div>}
          </div>}
          {scenarioDiffData.settingsChanged.length > 0 && <div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,color:"#7c3aed",marginBottom:4}}>Settings Changed ({scenarioDiffData.settingsChanged.length})</div>
            {scenarioDiffData.settingsChanged.map((s, i) => <div key={i} style={{fontSize:12,color:"#475569",paddingLeft:8}}>{s.key}: {String(s.from ?? "(empty)")} {"→"} {String(s.to ?? "(empty)")}</div>)}
          </div>}
          {scenarioDiffData.serviceAdded > 0 && <div style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:13,color:"#d97706",marginBottom:4}}>Service Entries Added: {scenarioDiffData.serviceAdded}</div>
          </div>}
          <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:10,padding:"10px 12px",fontSize:12,color:"#92400e",fontWeight:600,marginTop:8}}>
            Discarding will restore all data to its state before you entered Scenario Mode. This cannot be undone.
          </div>
        </div>
        <div style={{padding:"12px 20px 16px",display:"flex",justifyContent:"flex-end",gap:8,borderTop:"1px solid #e2e8f0"}}>
          <button onClick={() => { setScenarioDiffOpen(false); setScenarioDiffData(null); }} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #e2e8f0",background:"white",fontWeight:700,fontSize:13,cursor:"pointer",color:"#475569"}}>Keep Exploring</button>
          <button onClick={confirmDiscardScenario} style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#dc2626",color:"white",fontWeight:700,fontSize:13,cursor:"pointer"}}>Discard All Changes</button>
        </div>
      </div>
    </div>}
    {scenarioTemplateOpen && isScenarioMode && <div className="modal-overlay no-print" style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="glass-card animate-in" style={{maxWidth:980,width:"100%",maxHeight:"84vh",overflow:"auto",padding:0}}>
        <div style={{background:"linear-gradient(135deg,#92400e,#d97706)",color:"white",padding:"18px 22px",borderRadius:"16px 16px 0 0"}}>
          <div style={{fontWeight:800,fontSize:18,display:"flex",alignItems:"center",gap:10}}><Icon name="flask" size={18} /> Pick a Sample Water System Scenario</div>
          <div style={{fontSize:13,opacity:0.92,marginTop:6}}>Choose a sample system to practice with. It replaces only this temporary scenario copy. Your real saved local data stays untouched.</div>
        </div>
        <div style={{padding:"18px 22px"}}><div style={{marginBottom:14,background:"#f8fafc",border:"1px solid #cbd5e1",borderRadius:12,padding:"12px 14px",fontSize:13,color:"#334155"}}><strong>How this works:</strong> pick a sample system, explore the app, change numbers, or test replacements. When you leave Scenario Mode, those practice changes are discarded unless you export them separately.</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {TYPICAL_SCENARIO_TEMPLATES.map(t => <div key={t.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50" style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">{t.sizeBand}</div>
                <div className="text-lg font-semibold text-slate-900 mt-1">{t.name}</div>
                <div className="text-sm text-slate-500 mt-1">{t.serviceScale}</div>
                <div className="text-sm text-slate-700 mt-3 leading-6">{t.description}</div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {t.highlights.map((item, idx) => <span key={idx} style={{fontSize:12,fontWeight:700,color:"#92400e",background:"#fef3c7",border:"1px solid #fde68a",padding:"4px 8px",borderRadius:999}}>{item}</span>)}
              </div>
              <button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={() => loadScenarioTemplate(t.id)}>Use This Sample System</button>
            </div>)}
          </div>
          <div style={{marginTop:14,background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:12,padding:"12px 14px",fontSize:12,color:"#9a3412",fontWeight:600}}>Tip: use <strong>Start Over</strong> any time to throw away the sample edits and return to a clean copy of your own baseline data.</div>
        </div>
        <div style={{padding:"12px 22px 18px",display:"flex",justifyContent:"flex-end",gap:8,borderTop:"1px solid #e2e8f0"}}>
          <button onClick={() => setScenarioTemplateOpen(false)} style={{padding:"8px 16px",borderRadius:8,border:"1px solid #e2e8f0",background:"white",fontWeight:700,fontSize:13,cursor:"pointer",color:"#475569"}}>Close</button>
        </div>
      </div>
    </div>}
    {/* Backup Setup Banner */}
    {showBackupBanner && <div className="no-print" style={{background:"linear-gradient(90deg, #1E3D3B, #287575)",color:"white",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"center",gap:"16px",flexWrap:"wrap",fontSize:"14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px"}}><Icon name="shield" size={18} /><span className="font-semibold">Protect your data</span><span style={{opacity:0.85}}>Your {assets.length} assets are only in this browser right now. Set up a backup.</span></div>
      <div style={{display:"flex",gap:"8px",flexShrink:0}}>
        {autosaveSupported && <button onClick={() => { connectAutosaveFile(); setShowBackupBanner(false); }} style={{background:"white",color:"#1E3D3B",border:"none",padding:"6px 14px",borderRadius:"8px",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>Connect autosave file</button>}
        <button onClick={() => { exportBackupJSON(); setShowBackupBanner(false); }} style={{background:"rgba(255,255,255,0.15)",color:"white",border:"1px solid rgba(255,255,255,0.3)",padding:"6px 14px",borderRadius:"8px",fontWeight:700,fontSize:"13px",cursor:"pointer"}}>Export JSON backup</button>
        <button onClick={() => setShowBackupBanner(false)} style={{background:"none",color:"rgba(255,255,255,0.6)",border:"none",padding:"6px 8px",cursor:"pointer",fontSize:"16px"}}>✕</button>
      </div>
    </div>}
    {/* Body */}
    <main className={`max-w-7xl mx-auto px-4 sm:px-6 py-6 ${tutorialActive ? "tut-body-pad" : ""}`}>
      {/* Section Header */}
      <SectionHeader badge={meta.badge} title={meta.title} subtitle={meta.subtitle} right={
        view === "assets" ? <>
          <button data-tut="btn-add-asset" className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold flex items-center gap-2" onClick={openAddAsset}><Icon name="plus" /> Add asset</button>
          {sorted.length !== enriched.length && <button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold flex items-center gap-2" onClick={exportFilteredExcel}><Icon name="download" size={16} /> Export filtered ({sorted.length})</button>}
          {selected.size > 0 && <><button className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-2" onClick={() => setBatchServiceOpen(true)}><Icon name="wrench" size={16} /> Log Service ({selected.size})</button><button className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-semibold flex items-center gap-2" onClick={() => setBulkEditModalOpen(true)}><Icon name="bulkEdit" /> Bulk Edit ({selected.size})</button><button className="px-4 py-2 rounded-lg bg-slate-500 hover:bg-slate-600 text-white font-semibold" onClick={() => setConfirm({ open: true, title: `Retire ${selected.size} asset${selected.size === 1 ? "" : "s"}?`, body: "This sets the status to Retired. Retired assets are excluded from forecasts, risk calculations, and maintenance tracking. This can be undone via Bulk Edit.", danger: false, confirmText: "Retire", onConfirm: () => { handleBulkEditSave({ status: "Retired" }); setConfirm({ open: false }); }, onCancel: () => setConfirm({ open: false }) })}>Retire ({selected.size})</button><button className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => askDeleteAssets(Array.from(selected))}>Delete ({selected.size})</button></>}
        </> : view === "service" ? <button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold flex items-center gap-2" onClick={() => { setEditService(null); setServiceModalOpen(true); }}><Icon name="plus" /> Add service entry</button>
        : view === "forecast" ? <><button className="px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center gap-2" onClick={() => window.print()}><Icon name="printer" /> Print plan</button><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold flex items-center gap-2" onClick={() => { const rows = fiveYearCIP.map(r => ({ Year: r.year, "Total Need": r.totalCost, "Capital Need": r.capitalNeed, "Operating Need": r.operatingNeed, "Labor Need": r.laborNeed, "Maintenance Need": r.maintenanceNeed, "Overhead Need": r.overheadNeed, "Deferred In": r.deferredIn, Funded: r.funded, Shortfall: r.shortfall, "Reserve Balance": r.endingReserve })); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Forecast"); XLSX.writeFile(wb, `OkaVlhpisa_Forecast_${forecastHorizon}yr_${isoDate()}.xlsx`); showToast("Forecast exported"); }}><Icon name="download" size={16} /> Export</button></>
        : view === "data" ? <button className="px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center gap-2" onClick={() => setImportModalOpen(true)}><Icon name="database" /> Open Import / Restore / Backup tools</button> : null
      } />
      {/* Filters */}
      {["assets","service"].includes(view) && !(view === "assets" && assets.length === 0) && <div className="glass-card p-4 mb-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5"><label className="text-xs font-medium text-slate-600 uppercase">Search</label><div className="relative mt-1"><div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></div><input value={view === "service" ? serviceSearch : assetSearch} onChange={(e) => (view === "service" ? setServiceSearch(e.target.value) : setAssetSearch(e.target.value))} className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder={view === "service" ? "Search service log…" : "Search assets…"} /></div></div>
          {view === "assets" && <><div className="lg:col-span-2"><label className="text-xs font-medium text-slate-600 uppercase">Status</label><select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="All">All</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div className="lg:col-span-2"><label className="text-xs font-medium text-slate-600 uppercase">Category</label><select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="All">All</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div><div className="lg:col-span-2"><label className="text-xs font-medium text-slate-600 uppercase">Priority</label><select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="All">All</option>{PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}</select></div></>}
        </div>
        {view === "assets" && (assetSearch || filterStatus !== "All" || filterCat !== "All" || filterPriority !== "All" || filterCritical || alertFilter) && <div className="flex items-center justify-between mt-2"><div className="text-xs text-slate-500">{sorted.length} of {enriched.length} assets shown</div><button className="text-xs font-semibold text-[#1E3D3B] hover:text-[#76B900] underline" onClick={() => { setAssetSearch(""); setFilterStatus("All"); setFilterCat("All"); setFilterPriority("All"); setFilterCritical(false); setAlertFilter(null); }}>Clear all filters</button></div>}
      </div>}
      {/* Overview sub-nav */}
      {["dashboard","reports","forecast"].includes(view) && <div className="flex gap-0 mb-1 border-b border-slate-200 no-print">
        {[["dashboard","Dashboard"],["reports","Reports"],["forecast","Forecast"]].map(([k,lbl]) => (
          <button key={k} onClick={() => setView(k)} className={"px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors " + (view===k ? "border-[#1E3D3B] text-[#1E3D3B]" : "border-transparent text-slate-500 hover:text-slate-800")}>{lbl}</button>
        ))}
      </div>}
      {/* FEATURE 1: Dashboard with Charts */}
      {view === "dashboard" && <div className="space-y-4" data-tut="dashboard-body">
        <div className="print-header items-center justify-between p-4 rounded-xl" style={{background:"#1E3D3B",color:"white"}}>
          <div>
            <div className="text-xl font-bold">{settings.orgName || "Water System"}</div>
            <div className="text-sm opacity-80">{APP_NAME} • System Health Dashboard</div>
          </div>
          <div className="text-right text-sm">
            {settings.pwsId && <div>PWS ID: {settings.pwsId}</div>}
            <div>Generated {new Date().toLocaleDateString()}</div>
          </div>
        </div>
        {showStartHere ? <div className="glass-card p-6 md:p-8 border border-emerald-200 bg-[linear-gradient(135deg,rgba(118,185,0,0.12),rgba(255,255,255,0.96))]">
          <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-emerald-200 text-emerald-900 text-xs font-semibold uppercase tracking-wide">Start Here</div>
              <div className="text-2xl md:text-3xl font-black text-slate-900 mt-3">Build your first usable asset register without getting overwhelmed.</div>
              <div className="text-sm md:text-base text-slate-700 mt-3 leading-relaxed">Start with just the basics, save a backup, and come back later for the extra details. You do not need to fill out everything on day one.</div>
              {!assets.length && <div className="mt-4 p-4 rounded-2xl bg-white/85 border border-emerald-100">
                <div className="text-sm font-semibold text-slate-900">New system? Use one of these three paths.</div>
                <div className="text-sm text-slate-600 mt-1">Each one gets you to a usable starting point quickly.</div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button className="text-left p-4 rounded-2xl bg-[#76B900] hover:bg-[#5A9400] text-white shadow-sm" onClick={() => setView("assets")}>
                    <div className="text-base font-semibold">Add assets manually</div>
                    <div className="text-sm mt-1 text-white/90">Best when you are starting from scratch or only have a few items ready.</div>
                  </button>
                  <button className="text-left p-4 rounded-2xl bg-[#1E3D3B] hover:bg-[#152B2A] text-white shadow-sm" onClick={() => setView("data")}>
                    <div className="text-base font-semibold">Import / Restore / Backup</div>
                    <div className="text-sm mt-1 text-white/90">Bring in an Excel file or restore a JSON backup.</div>
                  </button>
                  <button className="text-left p-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm" onClick={startTutorial}>
                    <div className="text-base font-semibold">Take the guided tour</div>
                    <div className="text-sm mt-1 text-white/90">See where everything lives before entering data.</div>
                  </button>
                </div>
              </div>}
              {assets.length > 0 && <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-700">
                <div>1. Add the must-have asset details first.</div>
                <div>2. Use Service to log completed maintenance, repairs, and inspections.</div>
                <div>3. Open Import / Backup and save a JSON backup.</div>
                <div>4. Review Forecast in Basic mode, then switch to Advanced if needed.</div>
              </div>}
            </div>
            <div className="xl:w-[320px] flex-shrink-0">
              <div className="rounded-3xl bg-white border border-emerald-200 shadow-sm p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Start Here</div>
                <div className="text-sm text-slate-600 mt-1">Keep this pinned as the main entry point for setup, imports, backups, and next-step navigation.</div>
                <button className="mt-4 w-full px-5 py-5 rounded-2xl bg-[#76B900] hover:bg-[#5A9400] text-white font-black text-lg shadow-sm" onClick={() => setView(!assets.length ? "assets" : "data")}>Start Here</button>
                <div className="mt-3 text-xs text-slate-500">Opens the next best place to work based on whether your system already has assets.</div>
                <div className="mt-4 flex flex-col gap-2">
                  <button className="w-full px-4 py-2 rounded-xl border border-slate-300 hover:bg-white font-semibold" onClick={() => setView("assets")}>Add / review assets</button>
                  <button className="w-full px-4 py-2 rounded-xl border border-slate-300 hover:bg-white font-semibold" onClick={() => setView("data")}>Open Import / Backup</button>
                  <button className="w-full px-4 py-2 rounded-xl border border-slate-300 hover:bg-white font-semibold" onClick={() => setView("forecast")}>Open forecast</button>
                  <button className="w-full px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold" onClick={() => setPrefs(prev => ({ ...prev, showStartHere: false }))}>Hide Start Here</button>
                </div>
              </div>
            </div>
          </div>
        </div> : <div className="glass-card p-4 border border-slate-200 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Start Here hidden</div>
              <div className="text-sm text-slate-600 mt-1">Bring the dashboard entry panel back whenever you want a quick starting point.</div>
            </div>
            <button className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold whitespace-nowrap" onClick={() => setPrefs(prev => ({ ...prev, showStartHere: true }))}>Show Start Here</button>
          </div>
        </div>}
        {!basicMode && (duplicateGroups.length > 0 || forecastDataWarnings.totalIssues > 0) && <div className="space-y-4">
          {forecastDataWarnings.totalIssues > 0 && <div className="glass-card p-4 border border-amber-200 bg-amber-50 w-full">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-amber-900">Forecast data warnings</div>
                <div className="text-sm text-amber-800 mt-1">Your forecast is only as good as the data behind it. Fill the gaps below to improve accuracy.</div>
              </div>
              <button className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-semibold whitespace-nowrap self-start xl:self-center" onClick={() => setView("assets")}>Review asset data</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-amber-900">
              <div className="px-3 py-1.5 rounded-full bg-white/70 border border-amber-200">Missing install year/date: <span className="font-bold">{forecastDataWarnings.missingInstall}</span></div>
              <div className="px-3 py-1.5 rounded-full bg-white/70 border border-amber-200">Missing useful life: <span className="font-bold">{forecastDataWarnings.missingLife}</span></div>
              <div className="px-3 py-1.5 rounded-full bg-white/70 border border-amber-200">Missing replacement cost: <span className="font-bold">{forecastDataWarnings.missingCost}</span></div>
            </div>
          </div>}
          {duplicateGroups.length > 0 && <div className="glass-card p-4 border border-red-200 bg-red-50">
            <div className="text-sm font-semibold text-red-900">Possible duplicate assets</div>
            <div className="text-sm text-red-800 mt-1">{duplicateGroups.length} duplicate group{duplicateGroups.length === 1 ? "" : "s"} detected based on name, location, and serial number. Clean these up before trusting totals and forecasts.</div>
            <div className="mt-3 text-xs text-red-900">Example: {duplicateGroups[0]?.slice(0,2).map(a => a.assetName).join(" / ")}</div>
            <button className="mt-3 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold" onClick={() => setView("assets")}>Open asset register</button>
          </div>}
        </div>}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-card p-5" style={{borderTop:"3px solid #1E3D3B"}}><div className="text-xs font-medium text-slate-500 uppercase">Active Assets (qty)</div><div className="text-3xl font-semibold text-slate-900 mt-1">{numberFormatter.format(stats.totalQty)}</div><div className="text-sm text-slate-600 mt-2">{stats.totalAll} total • {stats.planningCount} planning • {stats.retiredCount} retired</div></div>
          <div className="glass-card p-5" style={{borderTop:"3px solid #76B900"}}><div className="text-xs font-medium text-slate-500 uppercase">Replacement Value<HelpLink tab="definitions" scrollTo="def-replacement-cost" /></div><div className="text-3xl font-semibold text-slate-900 mt-1">{currencyFormatter.format(stats.value)}</div>{settings.showDepreciation ? <div className="text-sm text-slate-600 mt-2">Depreciated estimate: {currencyFormatter.format(stats.deprec)}</div> : <div className="text-sm text-slate-600 mt-2">Depreciation hidden in settings</div>}</div>
          <div className="glass-card p-5" style={{borderTop:"3px solid #d97706"}}><div className="text-xs font-medium text-slate-500 uppercase">Average Condition<HelpLink tab="definitions" scrollTo="def-condition" /></div><div className="text-3xl font-semibold text-slate-900 mt-1">{stats.avgCond.toFixed(1)} / 5</div><div className="text-sm text-slate-600 mt-2">{stats.highRisk} high-risk • {stats.pastLife} past useful life</div></div>
        </div>

        {/* Quick Actions */}
        {!startHereMode && <div className="glass-card p-4 no-print">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase mr-1">Quick actions</span>
            <button className="px-3 py-1.5 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold text-sm flex items-center gap-1.5" onClick={openAddAsset}><Icon name="plus" size={14} /> Add Asset</button>
            {!basicMode && <button className="px-3 py-1.5 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold text-sm flex items-center gap-1.5" onClick={() => { setEditService(null); setServiceModalOpen(true); }}><Icon name="wrench" size={14} /> Log Service</button>}
            
            {!basicMode && <button className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-sm flex items-center gap-1.5" onClick={() => setView("reports")}><Icon name="file" size={14} /> Reports</button>}
            {!basicMode && <button className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-sm flex items-center gap-1.5" onClick={exportPDF}><Icon name="download" size={14} /> Export PDF</button>}
            {!basicMode && <button className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-sm flex items-center gap-1.5" onClick={() => { const el = document.getElementById("board-narrative"); if (el) { navigator.clipboard.writeText(el.innerText).then(() => showToast("Copied to clipboard")).catch(() => showToast("Scroll down to Data Summary to copy", "warn")); } else { showToast("Add at least 1 asset to generate a board summary", "warn"); } }}><Icon name="copy" size={14} /> Copy Data Summary</button>}
            <button className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold text-sm flex items-center gap-1.5" onClick={() => setView("calendar")}><Icon name="calendar" size={14} /> Calendar</button>
          </div>
        </div>}
        {/* Board Meeting Narrative Generator (moved above charts for visibility) */}
        {!basicMode && activeAssets.length >= 1 && <div className="glass-card p-5 print-break-before">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-lg font-semibold text-slate-900">Data Summary</div><div className="text-sm text-slate-600">Copy-paste narrative for council presentations and budget requests.</div></div>
            <button className="px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center gap-2" onClick={() => { const el = document.getElementById("board-narrative"); if (el) { navigator.clipboard.writeText(el.innerText).then(() => showToast("Copied to clipboard")).catch(() => { const r = document.createRange(); r.selectNode(el); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); document.execCommand("copy"); window.getSelection().removeAllRanges(); showToast("Copied to clipboard"); }); } }}><Icon name="file" size={16} /> Copy</button>
          </div>
          <div id="board-narrative" className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-800 leading-relaxed">
            {(() => {
              const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
              const orgName = settings.orgName || "Our water system";
              
              const fiveYrGap = fiveYearGap;
              const critCount = activeAssets.filter(a => a && a.isCritical).length;
              const lines = [];
              lines.push(`As of ${today}, ${orgName} manages ${numberFormatter.format(stats.totalQty)} active infrastructure assets with a combined replacement value of ${currencyFormatter.format(stats.value)}. The average asset condition across the system is ${stats.avgCond.toFixed(1)} out of 5.`);
              if (stats.pastLife > 0 || stats.highRisk > 0) lines.push(`Currently, ${stats.pastLife} asset${stats.pastLife === 1 ? " is" : "s are"} past ${stats.pastLife === 1 ? "its" : "their"} expected useful life, and ${stats.highRisk} asset${stats.highRisk === 1 ? "" : "s"} score${stats.highRisk === 1 ? "s" : ""} as high-risk. ${stats.replace5} asset${stats.replace5 === 1 ? "" : "s"} will require replacement within the next five years.`);
              if (critCount > 0) lines.push(`${critCount} asset${critCount === 1 ? " is" : "s are"} designated as critical under the America's Water Infrastructure Act (AWIA).`);
              if (stats.maintOverdue > 0) lines.push(`There ${stats.maintOverdue === 1 ? "is" : "are"} ${stats.maintOverdue} overdue maintenance item${stats.maintOverdue === 1 ? "" : "s"} requiring immediate attention.`);
              lines.push(`Over the next ${forecastHorizon} years, projected capital replacement needs total ${currencyFormatter.format(fiveYearNeed)}. Based on current reserve contributions and grant funding, the projected funding gap is ${currencyFormatter.format(fiveYrGap)}.`);
              if (fiveYrGap > 0) lines.push(`To sustainably fund infrastructure, the system should plan to address this ${currencyFormatter.format(fiveYrGap)} shortfall through a combination of increased reserve contributions, grant applications, rate adjustments, or phased replacement strategies.`);
              return lines.join(" ");
            })()}
          </div>
        </div>}
        {/* FEATURE 1: Charts Row */}
        {activeAssets.length >= 3 && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print-break-before">
          <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900 mb-1">Replacement Value by Category</div><div className="text-sm text-slate-600 mb-4">Distribution of asset value across categories</div><CategoryDoughnutChart assets={enriched} categories={CATEGORIES} /></div>
          <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900 mb-1">Risk Heatmap<HelpLink tab="definitions" scrollTo="def-risk" /></div><div className="text-sm text-slate-600 mb-4">Assets by Condition vs Priority (bubble size = value)</div><RiskHeatmapChart assets={enriched} /></div>
        </div>}
        {/* Top Risks and Alerts */}
        {activeAssets.length >= 1 && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass-card p-5 lg:col-span-2">
            <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2"><div className="text-lg font-semibold text-slate-900">Top risks</div><HelpLink tab="definitions" scrollTo="def-risk" /></div><div className="text-sm text-slate-600">The "pay attention now" list.</div></div><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={() => { setView("assets"); setSortBy("risk"); setSortDir("desc"); }}>Open assets</button></div>
            <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-slate-500"><tr><th className="py-2">Asset</th><th className="py-2">Risk</th><th className="py-2">Replace Year</th><th className="py-2">Maint</th></tr></thead><tbody>
              {enriched.slice().sort((a,b) => (b.risk ?? -1) - (a.risk ?? -1)).slice(0, 6).map(a => { const rb = riskBucket(a.risk); return <tr key={a.id} className="border-t border-slate-100"><td className="py-2"><div className="font-semibold text-slate-900">{a.assetName}</div><div className="text-xs text-slate-500">{a.id} • {a.location || "—"}</div></td><td className="py-2"><Chip label={`${a.risk ?? "—"}`} cls={rb.cls} /></td><td className="py-2">{a.replaceYear || "—"}</td><td className="py-2">{a.maint ? <span className={`px-2 py-1 rounded-full text-xs font-bold ${a.maint.status === "overdue" ? "bg-red-100 text-red-700" : a.maint.status === "due" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{a.maint.status.toUpperCase()} • due {a.maint.dueDate}</span> : <span className="text-slate-500 text-xs">—</span>}</td></tr>; })}
            </tbody></table></div>
          </div>
          <div className="glass-card p-5"><div className="flex items-center justify-between"><div className="text-lg font-semibold text-slate-900">Alerts</div><HelpLink tab="faq" scrollTo="faq-alerts" /></div><div className="text-xs text-slate-500 mt-0.5">Click any alert with items to view affected assets. Zero-count items are clear.</div><div className="mt-3 space-y-2 text-sm">
            <AlertRow count={stats.maintOverdue} bgCls="bg-red-50" borderCls="border border-red-100" textCls="text-red-900" subtextCls="text-red-700" label="Maintenance overdue" subtitle="Needs immediate attention" onClick={() => navigateToAlert("maint-overdue", "risk", "desc")} />
            <AlertRow count={stats.maintDue - stats.maintOverdue} bgCls="bg-amber-50" borderCls="border border-amber-100" textCls="text-amber-900" label="Maintenance due soon" subtitle="Due within 30 days" onClick={() => navigateToAlert("maint-due", "risk", "desc")} />
            <AlertRow count={stats.pastLife} bgCls="bg-orange-50" borderCls="border border-orange-100" textCls="text-orange-900" subtextCls="text-orange-700" label="Past useful life" subtitle="Still active but beyond expected lifespan" onClick={() => navigateToAlert("past-life", "replaceYear", "asc")} />
            <AlertRow count={stats.replace5} bgCls="bg-red-50" borderCls="border border-red-100" textCls="text-red-900" label="Replace within 5 years" onClick={() => navigateToAlert("replace-5yr", "replaceYear", "asc")} />
            <AlertRow count={dataHealth.noMaintSchedule} bgCls="bg-slate-50" borderCls="border border-slate-200" textCls="text-slate-900" subtextCls="text-slate-600" label="No maintenance schedule" subtitle="Assets missing maintenance interval" onClick={() => navigateToAlert("no-maint", "assetName", "asc")} />
            <AlertRow count={dataHealth.noServiceHistory} bgCls="bg-slate-50" borderCls="border border-slate-200" textCls="text-slate-900" subtextCls="text-slate-600" label="No service history" subtitle="Active assets with no logged service entry" onClick={() => navigateToAlert("no-service", "assetName", "asc")} />
            {dataHealth.invalidCoordinates > 0 && <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200"><div><div className="font-semibold text-amber-900">Invalid map coordinates</div><div className="text-xs text-amber-700 mt-0.5">Latitude/longitude need cleanup</div></div><div className="font-semibold text-amber-900">{dataHealth.invalidCoordinates}</div></div>}
            {dataHealth.duplicateGroups > 0 && <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200"><div><div className="font-semibold text-red-900">Duplicate asset groups</div><div className="text-xs text-red-700 mt-0.5">Clean these up before trusting totals</div></div><div className="font-semibold text-red-900">{dataHealth.duplicateGroups}</div></div>}
            {settings.showWarranty && <AlertRow count={stats.warrantyExp} bgCls="bg-blue-50" borderCls="border border-blue-100" textCls="text-blue-900" label="Warranty expiring (90d)" onClick={() => navigateToAlert("warranty-exp", "risk", "desc")} />}
            {(() => { try { let totalBytes = 0; Object.values(KEYS).forEach(k => { const v = localStorage.getItem(k); if (v) totalBytes += v.length * 2; }); const pct = Math.round(totalBytes / (5 * 1024 * 1024) * 100); const mb = (totalBytes / (1024 * 1024)).toFixed(1); if (pct >= 80) return <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-200"><div><div className="font-semibold text-red-900">Storage {pct}% full ({mb} MB)</div><div className="text-xs text-red-700 mt-0.5">Export a backup and consider clearing history</div></div><button onClick={exportBackupJSON} className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold flex-shrink-0">Backup Now</button></div>; if (pct >= 50) return <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200"><div className="font-semibold text-amber-900">Storage: {mb} MB used ({pct}%)</div><div className="text-xs font-bold text-amber-700">Monitor</div></div>; return null; } catch { return null; } })()}
            {(() => { const lb = prefs.lastBackup; const daysSince = lb ? Math.floor((Date.now() - new Date(lb).getTime()) / 86400000) : null; if (daysSince === null) return <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50 border border-purple-200"><div><div className="font-semibold text-purple-900">No backup on file</div><div className="text-xs text-purple-700 mt-0.5">Data lives in your browser only — export a JSON backup</div></div><button onClick={exportBackupJSON} className="px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex-shrink-0">Backup Now</button></div>; if (daysSince >= 30) return <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-200"><div><div className="font-semibold text-amber-900">Backup is {daysSince} days old</div><div className="text-xs text-amber-700 mt-0.5">Last: {new Date(lb).toLocaleDateString()}</div></div><button onClick={exportBackupJSON} className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold flex-shrink-0">Backup Now</button></div>; return <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100"><div className="font-semibold text-emerald-900">Last backup: {new Date(lb).toLocaleDateString()}</div><div className="text-xs font-bold text-emerald-700">{daysSince}d ago ✓</div></div>; })()}
          </div></div>
        </div>}
      </div>}

      {/* Assets View - FEATURE 2: doc links */}
      {view === "assets" && alertFilter && <div className="flex items-center justify-between p-3 mb-3 rounded-xl border text-sm" style={{background:"linear-gradient(90deg, rgba(118,185,0,0.08), rgba(30,61,59,0.06))", borderColor:"#76B900"}}>
        <div className="flex items-center gap-2">
          <Icon name="search" size={16} />
          <span className="font-semibold text-slate-900">Filtered: </span>
          <span className="text-slate-700">{
            alertFilter === "maint-overdue" ? `Showing ${sorted.length} asset${sorted.length === 1 ? "" : "s"} with overdue maintenance` :
            alertFilter === "maint-due" ? `Showing ${sorted.length} asset${sorted.length === 1 ? "" : "s"} with maintenance due soon` :
            alertFilter === "past-life" ? `Showing ${sorted.length} asset${sorted.length === 1 ? "" : "s"} past useful life` :
            alertFilter === "replace-5yr" ? `Showing ${sorted.length} asset${sorted.length === 1 ? "" : "s"} needing replacement within 5 years` :
            alertFilter === "no-maint" ? `Showing ${sorted.length} asset${sorted.length === 1 ? "" : "s"} with no maintenance schedule` :
            alertFilter === "no-service" ? `Showing ${sorted.length} asset${sorted.length === 1 ? "" : "s"} with no service history` :
            alertFilter === "warranty-exp" ? `Showing ${sorted.length} asset${sorted.length === 1 ? "" : "s"} with warranty expiring soon` :
            `Showing ${sorted.length} filtered asset${sorted.length === 1 ? "" : "s"}`
          }</span>
        </div>
        <button className="px-3 py-1.5 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white text-xs font-bold" onClick={() => setAlertFilter(null)}>Show all assets</button>
      </div>}
      {view === "assets" && assets.length === 0 && <div className="glass-card p-8 text-center" style={{background:"linear-gradient(135deg, rgba(118,185,0,0.06), rgba(255,255,255,0.98))"}}>
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#76B900]/15 flex items-center justify-center mb-4"><Icon name="plus" size={28} /></div>
        <div className="text-xl font-semibold text-slate-900">No equipment on file yet</div>
        <div className="text-sm text-slate-600 mt-2 max-w-lg mx-auto leading-relaxed">Start with a single item — a well, pump, tank, meter, or generator. You only need a name to begin. You can fill in cost, condition, and maintenance details later.</div>
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
          <button className="px-5 py-2.5 rounded-xl bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold flex items-center gap-2" onClick={openAddAsset}><Icon name="plus" /> Add your first asset</button>
          <button className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-2" onClick={() => setImportModalOpen(true)}><Icon name="database" size={16} /> Import from a spreadsheet</button>
          <button className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-2" onClick={() => startTutorial()}><Icon name="bookOpen" size={16} /> Take the tour</button>
        </div>
      </div>}
      {view === "assets" && assets.length > 0 && <div className="glass-card p-4"><div className="overflow-x-auto max-h-[70vh]"><table className="w-full text-sm sticky-header"><thead className="text-left text-slate-600"><tr>
        <th className="py-2 px-2 w-10"><input type="checkbox" checked={sorted.length > 0 && selected.size === sorted.length} onChange={(e) => toggleSelectAll(e.target.checked)} /></th>
        <SortableTH label="ID" field="id" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("id")} />
        <SortableTH label="Asset" field="assetName" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("assetName")} />
        <SortableTH label="Category" field="category" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("category")} />
        <SortableTH label="Status" field="status" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("status")} />
        <SortableTH label="Priority" field="priority" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("priority")} />
        <SortableTH label="Installed" field="installYear" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("installYear")} />
        <SortableTH label="Risk" field="risk" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("risk")} />
        <SortableTH label="Replace" field="replaceYear" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("replaceYear")} />
        <SortableTH label="Total Value" field="totalCost" sortBy={sortBy} sortDir={sortDir} onSort={() => toggleSort("totalCost")} />
        <th className="py-2 px-2">Actions</th>
      </tr></thead><tbody>
        {sorted.map(a => { const rb = riskBucket(a.risk); const prCls = a.priority === "Critical" ? "priority-critical" : a.priority === "High" ? "priority-high" : a.priority === "Medium" ? "priority-medium" : "priority-low"; const stCls = a.status === "Planning" ? "status-planning" : a.status === "Retired" ? "status-retired" : "status-active"; return <tr key={a.id} className={"border-t border-slate-100 hover:bg-slate-50"}>
          <td className="py-2 px-2"><input type="checkbox" checked={selected.has(a.id)} onChange={(e) => toggleSelected(a.id, e.target.checked)} /></td>
          <td className="py-2 px-2 font-mono text-xs text-slate-600">{a.id}</td>
          <td className="py-2 px-2">
            <div className="flex items-center gap-2">
              <div><div className="font-medium text-slate-900 cursor-pointer hover:text-[#1E3D3B] hover:underline" onClick={() => openDetailAsset(a)}>{a.assetName}</div><div className="text-xs text-slate-500">{a.location || "—"} • {a.type || "—"}</div></div>
              {/* FEATURE 2: Documentation link icons */}
              {(a.imageUrl || a.docUrl) && <div className="flex items-center gap-1 ml-2">
                {a.imageUrl && <a href={a.imageUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-[#f0f9e0] text-[#76B900]" title="View Photo"><Icon name="photo" size={14} /></a>}
                {a.docUrl && <a href={a.docUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-[#f0f9e0] text-[#76B900]" title="View Document"><Icon name="file" size={14} /></a>}
              </div>}
            </div>
            {a.maint && (a.maint.status === "overdue" || a.maint.status === "due") && <div className="mt-1 text-xs font-semibold text-amber-800">Maintenance {a.maint.status} • due {a.maint.dueDate}</div>}
          </td>
          <td className="py-2 px-2">{a.category || "—"}</td>
          <td className="py-2 px-2"><Chip label={a.status} cls={stCls} /></td>
          <td className="py-2 px-2"><Chip label={a.priority} cls={prCls} /></td>
          <td className="py-2 px-2 text-xs text-slate-600">{a.installDisplay || "—"}</td>
          <td className="py-2 px-2"><Chip label={a.risk == null ? "—" : `${a.risk}`} cls={rb.cls} /></td>
          <td className="py-2 px-2">{a.replaceYear || "—"}</td>
          <td className="py-2 px-2">{currencyFormatter.format(a.totalCost || 0)}</td>
          <td className="py-2 px-2"><div className="flex items-center gap-1">
            <button className="p-2 rounded-lg hover:bg-white border border-slate-200 flex items-center gap-1" title="View details" onClick={() => openDetailAsset(a)}><Icon name="eye" size={16} /><span className="hidden xl:inline text-xs font-semibold text-slate-600">View</span></button>
            <button className="p-2 rounded-lg hover:bg-white border border-slate-200 flex items-center gap-1" title="Edit" onClick={() => openEditAsset(a)}><Icon name="edit" size={16} /><span className="hidden xl:inline text-xs font-semibold text-slate-600">Edit</span></button>
            <button className="p-2 rounded-lg hover:bg-red-50 border border-slate-200 text-red-700 flex items-center gap-1" title="Delete" onClick={() => askDeleteAssets([a.id])}><Icon name="trash" size={16} /><span className="hidden xl:inline text-xs font-semibold">Del</span></button>
            <ActionMenu asset={a} onDuplicate={duplicateAsset} onPrintLabel={setLabelAsset} onMarkMaint={markMaintComplete} />
          </div></td>
        </tr>; })}
        {!sorted.length && <tr><td colSpan="11" className="py-10 text-center text-slate-500">No assets match your filters.</td></tr>}
      </tbody></table></div></div>}
      {/* Workers & Profiles panel - visible on Assets tab */}
      {view === "assets" && <div className="mt-4">
        <button onClick={() => setShowProfilesPanel(p => !p)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 w-full justify-between">
          <span className="flex items-center gap-2"><Icon name="gear" size={15} /> Workers, Overhead &amp; Maintenance Profiles</span>
          <span className="text-slate-400">{showProfilesPanel ? "▲" : "▼"}</span>
        </button>
        {showProfilesPanel && <div className="mt-3 space-y-4">
          {/* Labor Roles */}
          <div className="glass-card p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-base font-semibold text-slate-900 flex items-center">Labor Roles <HelpLink tab="definitions" scrollTo="def-labor" /></div><div className="text-sm text-slate-500 mt-0.5">Define salaried and hourly workers used in maintenance cost forecasts.</div></div><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={addLaborRole}>Add role</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-4"><SettingField label="Default burden %" value={financial.assumptions?.defaultBurdenPercent ?? 25} onChange={(v) => updateFinancialAssumptions({ defaultBurdenPercent: toFloat(v) ?? 0 })} /><SettingField label="Labor escalation %" value={financial.assumptions?.laborEscalationRate ?? 3} onChange={(v) => updateFinancialAssumptions({ laborEscalationRate: toFloat(v) ?? 0 })} /><SettingField label="Working hours / year" value={financial.assumptions?.workingHoursPerYear ?? 2080} onChange={(v) => updateFinancialAssumptions({ workingHoursPerYear: toFloat(v) ?? 2080 })} /><SettingField label="Default overhead %" value={financial.assumptions?.defaultOverheadPercent ?? 15} onChange={(v) => updateFinancialAssumptions({ defaultOverheadPercent: toFloat(v) ?? 0 })} /><div><label className="text-xs font-semibold text-slate-700 uppercase">Default overhead allocation</label><select value={financial.assumptions?.defaultOverheadAllocationMode || "percent-of-labor"} onChange={(e) => updateFinancialAssumptions({ defaultOverheadAllocationMode: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="percent-of-labor">Percent of labor</option><option value="percent-of-direct-maintenance">Percent of direct maint.</option><option value="flat-annual">Flat annual</option></select></div></div>
          <div className="mt-4 space-y-3">{laborRoles.map(role => { const loadedRate = getRoleLoadedHourlyRate(role, financial.assumptions); return <div key={role.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50"><div className="flex items-start justify-between gap-3"><div className="font-semibold text-slate-900">{role.name || "Labor Role"}</div><button className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold" onClick={() => removeLaborRole(role.id)}>Remove</button></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3"><div><label className="text-xs font-semibold text-slate-700 uppercase">Role name</label><input value={role.name || ""} onChange={(e) => updateLaborRole(role.id, { name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div><div><label className="text-xs font-semibold text-slate-700 uppercase">Pay type</label><select value={role.payType || "salary"} onChange={(e) => updateLaborRole(role.id, { payType: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="salary">Salary</option><option value="hourly">Hourly</option></select></div><SettingField label={role.payType === "hourly" ? "Hourly rate" : "Annual salary"} value={role.payType === "hourly" ? role.hourlyRate : role.annualSalary} onChange={(v) => updateLaborRole(role.id, role.payType === "hourly" ? { hourlyRate: toFloat(v) ?? 0 } : { annualSalary: toFloat(v) ?? 0 })} /><SettingField label="Burden %" value={role.burdenPercent ?? 25} onChange={(v) => updateLaborRole(role.id, { burdenPercent: toFloat(v) ?? 0 })} /><SettingField label="Hours / year" value={role.annualHours ?? 2080} onChange={(v) => updateLaborRole(role.id, { annualHours: toFloat(v) ?? 2080 })} /><SettingField label="FTE count" value={role.defaultFte ?? 1} onChange={(v) => updateLaborRole(role.id, { defaultFte: toFloat(v) ?? 1 })} /><SettingField label="OT multiplier" value={role.overtimeMultiplier ?? 1.5} onChange={(v) => updateLaborRole(role.id, { overtimeMultiplier: toFloat(v) ?? 1.5 })} /><div className="flex items-end"><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={role.active !== false} onChange={(e) => updateLaborRole(role.id, { active: e.target.checked })} /> Active in forecast</label></div></div><div className="mt-2 text-xs text-slate-500">Loaded hourly rate: <span className="font-semibold text-slate-900">{currencyFormatter.format(Math.round((loadedRate || 0) * 100) / 100)}</span></div></div>; })}{!laborRoles.length && <div className="text-sm text-slate-500 py-3">No labor roles defined yet.</div>}</div></div>
          {/* Overhead Categories */}
          <div className="glass-card p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-base font-semibold text-slate-900">Overhead Categories</div><div className="text-sm text-slate-500 mt-0.5">Fixed and variable overhead costs applied to operating forecasts.</div></div><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={addOverheadCategory}>Add category</button></div>
          <div className="mt-4 space-y-3">{overheadCategories.map(cat => <div key={cat.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50"><div className="flex items-start justify-between gap-3"><div className="font-semibold text-slate-900">{cat.name || "Overhead"}</div><button className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold" onClick={() => removeOverheadCategory(cat.id)}>Remove</button></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3"><div><label className="text-xs font-semibold text-slate-700 uppercase">Name</label><input value={cat.name || ""} onChange={(e) => updateOverheadCategory(cat.id, { name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div><div><label className="text-xs font-semibold text-slate-700 uppercase">Cost type</label><select value={cat.costType || "flat-annual"} onChange={(e) => updateOverheadCategory(cat.id, { costType: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="flat-annual">Flat annual</option><option value="flat-monthly">Flat monthly</option><option value="percent-of-labor">% of labor</option><option value="percent-of-direct-maintenance">% of direct maint.</option></select></div>{["flat-annual"].includes(cat.costType) && <SettingField label="Annual amount" value={cat.annualAmount ?? 0} onChange={(v) => updateOverheadCategory(cat.id, { annualAmount: toFloat(v) ?? 0 })} />}{cat.costType === "flat-monthly" && <SettingField label="Monthly amount" value={cat.monthlyAmount ?? 0} onChange={(v) => updateOverheadCategory(cat.id, { monthlyAmount: toFloat(v) ?? 0 })} />}{["percent-of-labor","percent-of-direct-maintenance"].includes(cat.costType) && <SettingField label="Percent %" value={cat.percent ?? 0} onChange={(v) => updateOverheadCategory(cat.id, { percent: toFloat(v) ?? 0 })} />}<SettingField label="Escalation % / yr" value={cat.escalationRate ?? 3} onChange={(v) => updateOverheadCategory(cat.id, { escalationRate: toFloat(v) ?? 0 })} /></div></div>)}{!overheadCategories.length && <div className="text-sm text-slate-500 py-3">No overhead categories yet.</div>}</div></div>
          {/* Maintenance Profiles */}
          <div className="glass-card p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-base font-semibold text-slate-900 flex items-center">Maintenance Profiles <HelpLink tab="definitions" scrollTo="def-maintprofile" /></div><div className="text-sm text-slate-500 mt-0.5">Reusable recurring maintenance assumptions you can assign to assets.</div></div><button className="px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={addMaintenanceProfile}>Add profile</button></div>
          <div className="mt-4 space-y-3">{maintenanceProfiles.map(profile => <div key={profile.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50"><div className="flex items-start justify-between gap-3"><div className="font-semibold text-slate-900">{profile.name || "Maintenance Profile"}</div><button className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold" onClick={() => removeMaintenanceProfile(profile.id)}>Remove</button></div><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3"><div><label className="text-xs font-semibold text-slate-700 uppercase">Profile name</label><input value={profile.name || ""} onChange={(e) => updateMaintenanceProfile(profile.id, { name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div><div><label className="text-xs font-semibold text-slate-700 uppercase">Asset category</label><select value={profile.assetCategory || "Other"} onChange={(e) => updateMaintenanceProfile(profile.id, { assetCategory: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div><SettingField label="Service frequency (months)" value={profile.serviceFrequencyMonths ?? 12} onChange={(v) => updateMaintenanceProfile(profile.id, { serviceFrequencyMonths: toInt(v) ?? 12 })} /><div><label className="text-xs font-semibold text-slate-700 uppercase">Default labor role</label><select value={profile.defaultLaborRoleId || ""} onChange={(e) => updateMaintenanceProfile(profile.id, { defaultLaborRoleId: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="">None</option>{laborRoles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div><SettingField label="Labor hours / occurrence" value={profile.defaultLaborHours ?? 0} onChange={(v) => updateMaintenanceProfile(profile.id, { defaultLaborHours: toFloat(v) ?? 0 })} /><SettingField label="Materials / occurrence" value={profile.defaultMaterialsCost ?? 0} onChange={(v) => updateMaintenanceProfile(profile.id, { defaultMaterialsCost: toFloat(v) ?? 0 })} /><SettingField label="Contractor / occurrence" value={profile.defaultContractorCost ?? 0} onChange={(v) => updateMaintenanceProfile(profile.id, { defaultContractorCost: toFloat(v) ?? 0 })} /><div><label className="text-xs font-semibold text-slate-700 uppercase">Overhead mode</label><select value={profile.defaultOverheadMode || "use-system-default"} onChange={(e) => updateMaintenanceProfile(profile.id, { defaultOverheadMode: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option value="use-system-default">Use system default</option><option value="none">None</option><option value="manual">Manual</option></select></div>{profile.defaultOverheadMode === "manual" && <SettingField label="Manual overhead" value={profile.defaultOverheadAmount ?? 0} onChange={(v) => updateMaintenanceProfile(profile.id, { defaultOverheadAmount: toFloat(v) ?? 0 })} />}</div></div>)}{!maintenanceProfiles.length && <div className="text-sm text-slate-500 py-3">No maintenance profiles yet. Assign profiles to assets to model recurring costs in forecasts.</div>}</div></div>
        </div>}
      </div>}
      {/* Service View */}
      {/* Service & Calendar sub-nav */}
      {["service","calendar"].includes(view) && <div className="flex gap-0 mb-1 border-b border-slate-200 no-print">
        {[["service","Service Log"],["calendar","Maintenance Calendar"]].map(([k,lbl]) => (
          <button key={k} onClick={() => setView(k)} className={"px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors " + (view===k ? "border-[#1E3D3B] text-[#1E3D3B]" : "border-transparent text-slate-500 hover:text-slate-800")}>{lbl}</button>
        ))}
      </div>}
      {view === "service" && <div className="space-y-4"><div className="glass-card p-4 border border-sky-200 bg-sky-50"><div className="text-sm font-semibold text-sky-900">Service records completed maintenance activity.</div><div className="text-sm text-sky-800 mt-1">Use Service to document completed maintenance, repairs, labor hours, vendors, and costs after the work has been performed.</div></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{(() => { const entries = serviceFiltered; const totalCost = entries.reduce((s, e) => s + (toFloat(e.cost) ?? 0), 0); const totalHours = entries.reduce((s, e) => s + (toFloat(e.hours) ?? 0), 0); const uniqueAssets = new Set(entries.map(e => e.assetId)).size; return <><div className="glass-card p-3"><div className="text-xs font-medium text-slate-500 uppercase">Entries</div><div className="text-xl font-semibold text-slate-900">{entries.length}</div></div><div className="glass-card p-3"><div className="text-xs font-medium text-slate-500 uppercase">Total cost</div><div className="text-xl font-semibold text-slate-900">{currencyFormatter.format(totalCost)}</div></div><div className="glass-card p-3"><div className="text-xs font-medium text-slate-500 uppercase">Total hours</div><div className="text-xl font-semibold text-slate-900">{numberFormatter.format(totalHours)}</div></div><div className="glass-card p-3"><div className="text-xs font-medium text-slate-500 uppercase">Assets serviced</div><div className="text-xl font-semibold text-slate-900">{uniqueAssets}</div></div></>; })()}</div><div className="glass-card p-4"><div className="overflow-x-auto max-h-[70vh]"><table className="w-full text-sm sticky-header"><thead className="text-left text-slate-600"><tr><SortableTH label="Date" field="date" sortBy={serviceSortBy} sortDir={serviceSortDir} onSort={() => toggleServiceSort("date")} /><SortableTH label="Asset" field="assetName" sortBy={serviceSortBy} sortDir={serviceSortDir} onSort={() => toggleServiceSort("assetName")} /><SortableTH label="Type" field="type" sortBy={serviceSortBy} sortDir={serviceSortDir} onSort={() => toggleServiceSort("type")} /><th className="py-2 px-2">Vendor</th><SortableTH label="Cost" field="cost" sortBy={serviceSortBy} sortDir={serviceSortDir} onSort={() => toggleServiceSort("cost")} /><th className="py-2 px-2">Hours</th><th className="py-2 px-2">Notes</th><th className="py-2 px-2">Actions</th></tr></thead><tbody>
        {serviceFiltered.slice().sort((a,b) => { const dir = serviceSortDir === "asc" ? 1 : -1; const av = a[serviceSortBy] ?? ""; const bv = b[serviceSortBy] ?? ""; if (typeof av === "number" || typeof bv === "number") return ((av || 0) - (bv || 0)) * dir; return String(av).localeCompare(String(bv)) * dir; }).map(e => <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
          <td className="py-2 px-2 font-mono text-xs">{e.date || "—"}</td><td className="py-2 px-2"><div className="font-semibold text-slate-900">{e.assetName || "—"}</div><div className="text-xs text-slate-500">{e.assetId || "—"}</div></td><td className="py-2 px-2">{e.type || "—"}</td><td className="py-2 px-2">{e.vendor || "—"}</td><td className="py-2 px-2">{e.cost != null ? currencyFormatter.format(e.cost) : "—"}</td><td className="py-2 px-2">{e.hours != null ? e.hours : "—"}</td><td className="py-2 px-2 max-w-[360px] truncate" title={e.notes || ""}>{e.notes || "—"}</td>
          <td className="py-2 px-2"><div className="flex items-center gap-2"><button className="p-2 rounded-lg hover:bg-white border border-slate-200" title="Edit" onClick={() => { setEditService(e); setServiceModalOpen(true); }}><Icon name="edit" /></button><button className="p-2 rounded-lg hover:bg-red-50 border border-slate-200 text-red-700" title="Delete" onClick={() => deleteServiceEntry(e.id)}><Icon name="trash" /></button></div></td>
        </tr>)}
        {!serviceFiltered.length && <tr><td colSpan="8" className="py-10 text-center text-slate-500">No service entries yet.</td></tr>}
      </tbody></table></div></div></div>}
      {/* FEATURE 4: Calendar View */}
      {view === "calendar" && <CalendarView assets={activeAssets} onOpenAsset={openDetailAsset} />}
      {/* History View */}
      {view === "history" && <div className="glass-card p-5"><div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5"><div className="flex items-center gap-3 flex-1 flex-wrap"><div className="relative flex-1 max-w-md"><div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" /></div><input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="Search history..."/></div><select value={historyActionFilter} onChange={(e) => setHistoryActionFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm font-semibold"><option value="All">All actions</option><option value="created">Created</option><option value="updated">Updated</option><option value="deleted">Deleted</option><option value="maintenance">Maintenance</option></select><div className="flex items-center gap-1"><label className="text-xs font-bold text-slate-500">From</label><input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-sm" /></div><div className="flex items-center gap-1"><label className="text-xs font-bold text-slate-500">To</label><input type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-sm" /></div>{(historyDateFrom || historyDateTo) && <button className="text-xs text-slate-500 hover:text-slate-700 underline" onClick={() => { setHistoryDateFrom(""); setHistoryDateTo(""); }}>Clear dates</button>}</div><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={() => { setHistory([]); showToast("History cleared", "warn"); }}>Clear history</button></div>
        {(() => { const hs = historySearch.trim().toLowerCase(); const filteredHistory = history.slice(0, 5000).filter(h => historyActionFilter === "All" || h.action === historyActionFilter).filter(h => !hs || (h.assetName || "").toLowerCase().includes(hs) || (h.assetId || "").toLowerCase().includes(hs)).filter(h => { if (!historyDateFrom && !historyDateTo) return true; const ts = h.timestamp ? h.timestamp.substring(0, 10) : ""; if (historyDateFrom && ts < historyDateFrom) return false; if (historyDateTo && ts > historyDateTo) return false; return true; }); return <><div className="text-sm text-slate-600 mb-3">Showing {Math.min(filteredHistory.length, 2000)} of {history.length} entries.</div>{filteredHistory.length ? <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">{filteredHistory.slice(0, 2000).map((h, idx) => <div key={h.id || idx} className="history-item"><div className={`history-dot ${h.action}`}></div><div className="bg-slate-50 rounded-xl p-4 border border-slate-100"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div className="flex items-center flex-wrap gap-2"><span className={`text-xs font-semibold px-2 py-1 rounded ${h.action === "created" ? "bg-emerald-100 text-emerald-800" : h.action === "updated" ? "bg-blue-100 text-blue-800" : h.action === "maintenance" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{String(h.action || "").toUpperCase()}</span><span className="text-sm font-bold text-slate-900">{h.assetName || "—"}</span><span className="text-xs text-slate-500 font-mono">({h.assetId || "—"})</span></div><div className="text-xs text-slate-500">{formatDateTime(h.timestamp)}</div></div>{h.changes && <div className="mt-2 text-xs text-slate-700"><div className="font-bold uppercase text-slate-500">Changes</div><div className="mt-1">{Object.entries(h.changes).slice(0, 12).map(([k, v]) => <div key={k} className="mt-0.5"><span className="font-semibold">{k}</span>: <span className="text-slate-600">{String(v.from ?? "—")}</span> → <span className="text-slate-900 font-semibold">{String(v.to ?? "—")}</span></div>)}</div></div>}{h.snapshot && (h.snapshot.before || h.snapshot.after) && <div className="mt-2"><button className="px-3 py-1.5 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white text-xs font-bold flex items-center gap-1" onClick={() => setConfirm({ open: true, title: "Restore this version?", body: `This will restore "${h.assetName || "this asset"}" to the state it was in at ${formatDateTime(h.timestamp)}. If the asset currently exists, it will be overwritten.`, danger: false, confirmText: "Restore", onConfirm: () => { restoreFromHistory(h); setConfirm({ open: false }); }, onCancel: () => setConfirm({ open: false }) })}><Icon name="refresh" size={12} /> Restore this version</button></div>}</div></div>)}</div> : <div className="text-slate-500 text-sm">No history entries match your filters.</div>}</>; })()}
      </div>}
      {/* Reports View */}
      {view === "reports" && <div className="space-y-4">
        {/* Print Header - only visible when printing */}
        <div className="print-header items-center justify-between p-4 rounded-xl" style={{background:"#1E3D3B",color:"white"}}>
          <div>
            <div className="text-xl font-bold">{settings.orgName || "Water System"}</div>
            <div className="text-sm opacity-80">{APP_NAME} • Asset Management Report</div>
          </div>
          <div className="text-right text-sm">
            {settings.pwsId && <div>PWS ID: {settings.pwsId}</div>}
            <div>Generated {new Date().toLocaleDateString()}</div>
          </div>
        </div>
        {/* KPI Summary */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between gap-3 no-print">
            <div><div className="text-lg font-semibold text-slate-900">System Summary</div><div className="text-sm text-slate-600">Key performance indicators for your water system.</div></div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={() => exportExcel()}>Export Excel</button>
              <button className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold flex items-center gap-2" onClick={exportPDF}><Icon name="file" size={14} /> Export PDF</button>
              <button className="px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold" onClick={() => window.print()}>Print report</button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ReportCard label="Active assets" value={numberFormatter.format(stats.totalQty)} />
            <ReportCard label="Replacement value" value={currencyFormatter.format(stats.value)} />
            <ReportCard label="Avg condition" value={`${stats.avgCond.toFixed(1)} / 5`} />
            <ReportCard label="High-risk (≥60)" value={numberFormatter.format(stats.highRisk)} />
            <ReportCard label="Maintenance overdue" value={numberFormatter.format(stats.maintOverdue)} />
            <ReportCard label="Replace ≤5 yrs" value={numberFormatter.format(stats.replace5)} />
            <ReportCard label="Past useful life" value={numberFormatter.format(stats.pastLife)} />
            <ReportCard label="Retired" value={numberFormatter.format(stats.retiredCount)} />
          </div>
          {settings.showDepreciation && <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ReportCard label="Depreciated value" value={currencyFormatter.format(stats.deprec)} />
            <ReportCard label="Planning" value={numberFormatter.format(stats.planningCount)} />
            <ReportCard label="Warranty expiring" value={numberFormatter.format(stats.warrantyExp)} />
            <ReportCard label="Total (all statuses)" value={numberFormatter.format(stats.totalAll)} />
          </div>}
        </div>
        {/* Financial Assumptions */}
        <div className="glass-card p-5 no-print">
          <div className="text-lg font-semibold text-slate-900">Report Settings &amp; Financial Assumptions</div>
          <div className="text-sm text-slate-600 mt-1">Edit directly here. Changes apply everywhere (Settings, Forecast, etc.).</div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase">Organization name</label><input value={settings.orgName || ""} onChange={(e) => setSettings(prev => ({ ...prev, orgName: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase">PWS ID</label><input value={settings.pwsId || ""} onChange={(e) => setSettings(prev => ({ ...prev, pwsId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="e.g., OK2012345"/></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase">Inflation %</label><input value={settings.inflationRate ?? 3} onChange={(e) => setSettings(prev => ({ ...prev, inflationRate: toFloat(e.target.value) ?? 0 }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" /></div>
            <FormattedDollarInput label="Annual budget" value={settings.annualBudget ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, annualBudget: v }))} />
            <FormattedDollarInput label="Starting reserve" value={settings.reserveBalance ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, reserveBalance: v }))} />
            <FormattedDollarInput label="Annual contribution" value={settings.annualContribution ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, annualContribution: v }))} />
            <FormattedDollarInput label="Annual grant funding" value={settings.annualGrantFunding ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, annualGrantFunding: v }))} />
            <div><label className="text-xs font-medium text-slate-600 uppercase">Reserve interest %</label><input value={settings.reserveInterestRate ?? 0} onChange={(e) => setSettings(prev => ({ ...prev, reserveInterestRate: toFloat(e.target.value) ?? 0 }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase">Scenario</label><select value={settings.scenarioMode || "Standard"} onChange={(e) => setSettings(prev => ({ ...prev, scenarioMode: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option>Standard</option><option>Conservative</option><option>Aggressive</option></select></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase">Depreciation method</label><select value={settings.depreciationMethod || "straight-line"} onChange={(e) => setSettings(prev => ({ ...prev, depreciationMethod: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">{DEPRECIATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
          </div>
        </div>
        {/* Print-only assumptions (static text) */}
        <div className="print-header glass-card p-5" style={{background:"white",color:"#0f172a"}}>
          <div className="text-lg font-semibold text-slate-900">Financial Assumptions</div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
            <Assumption label="Inflation" value={`${settings.inflationRate}%`} />
            <Assumption label="Annual budget" value={currencyFormatter.format(toFloat(settings.annualBudget) ?? 0)} />
            <Assumption label="Reserve" value={currencyFormatter.format(toFloat(settings.reserveBalance) ?? 0)} />
            <Assumption label="Contribution" value={currencyFormatter.format(toFloat(settings.annualContribution) ?? 0)} />
            <Assumption label="Scenario" value={settings.scenarioMode || "Standard"} />
            <Assumption label="Labor roles" value={String(laborRoles.length)} />
            <Assumption label="Overhead categories" value={String(overheadCategories.length)} />
            <Assumption label="Depreciation" value={(DEPRECIATION_METHODS.find(m => m.value === settings.depreciationMethod) || {}).label || "Straight-Line"} />
          </div>
        </div>
        {/* Breakdowns */}
        {forecastMode === "Advanced" && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print-break-before">
          <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900">Category breakdown</div><div className="text-sm text-slate-600">Replacement value by category.</div><div className="mt-4"><BreakdownTable rows={CATEGORIES.map(cat => { const items = activeAssets.filter(a => (a.category || "Other") === cat); const value = items.reduce((s, a) => s + (a.totalCost || 0), 0); return { label: cat, count: items.length, value }; }).filter(r => r.count > 0).sort((a,b) => b.value - a.value)} /></div></div>
          <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900">Priority breakdown</div><div className="text-sm text-slate-600">Replacement value by priority.</div><div className="mt-4"><BreakdownTable rows={PRIORITIES.map(p => { const items = activeAssets.filter(a => (a.priority || "Medium") === p); const value = items.reduce((s, a) => s + (a.totalCost || 0), 0); return { label: p, count: items.length, value }; }).filter(r => r.count > 0).sort((a,b) => b.value - a.value)} /></div></div>
          <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900">Condition breakdown</div><div className="text-sm text-slate-600">Asset count and value by condition rating.</div><div className="mt-4"><BreakdownTable rows={CONDITIONS.map(c => { const items = activeAssets.filter(a => toInt(a.condition) === c.value); const value = items.reduce((s, a) => s + (a.totalCost || 0), 0); return { label: `${c.value} - ${c.label}`, count: items.length, value }; }).filter(r => r.count > 0)} /></div></div>
          <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900">Status breakdown</div><div className="text-sm text-slate-600">All assets by current status.</div><div className="mt-4"><BreakdownTable rows={STATUSES.map(s => { const items = enriched.filter(a => (a.status || "Active") === s); const value = items.reduce((sum, a) => sum + (a.totalCost || 0), 0); return { label: s, count: items.length, value }; }).filter(r => r.count > 0)} /></div></div>
        </div>}
        {/* Print Footer */}
        <div className="print-footer">{settings.orgName || "Water System"} • {APP_NAME} v{APP_VERSION} • {settings.pwsId || ""} • Printed {new Date().toLocaleDateString()}</div>
      </div>}

      {/* 5-Year Forecast View (CIP) */}
      {view === "forecast" && <div className="space-y-4">
        {/* Print Header */}
        <div className="print-header items-center justify-between p-4 rounded-xl" style={{background:"#1E3D3B",color:"white"}}>
          <div>
            <div className="text-xl font-bold">{settings.orgName || "Water System"}</div>
            <div className="text-sm opacity-80">{APP_NAME} • {forecastHorizon}-Year Capital + Operating Forecast</div>
          </div>
          <div className="text-right text-sm">
            {settings.pwsId && <div>PWS ID: {settings.pwsId}</div>}
            <div>Generated {new Date().toLocaleDateString()}</div>
          </div>
        </div>
        {(missingProjectionFields > 0 || duplicateGroups.length > 0) && <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">{missingProjectionFields > 0 && <div>{missingProjectionFields} active asset(s) missing key forecast fields (replacement cost or lifecycle data).</div>}{duplicateGroups.length > 0 && <div className="mt-1">{duplicateGroups.length} possible duplicate asset group(s) detected. Review before trusting totals.</div>}</div>}
        {/* Plain-English Forecast Summary */}
        {fiveYearCIP.length > 0 && <div className="glass-card p-5" style={{borderLeft:"4px solid #76B900"}}>
          <div className="flex items-center gap-2 mb-2"><div className="text-lg font-semibold text-slate-900">Bottom Line</div><HelpLink tab="definitions" scrollTo="def-funded" /></div>
          <div className="text-sm text-slate-800 leading-relaxed">{(() => {
            const orgName = settings.orgName || "Your water system";
            const totalNeed = fiveYearNeed;
            const avgAnnual = totalNeed / (forecastHorizon || 1);
            const gap = fiveYearGap;
            const funded = fiveYearFunded;
            const endReserve = fiveYearEndingReserve;
            const annualFunding = (toFloat(settings.annualContribution) ?? 0) + (toFloat(settings.annualGrantFunding) ?? 0);
            const lines = [];
            lines.push(`Over the next ${forecastHorizon} years, ${orgName} needs an estimated ${currencyFormatter.format(totalNeed)} in combined capital and operating cost, averaging ${currencyFormatter.format(Math.round(avgAnnual))} per year.`);
            if (annualFunding > 0) {
              if (gap <= 0) lines.push(`At current funding levels (${currencyFormatter.format(annualFunding)}/year in contributions and grants), the projected need is fully covered with a reserve balance of ${currencyFormatter.format(endReserve)} at the end of the period.`);
              else lines.push(`At current funding levels (${currencyFormatter.format(annualFunding)}/year in contributions and grants), there is an unfunded gap of ${currencyFormatter.format(gap)}. To close this gap, consider increasing annual contributions, pursuing additional grant funding, phasing replacements, or adjusting rate structures.`);
            } else {
              lines.push(`No annual contributions or grant funding are currently configured. Without a funding plan, the full ${currencyFormatter.format(totalNeed)} would need to come from reserves or emergency funding. Set up contributions in the parameters below to model a funding strategy.`);
            }
            if (stats.maintOverdue > 0) lines.push(`Note: ${stats.maintOverdue} asset${stats.maintOverdue === 1 ? " is" : "s are"} currently overdue for maintenance, which may accelerate replacement timelines.`);
            return lines.join(" ");
          })()}</div>
        </div>}
        {/* Forecast Controls */}
        <div className="glass-card p-5 no-print">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><div><div className="text-lg font-semibold text-slate-900">Forecast mode</div><div className="text-sm text-slate-600">Basic keeps the screen focused. Advanced shows the full planning detail.</div></div><div className="flex flex-wrap gap-2"><button className={`px-4 py-2 rounded-lg font-semibold border ${forecastMode === "Basic" ? "bg-[#1E3D3B] text-white border-[#1E3D3B]" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`} onClick={() => setForecastMode("Basic")}>Basic</button><button className={`px-4 py-2 rounded-lg font-semibold border ${forecastMode === "Advanced" ? "bg-[#76B900] text-white border-[#76B900]" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`} onClick={() => setForecastMode("Advanced")}>Advanced</button></div></div>
          <div className="flex items-center justify-between mb-4">
            <div><div className="flex items-center gap-2"><div className="text-lg font-semibold text-slate-900">Forecast Parameters</div><HelpLink tab="definitions" scrollTo="def-forecast" /></div><div className="text-sm text-slate-600">Adjust planning horizon and financial assumptions.</div></div>
            <button className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-600" onClick={() => setView("settings")}>Open full settings</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div><label className="text-xs font-medium text-slate-600 uppercase">Start year</label><input type="number" value={forecastStartYear} onChange={(e) => setForecastStartYear(toInt(e.target.value) || new Date().getFullYear())} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" min="2000" max="2100" /></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase">Horizon</label><select value={forecastHorizon} onChange={(e) => setForecastHorizon(toInt(e.target.value) || 5)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">{[3,5,7,10,15,20,25,30].map(v => <option key={v} value={v}>{v} years</option>)}</select></div>
            <div><label className="text-xs font-medium text-slate-600 uppercase">Inflation %</label><input value={settings.inflationRate ?? 3} onChange={(e) => setSettings(prev => ({ ...prev, inflationRate: toFloat(e.target.value) ?? 0 }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" /></div>
            <FormattedDollarInput label="Annual budget" value={settings.annualBudget ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, annualBudget: v }))} />
            <div><label className="text-xs font-medium text-slate-600 uppercase">Scenario</label><select value={settings.scenarioMode || "Standard"} onChange={(e) => setSettings(prev => ({ ...prev, scenarioMode: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option>Standard</option><option>Conservative</option><option>Aggressive</option></select></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
            <FormattedDollarInput label="Starting reserve" value={settings.reserveBalance ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, reserveBalance: v }))} />
            <FormattedDollarInput label="Annual contribution" value={settings.annualContribution ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, annualContribution: v }))} />
            <FormattedDollarInput label="Annual grant funding" value={settings.annualGrantFunding ?? 0} onChange={(v) => setSettings(prev => ({ ...prev, annualGrantFunding: v }))} />
            <div><label className="text-xs font-medium text-slate-600 uppercase">Reserve interest %</label><input value={settings.reserveInterestRate ?? 0} onChange={(e) => setSettings(prev => ({ ...prev, reserveInterestRate: toFloat(e.target.value) ?? 0 }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" /></div>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="glass-card p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ReportCard label={`${forecastHorizon}-Year Total Need`} value={currencyFormatter.format(fiveYearNeed)} />
            <ReportCard label={`${forecastHorizon}-Year Capital Need`} value={currencyFormatter.format(fiveYearCapitalNeed)} />
            <ReportCard label={`${forecastHorizon}-Year Operating Need`} value={currencyFormatter.format(fiveYearOperatingNeed)} />
            <ReportCard label="Funded (model)" value={currencyFormatter.format(fiveYearFunded)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
            <div className="p-3 rounded-xl border" style={{background:"rgba(123,200,229,0.1)",borderColor:"rgba(123,200,229,0.3)"}}><div className="text-xs font-bold uppercase" style={{color:"#287575"}}>Avg annual need</div><div className="text-xl font-semibold text-slate-900 mt-1">{currencyFormatter.format(fiveYearNeed / (forecastHorizon || 1))}</div></div>
            <div className="p-3 rounded-xl border" style={{background:"rgba(30,61,59,0.06)",borderColor:"rgba(30,61,59,0.15)"}}><div className="text-xs font-medium text-slate-500 uppercase">Labor</div><div className="text-xl font-semibold text-slate-900 mt-1">{currencyFormatter.format(fiveYearLaborNeed)}</div></div>
            <div className="p-3 rounded-xl border" style={{background:"rgba(118,185,0,0.08)",borderColor:"rgba(118,185,0,0.22)"}}><div className="text-xs font-bold uppercase" style={{color:"#476b00"}}>Maintenance</div><div className="text-xl font-semibold text-slate-900 mt-1">{currencyFormatter.format(fiveYearMaintenanceNeed)}</div></div>
            <div className="p-3 rounded-xl border" style={{background:"rgba(212,217,106,0.12)",borderColor:"rgba(212,217,106,0.35)"}}><div className="text-xs font-bold uppercase" style={{color:"#7a7d10"}}>Overhead</div><div className="text-xl font-semibold text-slate-900 mt-1">{currencyFormatter.format(fiveYearOverheadNeed)}</div></div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-100"><div className="text-xs font-bold text-red-700 uppercase">Unfunded gap</div><div className="text-xl font-semibold text-red-900 mt-1">{currencyFormatter.format(fiveYearGap)}</div><div className="text-xs font-semibold text-red-800">Ending reserve {currencyFormatter.format(fiveYearEndingReserve)}</div></div>
            <div className="p-3 rounded-xl border" style={{background:"rgba(30,61,59,0.06)",borderColor:"rgba(30,61,59,0.15)"}}><div className="text-xs font-medium text-slate-500 uppercase">Scenario</div><div className="text-xl font-semibold text-slate-900 mt-1">{settings.scenarioMode || "Standard"}</div></div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <div className="text-sm font-bold text-slate-900 mb-3">Funding vs need (stacked)</div>
            <FiveYearFundingChart funding={fiveYearFunding} />
          </div>
          <div className="glass-card p-5">
            <div className="text-sm font-bold text-slate-900 mb-3">Total need vs reserve</div>
            <ProjectionChart rows={fiveYearCIP.map(r => ({ ...r, cost: r.totalCost, reserve: r.endingReserve }))} />
          </div>
        </div>

        {forecastMode === "Advanced" && <div className="glass-card p-4 print-break-before">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div><div className="text-lg font-semibold text-slate-900">Year-by-year detail</div><div className="text-sm text-slate-600">Capital, labor, maintenance, and overhead by year with funding and reserve status.</div></div>
            <button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold flex items-center gap-2" onClick={() => { const budget = toFloat(settings.annualBudget) ?? 0; const rows = fiveYearCIP.map(r => { const status = budget > 0 ? ((r.totalCost || 0) > budget ? "Funding Gap" : "Within Budget") : ""; return { Year: r.year, "Total Need": r.totalCost, "Capital Need": r.capitalNeed, "Operating Need": r.operatingNeed, "Labor Need": r.laborNeed, "Maintenance Need": r.maintenanceNeed, "Overhead Need": r.overheadNeed, Funded: r.funded, "Funded Operating": r.fundedOperating, "Funded Capital": r.fundedCapital, Shortfall: r.shortfall, "Reserve Balance": r.endingReserve, "Annual Budget": budget || "", "Budget Status": status, "High Completeness": r.highConfidenceCount, "Low Completeness": r.lowConfidenceCount }; }); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(rows); ws["!cols"] = [{wch:8},{wch:16},{wch:16},{wch:16},{wch:14},{wch:18},{wch:14},{wch:12},{wch:18},{wch:16},{wch:14},{wch:16},{wch:14},{wch:14},{wch:16},{wch:16}]; XLSX.utils.book_append_sheet(wb, ws, "Forecast Detail"); XLSX.writeFile(wb, `OkaVlhpisa_Forecast_${forecastHorizon}yr_${isoDate()}.xlsx`); showToast("Forecast detail exported"); }}><Icon name="download" size={16} /> Export detail</button>
          </div>
          <div className="overflow-x-auto max-h-[50vh]"><table className="w-full text-sm sticky-header"><thead className="text-left text-slate-600"><tr><th className="py-2 px-2">Year</th><th className="py-2 px-2">Total need</th><th className="py-2 px-2">Funding / reserve</th><th className="py-2 px-2">Budget status</th></tr></thead><tbody>
            {fiveYearCIP.map(r => { const budget = toFloat(settings.annualBudget) ?? 0; const status = budget > 0 ? ((r.totalCost || 0) > budget ? "gap" : "ok") : "n/a"; return <tr key={r.year} className="border-t border-slate-100"><td className="py-2 px-2 font-mono text-xs font-semibold">{r.year}</td><td className="py-2 px-2">{currencyFormatter.format(r.totalCost || 0)}<div className="text-[11px] text-slate-500">Capital {currencyFormatter.format(r.capitalNeed || 0)} · Operating {currencyFormatter.format(r.operatingNeed || 0)}</div><div className="text-[11px] text-slate-500">Labor {currencyFormatter.format(r.laborNeed || 0)} · Maint. {currencyFormatter.format(r.maintenanceNeed || 0)} · Overhead {currencyFormatter.format(r.overheadNeed || 0)}</div></td><td className={`py-2 px-2 ${(r.endingReserve || 0) < 0 ? "text-red-700 font-semibold" : ""}`}>{currencyFormatter.format(r.endingReserve || 0)}<div className="text-[11px] text-slate-500">Funded {currencyFormatter.format(r.funded || 0)} · Shortfall {currencyFormatter.format(r.shortfall || 0)}</div><div className="text-[11px] text-slate-500">Deferred in {currencyFormatter.format(r.deferredIn || 0)}</div></td><td className="py-2 px-2">{status === "n/a" ? <span className="text-slate-500 text-xs">Set budget in Settings</span> : status === "gap" ? <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-bold">Funding gap</span> : <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">Within budget</span>}<div className="text-[11px] text-slate-500 mt-1">Data completeness<HelpLink tab="definitions" scrollTo="def-completeness" />: {r.highConfidenceCount} high / {r.lowConfidenceCount} low</div></td></tr>; })}
            {!fiveYearCIP.length && <tr><td colSpan="4" className="py-8 text-center text-slate-500">No forecast items yet. Add Install Year and Useful Life for assets.</td></tr>}
          </tbody></table></div>
        </div>}

        {forecastMode === "Advanced" && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print-break-before">
          <div className="glass-card p-5">
            <div className="text-lg font-semibold text-slate-900">Top risk assets in {forecastHorizon}-year window</div>
            <div className="text-sm text-slate-600 mt-1">Sorted by risk, then cost.</div>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2">Asset</th>
                    <th className="py-2">Year</th>
                    <th className="py-2">Risk</th>
                    <th className="py-2">Inflated cost</th>
                    <th className="py-2">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {fiveYearTopRisks.map(a => {
                    const rb = riskBucket(a.risk);
                    return (
                      <tr key={String(a.id) + "-" + a.year} className="border-t border-slate-100">
                        <td className="py-2 font-semibold text-slate-900">{a.assetName}</td>
                        <td className="py-2">{a.year}</td>
                        <td className="py-2"><Chip label={rb.label} cls={rb.cls} /></td>
                        <td className="py-2">{currencyFormatter.format(a.inflatedCost || 0)}</td>
                        <td className="py-2">{a.location || "—"}</td>
                      </tr>
                    );
                  })}
                  {!fiveYearTopRisks.length && <tr><td colSpan="5" className="py-8 text-center text-slate-500">No forecast items. Add missing lifecycle fields.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="glass-card p-5">
            <div className="text-lg font-semibold text-slate-900">Assumptions</div>
            <div className="text-sm text-slate-600 mt-1">Current settings driving this forecast.</div>
            <div className="mt-4 space-y-3 text-sm">
              <Assumption label="Scenario" value={settings.scenarioMode || "Standard"} />
              <Assumption label="Inflation rate" value={`${settings.inflationRate}%`} />
              <Assumption label="Starting reserve" value={currencyFormatter.format(toFloat(settings.reserveBalance) ?? 0)} />
              <Assumption label="Annual contribution" value={currencyFormatter.format(toFloat(settings.annualContribution) ?? 0)} />
              <Assumption label="Annual grant funding" value={currencyFormatter.format(toFloat(settings.annualGrantFunding) ?? 0)} />
              <Assumption label="Reserve interest" value={`${toFloat(settings.reserveInterestRate) ?? 0}%`} />
              <Assumption label="Annual budget" value={currencyFormatter.format(toFloat(settings.annualBudget) ?? 0)} />
            </div>
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600">Method: scheduled replacements + overdue backlog + deferred carry-forward. Low-completeness rows mean missing install, life, or cost data.</div>
            <details className="mt-4">
              <summary className="text-xs font-bold text-[#1E3D3B] cursor-pointer hover:text-[#76B900]">What do these terms mean?</summary>
              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <div><span className="font-bold text-slate-900">Scheduled Need</span> - The cost of assets whose replacement year falls in that calendar year based on install date + useful life.</div>
                <div><span className="font-bold text-slate-900">Overdue Need</span> - Assets that should have been replaced in a prior year but weren't funded. These carry forward as backlog.</div>
                <div><span className="font-bold text-slate-900">Deferred In</span> - The total dollar value of unfunded items carried into this year from prior years.</div>
                <div><span className="font-bold text-slate-900">Funded</span> - The portion of the year's need that can be covered from your reserve balance (contributions + grants + interest).</div>
                <div><span className="font-bold text-slate-900">Shortfall</span> - The gap between what's needed and what's funded in a single year. This amount gets deferred to the next year.</div>
                <div><span className="font-bold text-slate-900">Unfunded Gap</span> - The cumulative shortfall across all years. This is the total amount you'd need additional funding to cover.</div>
                <div><span className="font-bold text-slate-900">Ending Reserve</span> - Your projected reserve balance at the end of the year after funding what's possible.</div>
                <div><span className="font-bold text-slate-900">Data Completeness</span> - How many assets have all required fields (install year, useful life, replacement cost). "High" means the forecast for that asset is reliable. "Low" means fields are missing and the forecast may undercount.</div>
                <div><span className="font-bold text-slate-900">Scenario</span> - Standard uses your settings as-is. Conservative inflates costs 20% higher. Aggressive reduces them 10% for optimistic planning.</div>
              </div>
            </details>
            <div className="mt-4"><button className="w-full px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={() => setView("settings")}>Open settings</button></div>
          </div>
        </div>}
        <div className="print-footer">{settings.orgName || "Water System"} • {APP_NAME} v{APP_VERSION} • {settings.pwsId || ""} • Printed {new Date().toLocaleDateString()}</div>
      </div>}
      {/* Data View */}
      {view === "data" && <div className="space-y-4"><div className="glass-card p-4 border border-amber-300 bg-amber-50"><div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3"><div><div className="text-lg font-semibold text-amber-900">Import / Backup</div><div className="text-sm text-amber-900 mt-1">This app stores working data in this browser. If browser storage is cleared, switched, or blocked, your data can be lost unless you export a JSON backup or connect autosave.</div></div><div className="text-xs font-bold text-amber-900 uppercase tracking-wide">Browser-only storage warning</div></div><div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-amber-900"><div>Use Excel for sharing.</div><div>Use JSON for restore points.</div><div>Make a fresh backup after important edits or imports.</div></div></div>{showBackupBanner && <div className="glass-card p-4 border border-emerald-200 bg-emerald-50"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><div className="text-sm font-semibold text-emerald-900">Backup reminder</div><div className="text-sm text-emerald-800 mt-1">You made meaningful changes recently. Save a fresh JSON backup now so this browser is not your only copy.</div></div><button className="px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold" onClick={() => { exportBackupJSON(); setShowBackupBanner(false); }}>Export JSON backup now</button></div></div>}<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-lg font-semibold text-slate-900">Export / Backup</div><div className="text-sm text-slate-600 mt-1">Excel for sharing. JSON for restore points and recovery.</div></div><div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${prefs.lastBackup ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>Last JSON backup: {getLastJsonBackupLabel(prefs.lastBackup)}</div></div><div className="mt-4 space-y-2"><button className="w-full px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold flex items-center justify-center gap-2" onClick={() => exportExcel()}><Icon name="download" /> Export Excel</button><button className="w-full px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold flex items-center justify-center gap-2" onClick={exportBackupJSON}><Icon name="database" /> Export JSON backup</button><button className="w-full px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={downloadTemplate}>Download Excel template</button><div className="text-xs text-slate-500">Last manual backup: {prefs.lastBackup ? formatDateTime(prefs.lastBackup) : "None yet"}</div></div></div>
        <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900">Import / Restore</div><div className="text-sm text-slate-600 mt-1">Supports .xlsx files and JSON backup restores.</div><div className="mt-4"><button className="w-full px-4 py-2 rounded-lg bg-[#76B900] hover:bg-[#5A9400] text-white font-semibold" onClick={() => setImportModalOpen(true)}>Open import wizard</button></div><div className="mt-4 text-xs text-slate-500">Tip: The importer maps columns using common synonyms.</div></div><div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900">Connected autosave</div><div className="text-sm text-slate-600 mt-1">Automatically saves every change to a JSON file on your computer. Protects against browser data loss.</div><div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-800"><strong>Tip:</strong> Your data is also silently backed up to IndexedDB in addition to localStorage. If localStorage gets cleared, the app will auto-recover on next load.</div><div className={`mt-2 text-xs ${appHealth.secure ? "text-emerald-700" : "text-amber-700"}`}>{launchGuidance}</div><div className="mt-4 space-y-2"><button className="w-full px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center justify-center gap-2" onClick={connectAutosaveFile}><Icon name="save" /> {autosaveState.connected ? "Reconnect / Change autosave file" : "Connect autosave file"}</button><button className="w-full px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold flex items-center justify-center gap-2" onClick={() => writeAutosaveFile("manual-save")} disabled={!autosaveState.connected || autosaveState.saving}><Icon name="refresh" /> {autosaveState.saving ? "Saving..." : "Save now"}</button><button className="w-full px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={disconnectAutosave} disabled={!autosaveState.connected}>Disconnect autosave</button><div className="text-xs text-slate-500">Status: {autosaveState.connected ? `Connected to ${autosaveState.fileName || "JSON file"}` : autosaveSupported ? "Not connected" : "Unavailable in this browser/context"}</div>{autosaveState.lastSavedAt ? <div className="text-xs text-slate-500">Last autosave: {formatDateTime(autosaveState.lastSavedAt)}</div> : null}{autosaveState.error ? <div className="text-xs text-red-700 font-semibold">{autosaveState.error}</div> : null}</div></div>
        <div className="glass-card p-5"><div className="text-lg font-semibold text-slate-900">Photo & Document Storage</div><div className="text-sm text-slate-600 mt-1">Connect a folder on your computer to store asset photos, inspection images, and documents (PDFs, manuals). Files are saved locally and displayed in asset records.</div>{photoSupported ? <div className="mt-4 space-y-2"><button className="w-full px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center justify-center gap-2" onClick={connectPhotoDir}><Icon name="photo" size={16} /> {photoHandle ? "Reconnect folder" : "Connect storage folder"}</button><div className="text-xs text-slate-500">Status: {photoHandle ? <span className="text-emerald-700 font-bold">Connected ({Object.values(photoUrls).reduce((s, arr) => s + arr.length, 0)} files loaded)</span> : "Not connected"}</div><div className="text-xs text-slate-500">Files are named using the asset ID (e.g., AM-0001_1234567890.jpg). When you add a photo or document on an asset, the app auto-prompts for a folder if one isn't connected yet.</div></div> : <div className="mt-4 text-xs text-amber-700">File storage requires Chrome or Edge in a secure context (localhost or HTTPS).</div>}</div>
        <div className="glass-card p-5 lg:col-span-2"><div className="text-lg font-semibold text-slate-900">Danger zone</div><div className="text-sm text-slate-600 mt-1">Proceed with caution.</div><div className="mt-4 flex flex-col sm:flex-row gap-2"><button className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold" onClick={() => setConfirm({ open: true, title: "Wipe all data?", body: "This permanently deletes all assets, service log entries, and history from this browser. Your settings will be preserved. Export a backup first!", danger: true, confirmText: "Wipe all data", onConfirm: () => { setAssets([]); setServiceLog([]); setHistory([]); setIdCounter(1); showToast("All data wiped", "warn"); setConfirm({ open: false }); }, onCancel: () => setConfirm({ open: false }) })}>Wipe local data</button><button className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-semibold" onClick={() => setConfirm({ open: true, title: "Reset settings to defaults?", body: "This will reset your organization name, inflation rate, reserve balance, annual contribution, budget, and display preferences back to their default values. Your assets, service log, and history will NOT be affected.", danger: false, confirmText: "Reset settings", onConfirm: () => { setSettings(DEFAULT_SETTINGS); showToast("Settings restored to defaults"); setConfirm({ open: false }); }, onCancel: () => setConfirm({ open: false }) })}>Reset settings</button></div></div>
      </div></div>}
      {/* Settings View */}
      {view === "settings" && <div className="space-y-4">
        <div className="glass-card p-5" style={{borderTop:"3px solid #76B900",background:basicMode?"linear-gradient(135deg,rgba(118,185,0,0.08),rgba(255,255,255,0.97))":"linear-gradient(135deg,rgba(30,61,59,0.08),rgba(255,255,255,0.97))"}}><div className="flex items-center justify-between gap-4 flex-wrap"><div><div className="text-lg font-semibold text-slate-900">{basicMode ? "Basics Mode" : "Advanced Mode"}</div><div className="text-sm text-slate-600 mt-1">{basicMode ? "We're showing you the basics: your dashboard, your assets, your maintenance calendar, and backups. Just the tabs you need to get started." : "Every tab and feature is on: service log, long-range forecast, reports, history, and what-if scenarios."}</div></div><button onClick={() => setPrefs(p => ({...p, basicMode: !p.basicMode}))} className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition ${basicMode ? "bg-[#1E3D3B] hover:bg-[#152B2A] text-white" : "bg-[#76B900] hover:bg-[#5A9400] text-white"}`}>{basicMode ? <>Switch to Advanced</> : <>Switch to Basics</>}</button></div>{basicMode && <div className="mt-3 p-3 rounded-xl bg-white/70 border border-emerald-200 text-sm text-emerald-900"><strong>Tip:</strong> Start simple. Add a few assets, take a look at your dashboard, and set maintenance reminders on the calendar. When you're ready for budget forecasts and detailed reports, flip on Advanced.</div>}</div>
        <div className="glass-card p-5"><div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div><div className="text-lg font-semibold text-slate-900">Organization</div><div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="text-xs font-medium text-slate-600 uppercase">Org name</label><input value={settings.orgName || ""} onChange={(e) => setSettings(prev => ({ ...prev, orgName: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"/></div><div><label className="text-xs font-medium text-slate-600 uppercase">PWS ID (EPA system number)</label><input value={settings.pwsId || ""} onChange={(e) => setSettings(prev => ({ ...prev, pwsId: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white" placeholder="e.g., OK2012345"/></div></div>{!basicMode && <><div className="mt-4 text-lg font-semibold text-slate-900 flex items-center">Core forecast assumptions <HelpLink tab="definitions" scrollTo="def-forecast" /></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"><SettingField label="Inflation rate (%)" value={settings.inflationRate} onChange={(v) => setSettings(p => ({ ...p, inflationRate: toFloat(v) ?? 0 }))} /><SettingField label="Annual budget" value={settings.annualBudget} onChange={(v) => setSettings(p => ({ ...p, annualBudget: toFloat(v) ?? 0 }))} /><SettingField label="Starting reserve" value={settings.reserveBalance} onChange={(v) => setSettings(p => ({ ...p, reserveBalance: toFloat(v) ?? 0 }))} /><SettingField label="Annual contribution" value={settings.annualContribution} onChange={(v) => setSettings(p => ({ ...p, annualContribution: toFloat(v) ?? 0 }))} /><SettingField label="Annual grant funding" value={settings.annualGrantFunding} onChange={(v) => setSettings(p => ({ ...p, annualGrantFunding: toFloat(v) ?? 0 }))} /><SettingField label="Reserve interest rate (%)" value={settings.reserveInterestRate} onChange={(v) => setSettings(p => ({ ...p, reserveInterestRate: toFloat(v) ?? 0 }))} /></div><div className="mt-4"><label className="text-xs font-medium text-slate-600 uppercase">Forecast scenario <HelpLink tab="definitions" scrollTo="def-scenario" /></label><select value={settings.scenarioMode || "Standard"} onChange={(e) => setSettings(prev => ({ ...prev, scenarioMode: e.target.value }))} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"><option>Standard</option><option>Conservative</option><option>Aggressive</option></select><div className="text-xs text-slate-500 mt-1">Standard is the baseline. Conservative increases projected need. Aggressive softens projected costs for comparison only.</div></div></>}</div>
          <div><div className="text-lg font-semibold text-slate-900">Display</div><div className="mt-3 space-y-3">{!basicMode && <><Toggle label="Show depreciation estimate" checked={!!settings.showDepreciation} onChange={(checked) => setSettings(prev => ({ ...prev, showDepreciation: checked }))} />{settings.showDepreciation && <div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><label className="text-sm font-semibold text-slate-900">Depreciation method</label><div className="text-xs text-slate-600 mt-0.5">Affects book value calculations and the depreciation chart.</div><select value={settings.depreciationMethod || "straight-line"} onChange={(e) => setSettings(prev => ({ ...prev, depreciationMethod: e.target.value }))} className="mt-2 w-full px-3 py-2 border border-slate-200 rounded-lg bg-white">{DEPRECIATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>}<Toggle label="Show warranty tracking" checked={!!settings.showWarranty} onChange={(checked) => setSettings(prev => ({ ...prev, showWarranty: checked }))} /></>}<div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-sm font-semibold text-slate-900">Opening screen</div><div className="text-xs text-slate-600 mt-0.5">Choose which tab loads first when you open the app.</div><div className="mt-3 flex flex-wrap gap-2"><button className={`px-4 py-2 rounded-lg font-semibold border ${(prefs.defaultView || "dashboard") === "dashboard" ? "bg-[#1E3D3B] text-white border-[#1E3D3B]" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"}`} onClick={() => setOpeningScreen("dashboard")}>Dashboard</button><button className={`px-4 py-2 rounded-lg font-semibold border ${(prefs.defaultView || "dashboard") === "assets" ? "bg-[#76B900] text-white border-[#76B900]" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"}`} onClick={() => setOpeningScreen("assets")}>Assets</button></div></div></div><div className="mt-6 glass-card p-4"><div className="text-sm font-semibold text-slate-900">Health check</div><div className="mt-2 space-y-2 text-xs text-slate-700"><div className="flex items-center justify-between"><span>Seal image</span><span className={sealOk ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>{sealOk ? "Loaded" : "Missing"}</span></div><div className="flex items-center justify-between"><span>Browser storage</span><span className={appHealth.storageReady ? "text-emerald-700 font-bold" : "text-red-700 font-bold"}>{appHealth.storageReady ? "Ready" : "Unavailable"}</span></div><div className="flex items-center justify-between"><span>Connected autosave</span><span className={autosaveState.connected ? "text-emerald-700 font-bold" : "text-slate-500 font-bold"}>{autosaveState.connected ? "Connected" : autosaveSupported ? "Optional" : "Unavailable"}</span></div><div className="flex items-center justify-between"><span>Photo folder</span><span className={photoHandle ? "text-emerald-700 font-bold" : "text-slate-500 font-bold"}>{photoHandle ? "Connected" : photoSupported ? "Optional" : "Unavailable"}</span></div><div className="flex items-center justify-between"><span>Secure context</span><span className={appHealth.secure ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>{appHealth.secure ? "Yes" : "No"}</span></div></div></div>{!basicMode && <div className="mt-6 glass-card p-4 border-amber-200 bg-amber-50"><div className="text-sm font-semibold text-amber-900 flex items-center gap-2"><Icon name="flask" size={16} /> Scenarios</div><div className="text-xs text-amber-800 mt-1">Use Scenarios when you want to practice with a sample water system or test a what-if change without touching your saved data.</div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { if (!isScenarioMode) enterScenarioMode(); else setScenarioTemplateOpen(true); }} className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm">Pick a sample scenario</button><button onClick={() => openHelpTo("faq","faq-scenarios")} className="px-4 py-2 rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-100 font-semibold text-sm">What is this?</button></div></div>}<div className="mt-6 glass-card p-4"><div className="text-sm font-semibold text-slate-900">Dashboard entry point</div><div className="text-xs text-slate-600 mt-1">Show or hide the Start Here panel on the dashboard. You can bring it back at any time.</div><div className="mt-3 flex flex-wrap gap-2"><button className={`px-4 py-2 rounded-lg font-semibold border ${showStartHere ? "bg-[#76B900] text-white border-[#76B900]" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"}`} onClick={() => setPrefs(prev => ({ ...prev, showStartHere: true }))}>Show Start Here</button><button className={`px-4 py-2 rounded-lg font-semibold border ${!showStartHere ? "bg-[#1E3D3B] text-white border-[#1E3D3B]" : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"}`} onClick={() => setPrefs(prev => ({ ...prev, showStartHere: false }))}>Hide Start Here</button></div></div><div className="mt-4 text-lg font-semibold text-slate-900">Tutorial</div><div className="mt-3 space-y-3"><button onClick={startTutorial} className="w-full px-4 py-2 rounded-lg bg-[#1E3D3B] hover:bg-[#152B2A] text-white font-semibold flex items-center justify-center gap-2"><Icon name="bookOpen" size={16} /> Start guided tour</button><Toggle label="Auto-show tutorial for new users" checked={!tutorialDone} onChange={(checked) => setTutorialDone(!checked)} /></div><div className="mt-6 glass-card p-4 border-indigo-200 bg-indigo-50"><div className="text-sm font-semibold text-indigo-900 flex items-center gap-2"><Icon name="messageBug" size={16} /> Feedback &amp; Bug Reports</div><div className="text-xs text-indigo-800 mt-1">Found a bug or have a feature request? Let us know.</div><a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-semibold text-sm no-underline"><Icon name="externalLink" size={14} /> Open feedback form</a></div><div className="mt-6 glass-card p-4"><div className="text-sm font-semibold text-slate-900">About</div><div className="text-xs text-slate-600 mt-1">{APP_NAME} — {APP_SUBTITLE}<br/>v{APP_VERSION} · &copy; {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}</div><button onClick={() => setAboutOpen(true)} className="mt-2 text-xs text-blue-700 underline">View full copyright &amp; license</button></div></div>
        </div></div>
        {!basicMode && <div className="glass-card p-4 border border-[#1E3D3B]/20 bg-[#1E3D3B]/5"><div className="text-sm font-semibold text-[#1E3D3B]">Workers, Overhead &amp; Maintenance Profiles</div><div className="text-sm text-slate-600 mt-1">These settings have moved to the <strong>Assets</strong> tab for easier access. Scroll to the bottom of the Assets view and click the configure button.</div><button className="mt-2 px-4 py-2 rounded-lg bg-[#1E3D3B] text-white text-sm font-semibold hover:bg-[#152B2A]" onClick={() => { setView("assets"); setShowProfilesPanel(true); }}>Go to Assets &rarr; Workers &amp; Profiles</button></div>}
        {!basicMode && <div className="glass-card p-5"><div className="text-base font-semibold text-slate-900 flex items-center">Budget forecast toggles <HelpLink tab="definitions" scrollTo="def-forecast" /></div><div className="text-sm text-slate-600 mt-1">Control which cost layers are included in the combined forecast.</div><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4"><Toggle label="Include labor in forecast" checked={financial.budgetModel?.includeLaborInForecast !== false} onChange={(checked) => updateBudgetModel({ includeLaborInForecast: checked })} /><Toggle label="Include maintenance in forecast" checked={financial.budgetModel?.includeMaintenanceInForecast !== false} onChange={(checked) => updateBudgetModel({ includeMaintenanceInForecast: checked })} /><Toggle label="Include overhead in forecast" checked={financial.budgetModel?.includeOverheadInForecast !== false} onChange={(checked) => updateBudgetModel({ includeOverheadInForecast: checked })} /><Toggle label="Include capital replacement in forecast" checked={financial.budgetModel?.includeCapitalReplacementInForecast !== false} onChange={(checked) => updateBudgetModel({ includeCapitalReplacementInForecast: checked })} /></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4"><SettingField label="Contingency %" value={financial.budgetModel?.contingencyPercent ?? 0} onChange={(v) => updateBudgetModel({ contingencyPercent: toFloat(v) ?? 0 })} /><div className="p-3 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs font-medium text-slate-500 uppercase">Current annualized maintenance baseline</div><div className="text-2xl font-semibold text-slate-900 mt-1">{currencyFormatter.format(Math.round(Math.max(estimateAnnualMaintenanceFromProfiles(activeAssets, settings), estimateHistoricalAnnualMaintenance(serviceLog, settings))))}</div><div className="text-[11px] text-slate-500 mt-1">Uses the higher of profile-based maintenance or the last 12 months of direct service costs.</div></div></div></div>}
      </div>}
    </main>
    {/* Modals */}
    <Modal title={editAsset ? `Edit asset ${editAsset.id}` : "Add asset"} subtitle="Fill fields you know now; improve later." isOpen={assetModalOpen} onClose={() => { setAssetModalOpen(false); setEditAsset(null); }}>
      <AssetForm initial={editAsset} catalog={ASSET_CATALOG} maintenanceProfiles={maintenanceProfiles} onSubmit={saveAsset} onCancel={() => { setAssetModalOpen(false); setEditAsset(null); }} onSavePhoto={saveAssetPhoto} onSaveDocument={saveAssetDocument} onSaveInspection={saveInspectionPhoto} onDeleteFile={deleteAssetFile} assetFiles={editAsset?.id ? (photoUrls[editAsset.id] || []) : []} />
    </Modal>
    <Modal title={editService ? "Edit service entry" : "Add service entry"} subtitle="Log what happened." isOpen={serviceModalOpen} onClose={() => { setServiceModalOpen(false); setEditService(null); }}>
      <ServiceLogForm assets={enriched} initial={editService} laborRoles={laborRoles} settings={settings} onSubmit={saveServiceEntry} onCancel={() => { setServiceModalOpen(false); setEditService(null); }} />
    </Modal>

    <ImportWizardModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} onImportFile={handleFileImport} onExportExcel={() => exportExcel()} onExportBackup={exportBackupJSON} onDownloadTemplate={downloadTemplate} parseExcelToAssets={parseExcelToAssets} parseCsvToAssets={parseCsvToAssets} />
    {/* FEATURE 5: Bulk Edit Modal */}
    <BulkEditModal isOpen={bulkEditModalOpen} onClose={() => setBulkEditModalOpen(false)} selectedAssets={selectedAssets} onSave={handleBulkEditSave} />
    <BatchServiceModal isOpen={batchServiceOpen} onClose={() => setBatchServiceOpen(false)} selectedAssets={selectedAssets} onSave={handleBatchServiceSave} />
    {/* Asset Label Modal */}
    <AssetLabelModal isOpen={!!labelAsset} onClose={() => setLabelAsset(null)} asset={labelAsset} orgName={settings.orgName} pwsId={settings.pwsId} />
    <AssetDetailModal isOpen={!!detailAsset} onClose={() => setDetailAsset(null)} asset={detailAsset} serviceLog={serviceLog} settings={settings} onEdit={openEditAsset} onDuplicate={duplicateAsset} onPrintLabel={setLabelAsset} onMarkMaint={markMaintComplete} onDelete={askDeleteAssets} onLogService={(asset) => { setEditService({ assetId: asset.id, assetName: asset.assetName }); setServiceModalOpen(true); }} sortedAssets={sorted} onNavigate={(a) => setDetailAsset(a)} assetFiles={detailAsset?.id ? (photoUrls[detailAsset.id] || []) : []} onSavePhoto={saveAssetPhoto} onSaveDocument={saveAssetDocument} onSaveInspection={saveInspectionPhoto} onDeleteFile={deleteAssetFile} />
    <Modal title="Help & Reference" subtitle={`${APP_NAME} v${APP_VERSION}`} isOpen={helpOpen} onClose={() => setHelpOpen(false)} size="lg">
      <div>
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-200 mb-4">{[["quickstart","Quick Start"],["definitions","Definitions"],["faq","FAQ"],["changelog","Changelog"]].map(([k,l]) =>
          <button key={k} className={`px-4 py-2 text-sm font-bold border-b-2 transition ${helpTab === k ? "border-[#76B900] text-[#1E3D3B]" : "border-transparent text-slate-500 hover:text-slate-700"}`} onClick={() => setHelpTab(k)}>{l}</button>
        )}</div>
        {/* Quick Start */}
        {helpTab === "quickstart" && <div className="space-y-3 text-sm text-slate-700">
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">1. Add your first assets</div><div className="mt-1">Go to the <strong>Assets</strong> tab and click <strong>Add asset</strong>. Fill in the name, category, install date, useful life, and replacement cost at a minimum. You can also use the <strong>Catalog Quick-Fill</strong> panel on the right side of the form to auto-fill common water system equipment.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">2. Import from a spreadsheet</div><div className="mt-1">Go to <strong>Import / Backup → Open import wizard</strong>. Drop a .xlsx, .csv, or .json file. Pick an import mode: <strong>Smart Merge</strong> (safest, matches existing assets), <strong>Append</strong> (adds everything new), or <strong>Replace</strong> (wipes and replaces). Download the template first for the correct column names.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">3. Set up maintenance tracking</div><div className="mt-1">On each asset, set <strong>Last Maintenance</strong> (the date it was last serviced) and <strong>Maintenance Interval</strong> (how often, in months). The app calculates due dates automatically and shows them on the <strong>Calendar</strong> tab. Overdue items turn red.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">4. Practice safely with a sample scenario</div><div className="mt-1">Click <strong>Scenarios</strong> in the top bar. The app will open a picker with sample water systems. These are safe practice copies. You can change assets, costs, salaries, and forecasts without changing your real saved data.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">5. Configure financial assumptions</div><div className="mt-1">Go to <strong>Settings</strong>. Enter your inflation rate, starting reserve balance, annual contribution, annual budget, labor roles, and overhead items. These values drive the combined forecast for capital replacement plus operating costs.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">6. Back up your data</div><div className="mt-1">Your data lives <strong>only in this browser</strong>. If you clear your browser data, it's gone. Go to <strong>Import / Backup → Export JSON backup</strong> to save everything. Do this monthly or before any big changes. You can also connect an <strong>Autosave File</strong> for automatic protection.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">7. Generate reports</div><div className="mt-1">The <strong>Reports</strong> tab shows your system summary with breakdowns by category, condition, and priority. Use <strong>Export PDF</strong> for a formatted report you can email or print for meetings, grant packages, or internal review. The <strong>Dashboard</strong> also has a <strong>Data Summary</strong> you can copy-paste directly.</div></div>
          <div className="glass-card p-4 bg-emerald-50 border-emerald-200"><div className="font-semibold text-emerald-900">Where does my data go?</div><div className="mt-1 text-emerald-800">All data is stored locally in your web browser (localStorage + IndexedDB backup). Nothing is sent to a server. If you switch browsers or devices, you need to export a backup and import it on the new browser.</div></div>
        </div>}
        {/* Definitions */}
        {helpTab === "definitions" && <div className="space-y-3 text-sm text-slate-700">
          <div id="def-risk" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Risk Score (0-100)</div><div className="mt-1">A calculated number that estimates how likely an asset is to fail or need replacement soon. It combines the asset's <strong>age</strong> (how close it is to end of useful life) with its <strong>condition rating</strong>. Higher numbers = higher risk. A score of 60+ is considered high risk.</div></div>
          <div id="def-condition" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Condition Rating (1-5)</div><div className="mt-1"><strong>5 = Excellent</strong> (like new, no issues), <strong>4 = Good</strong> (minor wear, fully functional), <strong>3 = Fair</strong> (showing age, still works), <strong>2 = Poor</strong> (significant wear, may fail), <strong>1 = Critical</strong> (failing or barely functional). Rate based on the last inspection or your best judgment.</div></div>
          <div id="def-useful-life" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Useful Life</div><div className="mt-1">The expected number of years an asset will function before needing full replacement. For example, a pump might have a 15-year useful life. This doesn't mean it will break at exactly 15 years, but it's the planning estimate used for budgeting and forecasting.</div></div>
          <div id="def-replacement-cost" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Replacement Cost</div><div className="mt-1">How much it would cost <strong>today</strong> to buy and install a new version of this asset. Enter the per-unit cost. If you have multiple identical units (e.g., 50 water meters), enter the cost for one and set Quantity to 50.</div></div>
          <div id="def-replacement-year" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Replacement Year</div><div className="mt-1">The year the app predicts the asset will need replacement, calculated as: <strong>Install Year + Useful Life</strong>. If the replacement year is in the past, the asset is "past useful life" and shows as overdue in the forecast.</div></div>
          <div id="def-depreciation" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Depreciation / Book Value</div><div className="mt-1">An estimate of what the asset is "worth" today based on its age. A brand-new $50,000 pump depreciates over its useful life until it reaches $0 at end of life. This is for planning purposes only and may not match accounting depreciation. Three methods are available in Settings.</div></div>
          <div id="def-forecast" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Forecast (Capital + Operating)</div><div className="mt-1">The forecast combines <strong>capital replacement need</strong> with modeled <strong>operating need</strong> such as labor, maintenance, and overhead. Capital need still follows each asset's replacement year and inflated cost, while operating need comes from your financial settings, labor model, maintenance profiles, and recent service history.</div></div>
          <div id="def-scenario" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Scenario Mode</div><div className="mt-1">Scenario Mode is a <strong>safe practice copy</strong> of your data. You can load a sample water system or test temporary changes such as replacing an asset early or changing labor costs. When you leave Scenario Mode, your real saved data is not changed.</div></div>
          <div id="def-labor" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Labor Roles</div><div className="mt-1">Labor roles are your system-level staffing cost assumptions. Examples: operator, superintendent, clerk, or maintenance helper. Use them to estimate recurring annual labor cost and to price service work based on hours and loaded rate.</div></div>
          <div id="def-overhead" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Overhead Categories</div><div className="mt-1">Overhead covers system costs that are not tied to one single asset, such as insurance, office/admin, utilities, communications, fleet support, or compliance support. You can enter these as flat annual amounts, monthly amounts, or percentages.</div></div>
          <div id="def-maintprofile" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Maintenance Profiles</div><div className="mt-1">A maintenance profile is a reusable template for recurring work. Instead of entering the same labor hours and materials over and over, you can create one profile and assign it to multiple assets.</div></div>
          <div id="def-funded" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Funded vs. Unfunded Gap</div><div className="mt-1"><strong>Funded</strong> means the projected cost is covered by your reserve balance, annual contributions, and grants. <strong>Unfunded Gap (Shortfall)</strong> is the amount you don't have money for yet. If the gap is large, you may need to raise rates, seek additional grants, or defer some replacements.</div></div>
          <div id="def-deferred" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Deferred / Backlog</div><div className="mt-1">Assets that <strong>should</strong> have been replaced already but weren't because there wasn't enough funding. They carry forward into future years and accumulate. A large deferred backlog means you're falling behind on replacements.</div></div>
          <div id="def-awia" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">AWIA Critical Asset</div><div className="mt-1">The <strong>America's Water Infrastructure Act (AWIA)</strong> requires certain water systems to assess risks and resilience. Assets marked "Critical" are essential to public health and safety. The critical flag adds weight to the risk score and highlights these assets in reports and alerts.</div></div>
          <div id="def-completeness" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Data Completeness</div><div className="mt-1">Shown in the Forecast tab. <strong>High</strong> means the asset has all the fields needed for an accurate forecast (install date, useful life, cost, condition). <strong>Low</strong> means key fields are missing, so the forecast for that asset is less reliable. Fill in the gaps to improve accuracy.</div></div>
          <div id="def-maint-interval" className="glass-card p-4"><div className="font-semibold text-[#1E3D3B]">Maintenance Interval</div><div className="mt-1">How often (in months) an asset should be serviced. For example, a pump might need maintenance every 12 months. The app uses this plus the "Last Maintenance" date to calculate when the next service is due and flag it on the calendar.</div></div>
        </div>}
        {/* FAQ */}
        {helpTab === "faq" && <div className="space-y-3 text-sm text-slate-700">
          <div className="p-3 bg-[#1E3D3B]/5 rounded-xl text-xs text-slate-600 font-semibold">Look for the <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-300 text-white text-[9px] font-semibold">?</span> icon next to terms in the app. Clicking it opens this Help panel to the relevant section.</div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What is this app for?</div><div className="mt-1">{APP_NAME} helps small water systems track their equipment (pumps, pipes, tanks, meters, etc.), plan when things need replacing, schedule maintenance, and generate reports for boards, funders, and regulators. Think of it as a digital notebook for everything your water system owns.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What is a PWS?</div><div className="mt-1"><strong>PWS</strong> stands for <strong>Public Water System</strong>. The EPA assigns each PWS a unique ID number (like OK2012345). You can enter yours in Settings so it appears on exports and reports.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">Where is my data stored? Is it safe?</div><div className="mt-1">All data stays <strong>in your web browser</strong> on your computer. Nothing is sent to a server or the internet. This means it's private and works offline, but it also means if you clear your browser data or switch computers, you need a backup. Export a JSON backup regularly from the Import / Backup tab.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What does "JSON backup" mean?</div><div className="mt-1"><strong>JSON</strong> is a file format (like .xlsx for Excel). A JSON backup is a single file that contains ALL your data: assets, settings, service history, and everything else. You can re-import it later to restore your data. Keep one saved on your desktop or a USB drive.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What happens if I clear my browser history?</div><div className="mt-1">Your asset data could be lost. Always keep a recent JSON backup (Import / Backup tab, then Export JSON backup). The app has a secondary backup in IndexedDB that may recover your data automatically, but don't rely on it.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">Can I use this on my phone?</div><div className="mt-1">Yes. It works on phones, tablets, and computers. But data is tied to the specific browser on the specific device. To move data between devices, export a JSON backup on one and import it on the other.</div></div>
          <div id="faq-scenarios" className="glass-card p-4"><div className="font-semibold text-slate-900">What is Scenario Mode and is it safe?</div><div className="mt-1">Yes. Scenario Mode is a practice area. It creates a temporary copy of your data and can also load sample water systems. Use it to test replacements, salaries, labor assumptions, or other what-if ideas. Leaving Scenario Mode discards those practice changes and keeps your real saved records intact.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">How do I use a sample system?</div><div className="mt-1">Click <strong>Scenarios</strong> in the top bar. A picker opens automatically. Choose a sample water system, review the dashboard, then explore Assets, Service Log, Forecast, and Reports. Click <strong>Start Over</strong> to return to your own baseline copy.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">Can multiple people work on the same data?</div><div className="mt-1">Not simultaneously. Each browser has its own copy. For team use, designate one person as the primary data keeper. Others can view shared Excel or PDF exports. Use Smart Merge import to combine changes from different files.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What is the dashboard showing me?</div><div className="mt-1">The <strong>Dashboard</strong> is your "health check" page. It shows your total assets, their combined value, average condition, and alerts for anything that needs attention (overdue maintenance, assets past their useful life, etc.). Check it weekly to stay on top of things.</div></div>
          <div id="faq-alerts" className="glass-card p-4"><div className="font-semibold text-slate-900">What do the dashboard alerts mean?</div><div className="mt-1">Each alert tells you about a specific group of assets that need attention. Click any alert (if the count isn't 0) to jump to the Assets tab filtered to show just those items. Alerts with a count of 0 show "All clear," which means no action is needed for that category.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What's the difference between "Condition" and "Risk"?</div><div className="mt-1"><strong>Condition</strong> is your hands-on assessment of how the asset looks and works right now (1 = failing, 5 = like new). <strong>Risk</strong> is a number the app calculates by combining condition with age, priority, and critical status. An asset in "Good" condition can still be high-risk if it's near end of life.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">I don't know the exact install date. What do I enter?</div><div className="mt-1">Use the date mode toggle on the asset form. You can enter just a <strong>Year</strong> (e.g., 2015), a <strong>Month/Year</strong>, or a <strong>Full Date</strong>. Even a rough year is much better than nothing for forecasting.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">How do I retire an asset that's been replaced?</div><div className="mt-1">Edit the asset and change its Status to <strong>Retired</strong>. Or select multiple assets with checkboxes and click the <strong>Retire</strong> button in the toolbar. Retired assets are excluded from forecasts and risk scores but stay in your records for history.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What is the Calendar tab for?</div><div className="mt-1">The Calendar shows when maintenance is due, warranties are expiring, and when assets are estimated to need replacement. Set a <strong>Last Maintenance date</strong> and <strong>Maintenance Interval</strong> on each asset, and the calendar populates automatically. Switch between the monthly grid and the list view for different perspectives.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">The forecast shows a big number. Is that accurate?</div><div className="mt-1">It's a projection based on your data. If replacement costs or useful lives are off, the forecast will be too. Check the <strong>Data Completeness</strong> indicator in the year-by-year table. "Low" means key fields are missing, so the forecast is less reliable. Fill in the gaps to improve accuracy.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What does "Unfunded Gap" mean?</div><div className="mt-1">It's the difference between what you <strong>need</strong> to spend on replacements and what you <strong>have</strong> in your reserve fund and contributions. A large gap means you'll need to find additional money through grants, rate increases, or phased replacement strategies.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What does "Deferred" mean in the forecast?</div><div className="mt-1">Deferred means an asset <strong>should</strong> have been replaced but wasn't because there wasn't enough money. These assets carry forward into future years. A growing deferred backlog means you're falling behind on replacements.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">How do I import my data from Excel or CSV?</div><div className="mt-1">Go to the <strong>Import / Backup</strong> tab and click <strong>Open import wizard</strong>. Drop your file in (supports .xlsx, .csv, .tsv, or .json). Choose a mode: <strong>Smart Merge</strong> (safest), <strong>Append</strong> (adds all), or <strong>Replace</strong> (wipes and replaces). Download the template first for correct column names.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What does "Smart Merge" do?</div><div className="mt-1">It tries to match incoming assets to existing ones by ID first, then serial number, then name + location. If it finds a match, it updates that asset. If no match, it creates a new one. This prevents duplicates when re-importing an updated spreadsheet.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">How do I print a report for my board or a grant application?</div><div className="mt-1">Go to the <strong>Reports</strong> tab. Click <strong>Export PDF</strong> for a branded document, or <strong>Print Report</strong> for a browser print. The Dashboard also has a <strong>Data Summary</strong> paragraph you can copy/paste into emails, presentations, or meeting notes.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900">What is AWIA?</div><div className="mt-1">The <strong>America's Water Infrastructure Act</strong> requires certain water systems to assess risks to their infrastructure. Assets marked "Critical" are essential to public health. The critical flag adds weight to risk scores and highlights these assets in reports and alerts.</div></div>
          <div className="glass-card p-4 bg-indigo-50 border-indigo-200"><div className="font-semibold text-indigo-900 flex items-center gap-2"><Icon name="messageBug" size={16} /> Still have questions?</div><div className="mt-1 text-indigo-800">Send feedback or ask a question through our form.</div><a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white font-semibold text-sm no-underline"><Icon name="externalLink" size={14} /> Open feedback form</a></div>
        </div>}
        {/* Changelog */}
        {helpTab === "changelog" && <div className="space-y-3 text-sm text-slate-700">
          <div className="glass-card p-4" style={{borderLeft:"3px solid #76B900"}}><div className="font-semibold text-slate-900">v5.2.0</div><div className="mt-1 text-slate-700">Navigation condensed to 6 grouped tabs (Overview, Assets, Service & Calendar, History, Import/Backup, Settings) with sub-tabs for Overview and Service views. Work Orders tab removed. AWIA checkbox removed from asset form; priority dropdown now shows plain-language descriptions. Maintenance interval input enlarged. Workers, Overhead, and Maintenance Profiles moved from Settings to a collapsible panel on the Assets tab. Section heading font weights reduced for cleaner appearance. Font stack standardized to Gill Sans MT.</div></div>
          <div className="glass-card p-4" style={{borderLeft:"3px solid #76B900"}}><div className="font-semibold text-slate-900">v4.9.7</div><div className="mt-1 text-slate-700">Scenario Mode now opens the sample system picker automatically, wording is simplified for non-technical users, help links were expanded for scenario, labor, overhead, and maintenance profile topics, and the guided tour and quick-start help were updated to reflect the newer forecasting and sample-system features.</div></div>
          <div className="glass-card p-4" style={{borderLeft:"3px solid #76B900"}}><div className="font-semibold text-slate-900">v4.7.0</div><div className="mt-1 text-slate-700">Asset detail view with depreciation chart and service history, searchable asset picker, action overflow menus, calendar list/agenda view, CSV/TSV import, PDF export, batch service logging, depreciation method selection, formatted dollar inputs, offline indicator, clickable dashboard alerts with smart filtering, comprehensive FAQ/Help system, and many UX refinements.</div></div>
          <div className="glass-card p-4" style={{borderLeft:"3px solid #76B900"}}><div className="font-semibold text-slate-900">v4.5.1</div><div className="mt-1 text-slate-700">Color scheme updated to Color Group 8 (teal, lime, sky blue, yellow-green). Typography updated to Gill Sans MT. Forecast section reorganized.</div></div>
          <div className="glass-card p-4" style={{borderLeft:"3px solid #76B900"}}><div className="font-semibold text-slate-900">v4.5.0</div><div className="mt-1 text-slate-700">Capital forecast backlog rebuilt for clean carry-forward. Annual budget acts as real funding cap. Import merge matches by ID, serial, or name+location. Service log actions write to History.</div></div>
          <div className="glass-card p-4" style={{borderLeft:"3px solid #76B900"}}><div className="font-semibold text-slate-900">v4.3</div><div className="mt-1 text-slate-700">Connected autosave, overdue/deferred forecast logic, grant funding and scenarios, health check indicators.</div></div>
          <div className="glass-card p-4"><div className="font-semibold text-slate-900 text-xs uppercase text-slate-500">Earlier versions</div><div className="mt-1 text-xs text-slate-500">v4.1: form validation, GPS, AWIA flag, CIP horizons. v4.0: rebranded to Oka Vlhpisa. v3.3: 5-Year CIP, Choctaw Nation brand alignment.</div></div>
        </div>}
      </div>
    </Modal>
    <ConfirmDialog isOpen={!!confirm.open} title={confirm.title || "Confirm"} body={confirm.body || ""} danger={!!confirm.danger} confirmText={confirm.confirmText || "Confirm"} onConfirm={confirm.onConfirm || (() => setConfirm({ open: false }))} onCancel={confirm.onCancel || (() => setConfirm({ open: false }))} />
    <Toast toast={toast} onClose={() => setToast(null)} tutorialActive={tutorialActive} />
    {/* About / Copyright Modal */}
    <Modal title={`About ${APP_NAME}`} subtitle={`${APP_SUBTITLE} · Version ${APP_VERSION}`} isOpen={aboutOpen} onClose={() => setAboutOpen(false)} size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-[#1E3D3B] to-[#287575] text-white">
          <div className="w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0"><svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="currentColor" opacity="0.3"/><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg></div>
          <div><div className="text-xl font-bold">{APP_NAME}</div><div className="text-sm opacity-90 italic">"Water Measured" — Chahta Anumpa</div><div className="text-xs opacity-70 mt-1">{APP_SUBTITLE} · Version {APP_VERSION}</div></div>
        </div>
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="font-bold text-amber-900 flex items-center gap-2"><Icon name="shield" size={16} /> Copyright Notice</div>
          <div className="text-sm text-amber-800 mt-2 leading-relaxed">{COPYRIGHT_NOTICE}</div>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="font-bold text-slate-900">Developed by</div>
          <div className="text-sm text-slate-700 mt-1">{COPYRIGHT_HOLDER} Environmental Protection Service</div>
          <div className="text-sm text-slate-600 mt-0.5">Office of Water Resource Management</div>
          <div className="text-sm text-slate-600 mt-1">P.O. Box 1210, Durant, OK 74702</div>
        </div>
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
          <div className="font-bold text-blue-900">Intended Use</div>
          <div className="text-sm text-blue-800 mt-1">This software is designed for use by Public Water Systems to track, maintain, and plan capital improvements for water system assets. All data is stored locally in your browser.</div>
        </div>
      </div>
    </Modal>
    {/* Copyright Footer */}
    <footer className="app-footer py-6 mt-8 no-print">
      <div className="footer-diamond"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
        <div style={{maxWidth:900,margin:"0 auto",fontSize:"0.72rem",lineHeight:1.5,color:"#6b7280"}}>
          <div style={{fontWeight:700,color:"#1E3D3B"}}>&copy; {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}. All rights reserved.</div>
          <div style={{marginTop:4}}><span style={{fontWeight:700,color:"#1E3D3B"}}>{COPYRIGHT_HOLDER}</span> <span style={{color:"#76B900",fontWeight:600}}>Environmental Protection Service</span></div>
          <div style={{color:"#1E3D3B",fontWeight:500}}>Office of Water Resource Management</div>
          <div style={{marginTop:8}}>This software is intended solely to assist authorized personnel with water system asset management, capital planning, maintenance tracking, and related internal governmental or utility purposes.</div>
          <div style={{marginTop:4}}>No license or transfer of rights is granted by possession, download, or use of this file. The Choctaw Nation name, seal, logos, slogans, emblems, trademarks, service marks, and other identifying indicia remain property of the Choctaw Nation of Oklahoma and may not be copied, redistributed, republished, sold, relicensed, or used for commercial or public branding purposes without prior written authorization.</div>
          <div style={{marginTop:4}}>Nothing in this software or any generated output shall be interpreted to waive, diminish, or surrender tribal sovereignty, sovereign immunity, governmental authority, jurisdiction, cultural property rights, or any other rights, protections, privileges, or remedies of the Choctaw Nation of Oklahoma.</div>
          <div style={{marginTop:8}}><span style={{color:"#1E3D3B",fontWeight:700}}>{APP_NAME} v{APP_VERSION}</span> <span style={{color:"#76B900"}}>&#9670;</span> {APP_SUBTITLE}</div>
          <div style={{fontSize:"0.68rem",color:"#999",letterSpacing:"0.05em",marginTop:6}}>FAITH &#10022; FAMILY &#10022; CULTURE</div>
          <div style={{marginTop:8}}><button className="link-btn text-xs text-slate-500 hover:text-slate-700" onClick={() => setAboutOpen(true)}>License &amp; Copyright Info</button></div>
        </div>
      </div>
    </footer>
    {/* Tutorial Overlay */}
    <StatusIndicator />
    {view === "assets" && selected.size > 0 && <div className="no-print" style={{position:"fixed",bottom:12,right:12,zIndex:50,display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:12,background:"#1E3D3B",color:"white",boxShadow:"0 4px 16px rgba(0,0,0,0.2)",fontSize:13,fontWeight:700}}>
      <div style={{width:24,height:24,borderRadius:999,background:"#76B900",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800}}>{selected.size}</div>
      <span>asset{selected.size === 1 ? "" : "s"} selected</span>
      <button onClick={() => setSelected(new Set())} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"white",padding:"2px 8px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",marginLeft:4}}>Clear</button>
    </div>}
    {/* Tutorial Panel - docked to bottom */}
    {tutorialActive && (() => {
      const step = TUTORIAL_STEPS[tutorialStep];
      if (!step) return null;
      const total = TUTORIAL_STEPS.length;
      return <TutorialSpotlight
        step={step}
        current={tutorialStep}
        total={total}
        isFirst={tutorialStep === 0}
        isLast={tutorialStep === total - 1}
        onPrev={prevTut}
        onNext={nextTut}
        onClose={endTutorial}
      />;
    })()}
  </div>;
}

export default App;
