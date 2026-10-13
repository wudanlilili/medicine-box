/* ===== 数据层（localStorage） ===== */
const STORAGE_KEYS = {
  medicines: 'mb_medicines',
  inventory: 'mb_inventory',
  prescriptions: 'mb_prescriptions',
  purchases: 'mb_purchases',
  selfUse: 'mb_self_use',
  adjustments: 'mb_adjustments',
  invLedger: 'mb_inv_ledger',
  finished: 'mb_finished',
};

const BACKUP_VERSION = 5;

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getMedicines() {
  return load(STORAGE_KEYS.medicines);
}
function saveMedicines(arr) {
  save(STORAGE_KEYS.medicines, arr);
}
function getInventory() {
  return load(STORAGE_KEYS.inventory);
}
function saveInventory(arr) {
  save(STORAGE_KEYS.inventory, arr);
}
function getPrescriptions() {
  return load(STORAGE_KEYS.prescriptions);
}
function savePrescriptions(arr) {
  save(STORAGE_KEYS.prescriptions, arr);
}
function getPurchases() {
  return load(STORAGE_KEYS.purchases);
}
function savePurchases(arr) {
  save(STORAGE_KEYS.purchases, arr);
}
function getSelfUse() {
  return load(STORAGE_KEYS.selfUse);
}
function saveSelfUse(arr) {
  save(STORAGE_KEYS.selfUse, arr);
}
function getAdjustments() {
  return load(STORAGE_KEYS.adjustments);
}
function saveAdjustments(arr) {
  save(STORAGE_KEYS.adjustments, arr);
}
function getInvLedger() {
  return load(STORAGE_KEYS.invLedger);
}
function saveInvLedger(arr) {
  save(STORAGE_KEYS.invLedger, arr);
}
function getFinished() {
  return load(STORAGE_KEYS.finished);
}
function saveFinished(arr) {
  save(STORAGE_KEYS.finished, arr);
}

// 把数量为0的库存批次移入历史药库（用完/清零归档）
// inv: 当前库存数组（原地修改）；ids: 本次涉及的库存id集合；reasonText: 归档原因
function archiveEmptyBatches(inv, ids, reasonText) {
  const finished = getFinished();
  let changed = false;
  for (let k = inv.length - 1; k >= 0; k--) {
    const it = inv[k];
    if (!ids.has(it.id)) continue;
    if ((Number(it.quantity) || 0) > 0) continue;
    // 本次入库数量（几盒）：优先 initialQuantity，其次流水中的入库记录
    let initialQty = Number(it.initialQuantity);
    if (!(initialQty > 0)) {
      const createEntry = getInvLedger().find((l) => l.inventoryId === it.id && l.type === 'create');
      initialQty = createEntry ? createEntry.delta : 0;
    }
    finished.unshift({
      id: uid(),
      inventoryId: it.id,
      medicineId: it.medicineId || null,
      name: it.name,
      spec: it.spec || getInvSpec(it),
      expiryDate: it.expiryDate || '',
      unit: it.unit || '',
      initialQuantity: initialQty,
      dosePerPack: it.dosePerPack || null,
      doseUnit: it.doseUnit || '',
      purchaseId: it.purchaseId || null,
      paidPrice: it.paidPrice || null,
      reason: reasonText || '用完',
      finishedAt: Date.now(),
      createdAt: it.createdAt || Date.now(),
    });
    inv.splice(k, 1);
    changed = true;
  }
  if (changed) saveFinished(finished);
  return changed;
}

// 从历史药库恢复最近归档的批次回库存（取消打卡回加时调用）
function restoreFromFinished(medicineId, medicineName) {
  const finished = getFinished();
  // 找最近归档的匹配记录
  const matchIdx = finished.findIndex((f) =>
    medicineId ? f.medicineId === medicineId : (f.name || '') === (medicineName || '')
  );
  if (matchIdx < 0) return null;
  const rec = finished[matchIdx];
  finished.splice(matchIdx, 1);
  saveFinished(finished);
  // 重建库存记录（quantity 为 0，由调用方回加）
  return {
    id: rec.inventoryId || uid(),
    medicineId: rec.medicineId || null,
    name: rec.name,
    spec: rec.spec || '',
    quantity: 0,
    unit: rec.unit || '',
    initialQuantity: rec.initialQuantity || 0,
    dosePerPack: rec.dosePerPack || null,
    doseUnit: rec.doseUnit || '',
    expiryDate: rec.expiryDate || '',
    purchaseId: rec.purchaseId || null,
    paidPrice: rec.paidPrice || null,
    location: '',
    notes: '从历史药库恢复',
    createdAt: rec.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

// 添加库存流水记录
// type: create(初始入库) / increase(增加) / decrease(减少) / adjust(手动调整)
// source: purchase / prescription / selfuse / manual / initial
function addLedgerEntry(inventoryId, medicineId, medicineName, type, source, refId, delta, balance, reason) {
  const ledger = getInvLedger();
  ledger.unshift({
    id: uid(),
    inventoryId,
    medicineId: medicineId || null,
    medicineName: medicineName || '',
    type,
    source,
    refId: refId || null,
    delta: Number(delta) || 0,
    balance: Number(balance) || 0,
    reason: reason || '',
    createdAt: Date.now(),
  });
  saveInvLedger(ledger);
}

/* ===== 日期工具 ===== */
// 今天 YYYY-MM-DD（本地时区）
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 日期加减天数，返回 YYYY-MM-DD
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 当前时间 HH:MM
function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ===== 工具函数 ===== */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getExpiryStatus(expiryDate) {
  if (!expiryDate) return { status: 'valid', days: null };
  const exp = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  const diffMs = exp - today;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return { status: 'expired', days };
  if (days <= 30) return { status: 'soon', days };
  return { status: 'valid', days };
}

function statusLabel(item) {
  const { status, days } = getExpiryStatus(item.expiryDate);
  if (status === 'expired') return `已过期 ${Math.abs(days)} 天`;
  return `还剩 ${days} 天`;
}

// 数字格式化：最多两位小数，去掉多余的 0
function fmtNum(n) {
  if (n == null || isNaN(Number(n))) return '0';
  return String(Math.round(Number(n) * 100) / 100);
}

// 短ID：取 uid 前8位用于显示
function shortId(id) {
  if (!id) return '—';
  return id.slice(-8).toUpperCase();
}

// 库存记录的规格（优先取自身，其次关联医药库）
function getInvSpec(inv) {
  if (inv.spec) return inv.spec;
  if (inv.medicineId) {
    const med = getMedicines().find((m) => m.id === inv.medicineId);
    if (med && med.spec) return med.spec;
  }
  return '';
}

// 库存折算后的总使用单位数（未设置换算时返回 null）
function invDoseTotal(inv) {
  const per = Number(inv.dosePerPack);
  if (per > 0) return (Number(inv.quantity) || 0) * per;
  return null;
}

// 查找药品的用量模式：manual = 方案A（打卡不扣库存），auto = 正常扣减
function getMedUsageMode(medicineId) {
  if (!medicineId) return 'auto';
  const med = getMedicines().find((m) => m.id === medicineId);
  return (med && med.usageMode) || 'auto';
}

/* ===== Toast ===== */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ===== 导航 ===== */
function navTo(page) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('page-active'));
  document.getElementById('page-' + page).classList.add('page-active');
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === page));
  const titles = { home: '我的药箱', medicine: '医药库', inventory: '库存管理', medication: '用药管理' };
  document.getElementById('headerTitle').textContent = titles[page];

  if (page === 'home') renderHome();
  if (page === 'medicine') renderMedicineList();
  if (page === 'inventory') renderInventoryPage();
  if (page === 'medication') renderMedicationPage();
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => navTo(btn.dataset.page));
});

/* ===== 首页 ===== */
function renderHome() {
  const meds = getMedicines();
  const inv = getInventory();

  document.getElementById('statMedicineCount').textContent = meds.length;
  document.getElementById('statInventoryCount').textContent = inv.length;

  let soonCount = 0, expiredCount = 0;
  const alerts = [];
  inv.forEach((item) => {
    const { status } = getExpiryStatus(item.expiryDate);
    if (status === 'expired') {
      expiredCount++;
      alerts.push({ ...item, _status: 'expired' });
    } else if (status === 'soon') {
      soonCount++;
      alerts.push({ ...item, _status: 'soon' });
    }
  });
  document.getElementById('statSoonCount').textContent = soonCount;
  document.getElementById('statExpiredCount').textContent = expiredCount;

  alerts.sort((a, b) => {
    const da = getExpiryStatus(a.expiryDate).days;
    const db = getExpiryStatus(b.expiryDate).days;
    return da - db;
  });

  const list = document.getElementById('expiryAlerts');
  // 有任一过期批次时显示"一键清理过期"入口
  const clearBtn = document.getElementById('clearAllExpiredBtn');
  if (clearBtn) clearBtn.classList.toggle('hidden', expiredCount === 0);
  if (alerts.length === 0) {
    list.innerHTML = '<div class="empty-tip">暂无临期或过期药品</div>';
  } else {
    list.innerHTML = alerts
      .map((a) => {
        const { status } = getExpiryStatus(a.expiryDate);
        const tip =
          status === 'expired'
            ? `已过期 ${Math.abs(getExpiryStatus(a.expiryDate).days)} 天，建议清理丢弃`
            : `还剩 ${getExpiryStatus(a.expiryDate).days} 天，建议尽快使用`;
        const actions =
          status === 'expired'
            ? `<button class="alert-action" onclick="viewInventoryDetail('${a.id}')">查看</button>
               <button class="alert-action alert-action-danger" onclick="clearExpiredBatch('${a.id}')">清理</button>`
            : `<button class="alert-action" onclick="viewInventoryDetail('${a.id}')">查看</button>`;
        return `
          <div class="alert-item ${status === 'expired' ? 'expired' : ''}">
            <div class="alert-info">
              <div class="alert-name">${a.name}</div>
              <div class="alert-desc">${tip} · 剩余 ${a.quantity}${a.unit || ''}</div>
            </div>
            <div class="alert-actions">${actions}</div>
          </div>`;
      })
      .join('');
  }

  // 今日用药（处方+自行使用）
  renderTodayDose('homeTodayMeds');
}

// 清理单个过期批次：从库存移除并归档到历史药库
function clearExpiredBatch(id) {
  const inv = getInventory();
  const item = inv.find((i) => i.id === id);
  if (!item) return;
  if (!confirm(`确定清理已过期的「${item.name}」吗？\n将移入历史药库，记录为「过期清理」。`)) return;
  item.quantity = 0;
  archiveEmptyBatches(inv, new Set([id]), '过期清理');
  saveInventory(inv);
  renderHome();
  if (document.getElementById('page-inventory').classList.contains('page-active')) {
    renderInventoryList();
  }
  toast('已清理，移入历史药库');
}

// 一键清理所有过期批次
function clearAllExpired() {
  const inv = getInventory();
  const expired = inv.filter((i) => getExpiryStatus(i.expiryDate).status === 'expired');
  if (!expired.length) {
    toast('没有过期药品');
    return;
  }
  const names = expired.map((i) => `${i.name}×${i.quantity}${i.unit || ''}`).join('\n');
  if (!confirm(`将清理以下 ${expired.length} 个过期批次，移入历史药库：\n\n${names}\n\n确定清理吗？`)) return;
  const ids = new Set(expired.map((i) => i.id));
  expired.forEach((i) => (i.quantity = 0));
  archiveEmptyBatches(inv, ids, '过期清理');
  saveInventory(inv);
  renderHome();
  if (document.getElementById('page-inventory').classList.contains('page-active')) {
    renderInventoryList();
  }
  toast(`已清理 ${expired.length} 个过期批次`);
}

/* ===== 医药库 ===== */
/* ---- 药品图片（压缩为 base64 存储） ---- */
let pendingMedImage = null;

function handleMedImage(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const max = 320; // 最长边压缩到 320px，控制 localStorage 体积
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      pendingMedImage = canvas.toDataURL('image/jpeg', 0.7);
      updateMedImagePreview();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function clearMedImage() {
  pendingMedImage = null;
  document.getElementById('mImageFile').value = '';
  updateMedImagePreview();
}

function updateMedImagePreview() {
  const prev = document.getElementById('medImagePreview');
  const clearBtn = document.getElementById('medImageClear');
  if (!prev || !clearBtn) return;
  if (pendingMedImage) {
    prev.innerHTML = `<img src="${pendingMedImage}" alt="药品图片" />`;
    prev.classList.remove('hidden');
    clearBtn.classList.remove('hidden');
  } else {
    prev.innerHTML = '';
    prev.classList.add('hidden');
    clearBtn.classList.add('hidden');
  }
}

function openMedicineModal(id) {
  document.getElementById('medicineForm').reset();
  document.getElementById('medicineId').value = '';
  document.getElementById('medicineModalTitle').textContent = '新增药品';
  pendingMedImage = null;
  updateMedImagePreview();
  if (id) {
    const med = getMedicines().find((m) => m.id === id);
    if (med) {
      document.getElementById('medicineModalTitle').textContent = '编辑药品';
      document.getElementById('medicineId').value = med.id;
      document.getElementById('mName').value = med.name || '';
      document.getElementById('mGenericName').value = med.genericName || '';
      document.getElementById('mManufacturer').value = med.manufacturer || '';
      document.getElementById('mFunction').value = med.function || '';
      document.getElementById('mContraindications').value = med.contraindications || '';
      document.getElementById('mNotes').value = med.notes || '';
      document.getElementById('mSpec').value = med.spec || '';
      document.getElementById('mPackUnit').value = med.packUnit || '';
      document.getElementById('mDosePerPack').value = med.dosePerPack ?? '';
      document.getElementById('mDoseUnit').value = med.doseUnit || '';
      document.getElementById('mBidPrice').value = med.bidPrice ?? '';
      document.getElementById('mUsageMode').value = med.usageMode || 'auto';
      pendingMedImage = med.image || null;
      updateMedImagePreview();
    }
  }
  document.getElementById('medicineModal').classList.add('active');
}
function closeMedicineModal() {
  document.getElementById('medicineModal').classList.remove('active');
}

document.getElementById('medicineForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('medicineId').value;
  const data = {
    name: document.getElementById('mName').value.trim(),
    genericName: document.getElementById('mGenericName').value.trim(),
    manufacturer: document.getElementById('mManufacturer').value.trim(),
    function: document.getElementById('mFunction').value.trim(),
    contraindications: document.getElementById('mContraindications').value.trim(),
    notes: document.getElementById('mNotes').value.trim(),
    spec: document.getElementById('mSpec').value.trim(),
    packUnit: document.getElementById('mPackUnit').value.trim(),
    dosePerPack: Number(document.getElementById('mDosePerPack').value) || null,
    doseUnit: document.getElementById('mDoseUnit').value.trim(),
    bidPrice: Number(document.getElementById('mBidPrice').value) || null,
    usageMode: document.getElementById('mUsageMode').value,
    image: pendingMedImage || null,
  };
  if (!data.name) {
    toast('请输入药品名称');
    return;
  }
  const meds = getMedicines();
  if (id) {
    const idx = meds.findIndex((m) => m.id === id);
    if (idx >= 0) meds[idx] = { ...meds[idx], ...data, updatedAt: Date.now() };
  } else {
    meds.unshift({ id: uid(), ...data, createdAt: Date.now() });
  }
  saveMedicines(meds);
  closeMedicineModal();
  renderMedicineList();
  toast(id ? '已更新' : '已添加');
});

function deleteMedicine(id) {
  if (!confirm('确定删除该药品？库存中关联的记录不会被删除。')) return;
  saveMedicines(getMedicines().filter((m) => m.id !== id));
  renderMedicineList();
  toast('已删除');
}

function renderMedicineList() {
  const keyword = document.getElementById('medicineSearch').value.trim().toLowerCase();
  let meds = getMedicines();
  if (keyword) {
    meds = meds.filter(
      (m) =>
        (m.name || '').toLowerCase().includes(keyword) ||
        (m.genericName || '').toLowerCase().includes(keyword) ||
        (m.manufacturer || '').toLowerCase().includes(keyword) ||
        (m.spec || '').toLowerCase().includes(keyword)
    );
  }
  const list = document.getElementById('medicineList');
  const empty = document.getElementById('medicineEmpty');
  if (meds.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = keyword ? '没有找到匹配的药品' : '医药库还是空的';
  } else {
    empty.classList.add('hidden');
    list.innerHTML = meds
      .map(
        (m) => `
        <div class="list-item" onclick="viewMedicineDetail('${m.id}')">
          <div class="item-top">
            ${m.image ? `<img class="med-thumb" src="${m.image}" alt="" />` : ''}
            <div style="flex:1;min-width:0">
              <div class="item-name">${m.name}</div>
              ${m.genericName ? `<div class="item-sub">通用名：${m.genericName}</div>` : ''}
              ${m.spec ? `<div class="item-sub">规格：${m.spec}</div>` : ''}
              ${m.manufacturer ? `<div class="item-sub" style="margin-top:4px">厂家：${m.manufacturer}</div>` : ''}
            </div>
          </div>
          ${
            m.packUnit || m.doseUnit || m.bidPrice || m.usageMode === 'manual'
              ? `<div class="item-meta">
            ${m.packUnit ? `<span>包装单位：${m.packUnit}</span>` : ''}
            ${m.doseUnit ? `<span>使用单位：${m.doseUnit}</span>` : ''}
            ${m.bidPrice ? `<span class="price-tag">中标价 ¥${fmtNum(m.bidPrice)}</span>` : ''}
            ${m.usageMode === 'manual' ? '<span class="badge badge-manual">手动调整</span>' : ''}
          </div>`
              : ''
          }
          <div class="item-actions" onclick="event.stopPropagation()">
            <button class="btn-edit" onclick="openMedicineModal('${m.id}')">编辑</button>
            <button class="btn-del" onclick="deleteMedicine('${m.id}')">删除</button>
          </div>
        </div>`
      )
      .join('');
  }
}
document.getElementById('medicineSearch').addEventListener('input', renderMedicineList);

function viewMedicineDetail(id) {
  const m = getMedicines().find((x) => x.id === id);
  if (!m) return;
  const body = document.getElementById('medicineDetailBody');
  const rows = [
    ['药品ID', shortId(m.id)],
    ['药品名称', m.name],
    ['通用名', m.genericName],
    ['规格', m.spec],
    ['生产厂家', m.manufacturer],
    ['包装单位', m.packUnit],
    ['每包装含量', m.dosePerPack ? fmtNum(m.dosePerPack) + (m.doseUnit || '') : ''],
    ['使用单位', m.doseUnit],
    ['中标价', m.bidPrice ? '¥' + fmtNum(m.bidPrice) : ''],
    ['用量模式', m.usageMode === 'manual' ? '手动调整（外用药/药膏等，打卡不自动扣库存）' : '自动扣减'],
    ['功能 / 适应症', m.function],
    ['禁忌', m.contraindications],
    ['备注', m.notes],
  ];
  body.innerHTML =
    (m.image ? `<img class="detail-img" src="${m.image}" alt="药品图片" />` : '') +
    rows
      .filter(([, v]) => v)
      .map(
        ([k, v]) => `
      <div class="detail-row">
        <div class="detail-label">${k}</div>
        <div class="detail-value">${v}</div>
      </div>`
      )
      .join('');
  document.getElementById('medicineDetailModal').classList.add('active');
}
function closeMedicineDetail() {
  document.getElementById('medicineDetailModal').classList.remove('active');
}

/* ===== 库存 ===== */
function populateMedicineSelect() {
  const sel = document.getElementById('invMedicine');
  sel.innerHTML =
    '<option value="">-- 请选择 --</option>' +
    getMedicines()
      .map((m) => `<option value="${m.id}">${m.name}${m.spec ? '｜' + m.spec : ''}${m.genericName ? '（' + m.genericName + '）' : ''}</option>`)
      .join('');
}

function openInventoryModal(id) {
  document.getElementById('inventoryForm').reset();
  document.getElementById('inventoryId').value = '';
  document.getElementById('inventoryModalTitle').textContent = '入库登记';
  populateMedicineSelect();
  document.getElementById('invPurchaseDate').value = new Date().toISOString().slice(0, 10);
  if (id) {
    const inv = getInventory().find((i) => i.id === id);
    if (inv) {
      document.getElementById('inventoryModalTitle').textContent = '编辑库存';
      document.getElementById('inventoryId').value = inv.id;
      document.getElementById('invMedicine').value = inv.medicineId || '';
      document.getElementById('invName').value = inv.name || '';
      document.getElementById('invPurchaseDate').value = inv.purchaseDate || '';
      document.getElementById('invExpiryDate').value = inv.expiryDate || '';
      document.getElementById('invQuantity').value = inv.quantity ?? 1;
      document.getElementById('invUnit').value = inv.unit || '盒';
      document.getElementById('invDosePerPack').value = inv.dosePerPack ?? '';
      document.getElementById('invDoseUnit').value = inv.doseUnit || '';
      document.getElementById('invPaidPrice').value = inv.paidPrice ?? '';
      document.getElementById('invLocation').value = inv.location || '';
      document.getElementById('invNotes').value = inv.notes || '';
    }
  }
  document.getElementById('inventoryModal').classList.add('active');
}
function closeInventoryModal() {
  document.getElementById('inventoryModal').classList.remove('active');
}

document.getElementById('inventoryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('inventoryId').value;
  const medicineId = document.getElementById('invMedicine').value;
  const manualName = document.getElementById('invName').value.trim();
  let name = manualName;
  let spec = '';
  if (medicineId) {
    const med = getMedicines().find((m) => m.id === medicineId);
    if (med) {
      name = med.name;
      spec = med.spec || '';
    }
  }
  if (!name) {
    toast('请选择药品或输入药品名称');
    return;
  }
  const expiryDate = document.getElementById('invExpiryDate').value;
  if (!expiryDate) {
    toast('请选择有效期');
    return;
  }
  const data = {
    medicineId: medicineId || null,
    name,
    spec,
    purchaseDate: document.getElementById('invPurchaseDate').value,
    expiryDate,
    quantity: Number(document.getElementById('invQuantity').value) || 0,
    unit: document.getElementById('invUnit').value.trim(),
    dosePerPack: Number(document.getElementById('invDosePerPack').value) || null,
    doseUnit: document.getElementById('invDoseUnit').value.trim(),
    paidPrice: Number(document.getElementById('invPaidPrice').value) || null,
    location: document.getElementById('invLocation').value.trim(),
    notes: document.getElementById('invNotes').value.trim(),
  };
  const inv = getInventory();
  if (id) {
    const idx = inv.findIndex((i) => i.id === id);
    if (idx >= 0) inv[idx] = { ...inv[idx], ...data, updatedAt: Date.now() };
    // 编辑后数量为0：进入历史药库
    archiveEmptyBatches(inv, new Set([id]), '用完');
  } else {
    const newId = uid();
    inv.unshift({ id: newId, ...data, initialQuantity: data.quantity, createdAt: Date.now() });
    // 记录初始入库流水
    addLedgerEntry(newId, data.medicineId, data.name, 'create', 'initial', null, data.quantity, data.quantity, '手动入库登记');
  }
  saveInventory(inv);
  closeInventoryModal();
  renderInventoryList();
  toast(id ? (data.quantity === 0 ? '已清零并移入历史药库' : '已更新') : '已入库');
});

// 选择药品后自动带出包装单位与换算信息
document.getElementById('invMedicine').addEventListener('change', function () {
  const med = getMedicines().find((m) => m.id === this.value);
  if (med) {
    if (med.packUnit) document.getElementById('invUnit').value = med.packUnit;
    document.getElementById('invDosePerPack').value = med.dosePerPack ?? '';
    document.getElementById('invDoseUnit').value = med.doseUnit || '';
  }
});

function deleteInventory(id) {
  if (!confirm('确定删除该库存记录？')) return;
  saveInventory(getInventory().filter((i) => i.id !== id));
  renderInventoryList();
  toast('已删除');
}

/* ---- 库存视图切换：按包装单位（明细）/ 按使用单位（合并统计）/ 采购记录 ---- */
let invView = 'pack';
let invStatGroups = [];
let invHideSpec = false;
let invHideExpiry = false;

function setInvView(v) {
  invView = v;
  document.querySelectorAll('#invViewTabs .med-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === v);
  });
  renderInventoryPage();
}

function renderInventoryPage() {
  // 显示/隐藏搜索栏和统计切换
  const searchBar = document.getElementById('invSearchBar');
  const statToggles = document.getElementById('invStatToggles');
  const purchaseFab = document.getElementById('purchaseFab');
  const invFab = document.getElementById('invFab');

  if (invView === 'purchase') {
    searchBar.classList.add('hidden');
    statToggles.classList.add('hidden');
    invFab.classList.add('hidden');
    purchaseFab.classList.remove('hidden');
    renderPurchaseList();
    return;
  }
  if (invView === 'finished') {
    statToggles.classList.add('hidden');
    invFab.classList.add('hidden');
    purchaseFab.classList.add('hidden');
    searchBar.classList.remove('hidden');
    renderFinishedList();
    return;
  }
  searchBar.classList.remove('hidden');
  purchaseFab.classList.add('hidden');
  invFab.classList.remove('hidden');
  if (invView === 'dose') {
    statToggles.classList.remove('hidden');
    renderInvStats();
  } else {
    statToggles.classList.add('hidden');
    renderInvDetail();
  }
}

function toggleHideSpec() {
  invHideSpec = !invHideSpec;
  document.getElementById('toggleHideSpec').classList.toggle('active', invHideSpec);
  renderInvStats();
}

function toggleHideExpiry() {
  invHideExpiry = !invHideExpiry;
  document.getElementById('toggleHideExpiry').classList.toggle('active', invHideExpiry);
  renderInvStats();
}

// 按关键词过滤库存（名称/位置/规格）
function filterInvByKeyword(inv) {
  const keyword = document.getElementById('inventorySearch').value.trim().toLowerCase();
  if (!keyword) return inv;
  return inv.filter(
    (i) =>
      (i.name || '').toLowerCase().includes(keyword) ||
      (i.location || '').toLowerCase().includes(keyword) ||
      getInvSpec(i).toLowerCase().includes(keyword)
  );
}

function renderInventoryList() {
  renderInventoryPage();
}

// 明细视图：默认列出全部库存（按效期排序），同一药品不同效期分别列出
function renderInvDetail() {
  const keyword = document.getElementById('inventorySearch').value.trim();
  const filter = document.getElementById('inventoryFilter').value;
  let inv = filterInvByKeyword(getInventory());
  if (filter !== 'all') {
    inv = inv.filter((i) => getExpiryStatus(i.expiryDate).status === filter);
  }
  inv.sort((a, b) => {
    const sa = getExpiryStatus(a.expiryDate);
    const sb = getExpiryStatus(b.expiryDate);
    const rank = { expired: 0, soon: 1, valid: 2 };
    if (rank[sa.status] !== rank[sb.status]) return rank[sa.status] - rank[sb.status];
    return (sa.days ?? 9999) - (sb.days ?? 9999);
  });

  const list = document.getElementById('inventoryList');
  const empty = document.getElementById('inventoryEmpty');
  if (inv.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = keyword || filter !== 'all' ? '没有匹配的库存' : '还没有库存记录';
  } else {
    empty.classList.add('hidden');
    list.innerHTML = inv
      .map((i) => {
        const { status } = getExpiryStatus(i.expiryDate);
        const badgeClass = `badge-${status}`;
        const badgeText = status === 'expired' ? '已过期' : status === 'soon' ? '临期' : '正常';
        const spec = getInvSpec(i);
        const dt = invDoseTotal(i);
        const qtyText = `剩余 ${fmtNum(i.quantity)}${i.unit || ''}${dt != null ? `（≈ ${fmtNum(dt)}${i.doseUnit || ''}）` : ''}`;
        return `
        <div class="list-item" onclick="viewInventoryDetail('${i.id}')">
          <div class="item-top">
            <div style="flex:1;min-width:0">
              <div class="item-name">${i.name}</div>
              ${spec ? `<div class="item-sub">规格：${spec}</div>` : ''}
              <div class="item-sub">${qtyText}${i.location ? ' · ' + i.location : ''}</div>
            </div>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="item-meta">
            <span>有效期至 ${fmtDate(i.expiryDate)}</span>
            <span>${statusLabel(i)}</span>
            ${i.paidPrice ? `<span class="price-tag">实付 ¥${fmtNum(i.paidPrice)}</span>` : ''}
          </div>
          <div class="item-actions" onclick="event.stopPropagation()">
            <button class="btn-edit" onclick="openInventoryModal('${i.id}')">编辑</button>
            <button onclick="openAdjustModal('${i.id}')">调整</button>
            <button class="btn-del" onclick="deleteInventory('${i.id}')">删除</button>
          </div>
        </div>`;
      })
      .join('');
  }
}

// 使用单位视图：按名称+规格+效期合并统计，可切换"不显示规格""不显示效期"
function renderInvStats() {
  const inv = filterInvByKeyword(getInventory());
  const groups = new Map();
  inv.forEach((i) => {
    const spec = getInvSpec(i);
    const keyParts = [i.name || ''];
    if (!invHideSpec) keyParts.push(spec || '未设规格');
    if (!invHideExpiry) keyParts.push(i.expiryDate || '无效期');
    const key = keyParts.join('｜');
    if (!groups.has(key)) {
      groups.set(key, { name: i.name || '', spec: invHideSpec ? '' : spec, expiryDate: invHideExpiry ? '' : i.expiryDate, items: [] });
    }
    groups.get(key).items.push(i);
  });
  invStatGroups = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'));

  const list = document.getElementById('inventoryList');
  const empty = document.getElementById('inventoryEmpty');
  if (invStatGroups.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = document.getElementById('inventorySearch').value.trim() ? '没有匹配的药品' : '还没有库存记录';
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = invStatGroups
    .map((g, idx) => {
      const expired = g.items.some((i) => getExpiryStatus(i.expiryDate).status === 'expired');
      const soon = g.items.some((i) => getExpiryStatus(i.expiryDate).status === 'soon');
      const badge = expired ? '<span class="badge badge-expired">有过期</span>' : soon ? '<span class="badge badge-soon">有临期</span>' : '';
      const dates = g.items.map((i) => i.expiryDate).filter(Boolean).sort();
      const dose = doseText(g.items);
      const packs = packsText(g.items);
      const mainText = dose ? `≈ ${dose}` : `共 ${packs}`;
      const subText = dose ? `共 ${packs} · ${g.items.length} 条记录` : `${g.items.length} 条记录`;
      return `
      <div class="list-item" onclick="jumpToGroup(${idx})">
        <div class="item-top">
          <div style="flex:1;min-width:0">
            <div class="item-name">${g.name}</div>
            ${g.spec ? `<div class="item-sub">规格：${g.spec}</div>` : ''}
          </div>
          ${badge}
        </div>
        <div class="item-sub" style="margin-top:6px">${mainText}</div>
        <div class="item-meta">
          <span>${subText}</span>
          ${dates.length && !invHideExpiry ? `<span>最早到期 ${fmtDate(dates[0])}</span>` : ''}
        </div>
      </div>`;
    })
    .join('');
}

// 点击统计分组 → 跳转包装单位视图（明细）并按名称筛选
function jumpToGroup(idx) {
  const g = invStatGroups[idx];
  if (!g) return;
  document.getElementById('inventorySearch').value = g.name;
  setInvView('pack');
}

// 汇总各包装数量文本，如 "2盒 + 1瓶"
function packsText(items) {
  const byUnit = {};
  items.forEach((i) => {
    const u = i.unit || '件';
    byUnit[u] = (byUnit[u] || 0) + (Number(i.quantity) || 0);
  });
  return Object.entries(byUnit)
    .map(([u, q]) => `${fmtNum(q)}${u}`)
    .join(' + ');
}

// 汇总折算使用单位文本，如 "40颗"（无换算信息时返回空串）
function doseText(items) {
  let total = 0;
  let unit = '';
  let any = false;
  items.forEach((i) => {
    const per = Number(i.dosePerPack) || 0;
    if (per > 0) {
      any = true;
      total += (Number(i.quantity) || 0) * per;
      if (!unit && i.doseUnit) unit = i.doseUnit;
    }
  });
  return any ? `${fmtNum(total)}${unit}` : '';
}
document.getElementById('inventorySearch').addEventListener('input', renderInventoryList);
document.getElementById('inventoryFilter').addEventListener('change', renderInventoryList);

/* ---- 库存手动调整 ---- */
const ADJUST_REASONS = {
  lost: '丢失/找不到',
  gift: '送人',
  damaged: '损坏',
  expired: '已过期丢弃',
  used_up: '已用完',
  other: '其他',
};

function openAdjustModal(invId) {
  const inv = getInventory().find((i) => i.id === invId);
  if (!inv) return;
  document.getElementById('adjustInvId').value = inv.id;
  document.getElementById('adjustMedName').textContent = inv.name;
  document.getElementById('adjustOldQty').textContent = `${fmtNum(inv.quantity)}${inv.unit || ''}`;
  document.getElementById('adjustNewQty').value = inv.quantity;
  document.getElementById('adjustReason').value = 'lost';
  document.getElementById('adjustNote').value = '';
  document.getElementById('adjustModal').classList.add('active');
}
function closeAdjustModal() {
  document.getElementById('adjustModal').classList.remove('active');
}

document.getElementById('adjustForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const invId = document.getElementById('adjustInvId').value;
  const inv = getInventory();
  const idx = inv.findIndex((i) => i.id === invId);
  if (idx < 0) {
    toast('库存记录不存在');
    return;
  }
  const oldQty = Number(inv[idx].quantity) || 0;
  const newQty = Number(document.getElementById('adjustNewQty').value) || 0;
  if (newQty === oldQty) {
    toast('数量未变化');
    return;
  }
  const reason = document.getElementById('adjustReason').value;
  const note = document.getElementById('adjustNote').value.trim();
  inv[idx].quantity = newQty;
  inv[idx].updatedAt = Date.now();
  saveInventory(inv);
  // 记录调整历史
  const adjustments = getAdjustments();
  const adjustId = uid();
  adjustments.unshift({
    id: adjustId,
    inventoryId: invId,
    medicineId: inv[idx].medicineId,
    medicineName: inv[idx].name,
    oldQuantity: oldQty,
    newQuantity: newQty,
    delta: newQty - oldQty,
    reason,
    reasonText: ADJUST_REASONS[reason] || reason,
    note,
    createdAt: Date.now(),
  });
  saveAdjustments(adjustments);
  // 记录库存流水
  addLedgerEntry(invId, inv[idx].medicineId, inv[idx].name, 'adjust', 'manual', adjustId, newQty - oldQty, newQty, `${ADJUST_REASONS[reason] || reason}${note ? '：' + note : ''}`);
  // 调整为0：进入历史药库
  if (newQty === 0) {
    archiveEmptyBatches(inv, new Set([invId]), ADJUST_REASONS[reason] || reason);
  }
  saveInventory(inv);
  closeAdjustModal();
  renderInventoryList();
  toast(newQty === 0 ? `已清零并移入历史药库` : `已调整：${fmtNum(oldQty)} → ${fmtNum(newQty)}${inv[idx] ? inv[idx].unit || '' : ''}`);
});

/* ---- 库存查看详情（含使用明细） ---- */
function viewInventoryDetail(id) {
  const i = getInventory().find((x) => x.id === id);
  if (!i) return;
  const med = i.medicineId ? getMedicines().find((m) => m.id === i.medicineId) : null;
  const { status } = getExpiryStatus(i.expiryDate);
  const advice =
    status === 'expired'
      ? '⚠️ 此药品已过期，请勿服用，建议妥善丢弃。'
      : status === 'soon'
      ? '🕒 临近有效期，建议尽快使用。'
      : '✅ 在有效期内，可正常使用。';
  const spec = getInvSpec(i);
  const dt = invDoseTotal(i);
  const rows = [
    ['库存ID', shortId(i.id)],
    ['药品名称', i.name],
    ['规格', spec],
    ['剩余数量', `${fmtNum(i.quantity)}${i.unit || ''}${dt != null ? `（≈ ${fmtNum(dt)}${i.doseUnit || ''}）` : ''}`],
    ['药品ID', i.medicineId ? shortId(i.medicineId) : '—'],
    ['采购ID', i.purchaseId ? shortId(i.purchaseId) : '—'],
    ['购买日期', i.purchaseDate ? fmtDate(i.purchaseDate) : ''],
    ['实付价格', i.paidPrice ? `¥${fmtNum(i.paidPrice)}` : ''],
    ['有效期至', fmtDate(i.expiryDate) + '（' + statusLabel(i) + '）'],
    ['存放位置', i.location],
    ['备注', i.notes],
  ];
  let html = `<div class="detail-row"><div class="detail-label">效期提示</div><div class="detail-value"><strong>${advice}</strong></div></div>`;
  html += rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `
      <div class="detail-row">
        <div class="detail-label">${k}</div>
        <div class="detail-value">${v}</div>
      </div>`
    )
    .join('');
  if (med) {
    html += `
      <div class="detail-row">
        <div class="detail-label">关联医药库信息</div>
        <div class="detail-value">
          ${med.manufacturer ? '厂家：' + med.manufacturer + '<br>' : ''}
          ${med.spec ? '规格：' + med.spec + '<br>' : ''}
          ${med.bidPrice ? '中标价：¥' + fmtNum(med.bidPrice) + '<br>' : ''}
          ${med.function ? '功能：' + med.function + '<br>' : ''}
          ${med.contraindications ? '禁忌：' + med.contraindications : ''}
        </div>
      </div>`;
  }

  // 使用明细（库存流水：增加明细 / 减少明细 / 手动调整明细）
  const ledger = getInvLedger()
    .filter((l) => l.inventoryId === id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const increases = ledger.filter((l) => l.delta > 0);   // 增加明细
  const decreases = ledger.filter((l) => l.delta < 0);    // 减少明细
  const adjusts = ledger.filter((l) => l.type === 'adjust'); // 手动调整明细

  const SOURCE_LABELS = {
    purchase: '采购入库', prescription: '处方用药', selfuse: '自行使用',
    manual: '手动调整', initial: '入库登记',
  };

  function renderLedgerList(items, title) {
    if (items.length === 0) return '';
    let h = `<div class="detail-section-title">${title}（${items.length}条）</div>`;
    h += '<div class="adjust-history">';
    items.forEach((l) => {
      const sign = l.delta > 0 ? '+' : '';
      const deltaClass = l.delta > 0 ? 'adjust-up' : 'adjust-down';
      const refLabel = l.refId ? ` · ${SOURCE_LABELS[l.source] || l.source}ID：${shortId(l.refId)}` : '';
      h += `
        <div class="adjust-record">
          <div class="adjust-record-top">
            <span class="adjust-delta ${deltaClass}">${sign}${fmtNum(l.delta)}${i.unit || ''}</span>
            <span class="adjust-reason">${SOURCE_LABELS[l.source] || l.source}</span>
          </div>
          <div class="adjust-detail">余额 ${fmtNum(l.balance)}${i.unit || ''}${refLabel}</div>
          ${l.reason ? `<div class="adjust-note">${l.reason}</div>` : ''}
          <div class="adjust-time">${fmtDateTime(l.createdAt)}</div>
        </div>`;
    });
    h += '</div>';
    return h;
  }

  html += renderLedgerList(increases, '📈 增加明细');
  html += renderLedgerList(decreases, '📉 减少明细');
  html += renderLedgerList(adjusts, '🔧 手动调整明细');
  if (ledger.length === 0) {
    html += '<div class="empty-tip">暂无库存流水记录</div>';
  }

  html += `
    <div class="detail-actions">
      <button class="btn btn-primary" onclick="closeInventoryDetail(); openAdjustModal('${id}')">调整数量</button>
    </div>`;

  document.getElementById('inventoryDetailBody').innerHTML = html;
  document.getElementById('inventoryDetailModal').classList.add('active');
}
function closeInventoryDetail() {
  document.getElementById('inventoryDetailModal').classList.remove('active');
}

/* ===================== 采购记录 ===================== */
function populatePurchaseMedSelect() {
  const sel = document.getElementById('purMedicine');
  sel.innerHTML =
    '<option value="">-- 请选择 --</option>' +
    getMedicines()
      .map((m) => `<option value="${m.id}">${m.name}${m.spec ? '｜' + m.spec : ''}${m.genericName ? '（' + m.genericName + '）' : ''}</option>`)
      .join('');
}

function openPurchaseModal() {
  document.getElementById('purchaseForm').reset();
  document.getElementById('purchaseId').value = '';
  document.getElementById('purchaseModalTitle').textContent = '新增采购记录';
  populatePurchaseMedSelect();
  document.getElementById('purPurchaseDate').value = todayStr();
  document.getElementById('purSource').value = 'purchase';
  document.getElementById('purQuantity').value = 1;
  document.getElementById('purchaseModal').classList.add('active');
}
function closePurchaseModal() {
  document.getElementById('purchaseModal').classList.remove('active');
}

// 选择药品后自动带出包装单位与换算信息
document.getElementById('purMedicine').addEventListener('change', function () {
  const med = getMedicines().find((m) => m.id === this.value);
  if (med) {
    if (med.packUnit) document.getElementById('purUnit').value = med.packUnit;
    document.getElementById('purDosePerPack').value = med.dosePerPack ?? '';
    document.getElementById('purDoseUnit').value = med.doseUnit || '';
  }
});

document.getElementById('purchaseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const medicineId = document.getElementById('purMedicine').value;
  const manualName = document.getElementById('purName').value.trim();
  let name = manualName;
  let spec = '';
  if (medicineId) {
    const med = getMedicines().find((m) => m.id === medicineId);
    if (med) {
      name = med.name;
      spec = med.spec || '';
    }
  }
  if (!name) {
    toast('请选择药品或输入药品名称');
    return;
  }
  const expiryDate = document.getElementById('purExpiryDate').value;
  if (!expiryDate) {
    toast('请选择有效期');
    return;
  }
  const purchaseDate = document.getElementById('purPurchaseDate').value || todayStr();
  const quantity = Number(document.getElementById('purQuantity').value) || 0;
  const unit = document.getElementById('purUnit').value.trim() || '盒';
  const dosePerPack = Number(document.getElementById('purDosePerPack').value) || null;
  const doseUnit = document.getElementById('purDoseUnit').value.trim();
  const paidPrice = Number(document.getElementById('purPaidPrice').value) || null;
  const location = document.getElementById('purLocation').value.trim();
  const notes = document.getElementById('purNotes').value.trim();
  const source = document.getElementById('purSource').value;

  // 创建采购记录
  const purId = uid();
  const purchases = getPurchases();
  purchases.unshift({
    id: purId,
    medicineId: medicineId || null,
    medicineName: name,
    spec,
    purchaseDate,
    expiryDate,
    quantity,
    unit,
    dosePerPack,
    doseUnit,
    paidPrice,
    source,
    location,
    notes,
    createdAt: Date.now(),
  });
  savePurchases(purchases);

  // 自动在库存新增一条记录
  const inv = getInventory();
  const invId = uid();
  inv.unshift({
    id: invId,
    medicineId: medicineId || null,
    name,
    spec,
    purchaseDate,
    expiryDate,
    quantity,
    unit,
    dosePerPack,
    doseUnit,
    paidPrice,
    location,
    notes: notes ? (source === 'gift' ? '赠予：' + notes : '采购入库：' + notes) : (source === 'gift' ? '赠予' : '采购入库'),
    purchaseId: purId,
    initialQuantity: quantity,
    createdAt: Date.now(),
  });
  // 记录采购入库流水
  addLedgerEntry(invId, medicineId, name, 'create', 'purchase', purId, quantity, quantity, `${source === 'gift' ? '赠予' : '采购'}入库 ${fmtNum(quantity)}${unit}`);
  saveInventory(inv);

  closePurchaseModal();
  renderPurchaseList();
  toast(`已记录采购并入库：${name} ${fmtNum(quantity)}${unit}`);
});

function renderPurchaseList() {
  const purchases = getPurchases().sort((a, b) => b.createdAt - a.createdAt);
  const list = document.getElementById('inventoryList');
  const empty = document.getElementById('inventoryEmpty');
  if (purchases.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = '还没有采购记录';
  } else {
    empty.classList.add('hidden');
    list.innerHTML = purchases
      .map((p) => {
        const srcBadge = p.source === 'gift' ? '<span class="badge badge-gift">赠予</span>' : '<span class="badge badge-valid">采购</span>';
        const spec = p.spec ? `<div class="item-sub">规格：${p.spec}</div>` : '';
        return `
        <div class="list-item" onclick="viewPurchaseDetail('${p.id}')">
          <div class="item-top">
            <div style="flex:1;min-width:0">
              <div class="item-name">${p.medicineName}</div>
              ${spec}
              <div class="item-sub">采购ID：${shortId(p.id)}</div>
            </div>
            ${srcBadge}
          </div>
          <div class="item-meta">
            <span>${fmtNum(p.quantity)}${p.unit || ''}</span>
            <span>采购日期 ${fmtDate(p.purchaseDate)}</span>
            <span>效期至 ${fmtDate(p.expiryDate)}</span>
            ${p.paidPrice ? `<span class="price-tag">实付 ¥${fmtNum(p.paidPrice)}</span>` : ''}
          </div>
        </div>`;
      })
      .join('');
  }
}

function viewPurchaseDetail(id) {
  const p = getPurchases().find((x) => x.id === id);
  if (!p) return;
  const rows = [
    ['采购ID', shortId(p.id)],
    ['药品名称', p.medicineName],
    ['规格', p.spec],
    ['来源', p.source === 'gift' ? '赠予' : '采购'],
    ['采购日期', fmtDate(p.purchaseDate)],
    ['有效期至', fmtDate(p.expiryDate)],
    ['数量', `${fmtNum(p.quantity)}${p.unit || ''}`],
    ['每包装含量', p.dosePerPack ? fmtNum(p.dosePerPack) + (p.doseUnit || '') : ''],
    ['使用单位', p.doseUnit],
    ['实付价格', p.paidPrice ? `¥${fmtNum(p.paidPrice)}` : ''],
    ['存放位置', p.location],
    ['备注', p.notes],
  ];
  const body = document.getElementById('inventoryDetailBody');
  body.innerHTML =
    '<div class="detail-section-title">📦 采购记录详情</div>' +
    rows
      .filter(([, v]) => v)
      .map(
        ([k, v]) => `
      <div class="detail-row">
        <div class="detail-label">${k}</div>
        <div class="detail-value">${v}</div>
      </div>`
    )
    .join('') +
    `<div class="detail-actions">
      <button class="btn btn-del" onclick="deletePurchase('${p.id}')">删除</button>
    </div>`;
  document.getElementById('inventoryDetailModal').classList.add('active');
}

function deletePurchase(id) {
  if (!confirm('确定删除该采购记录？关联的库存记录不会被删除。')) return;
  savePurchases(getPurchases().filter((p) => p.id !== id));
  closeInventoryDetail();
  renderPurchaseList();
  toast('已删除');
}

/* ===================== 历史药库 ===================== */
// 按 名称+规格+效期 分组统计：用完过几次、每次几盒（包装单位）
function renderFinishedList() {
  let finished = getFinished().sort((a, b) => b.finishedAt - a.finishedAt);
  const keyword = document.getElementById('inventorySearch').value.trim().toLowerCase();
  if (keyword) {
    finished = finished.filter(
      (f) => (f.name || '').toLowerCase().includes(keyword) || (f.spec || '').toLowerCase().includes(keyword)
    );
  }
  const list = document.getElementById('inventoryList');
  const empty = document.getElementById('inventoryEmpty');
  if (finished.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    empty.querySelector('p').textContent = keyword ? '没有匹配的记录' : '历史药库还是空的';
    return;
  }
  empty.classList.add('hidden');
  // 分组：同名称同规格同效期
  const groups = new Map();
  finished.forEach((f) => {
    const key = [f.name || '', f.spec || '', f.expiryDate || ''].join('｜');
    if (!groups.has(key)) {
      groups.set(key, { name: f.name, spec: f.spec, expiryDate: f.expiryDate, unit: f.unit, items: [] });
    }
    groups.get(key).items.push(f);
  });
  list.innerHTML = Array.from(groups.values())
    .map((g) => {
      const count = g.items.length;
      const totalPacks = g.items.reduce((s, x) => s + (Number(x.initialQuantity) || 0), 0);
      const unit = g.unit || '';
      const timesHtml = g.items
        .sort((a, b) => a.finishedAt - b.finishedAt)
        .map(
          (x, idx) => `
          <div class="finished-record">
            <span class="finished-qty">第${idx + 1}次 ${fmtNum(x.initialQuantity)}${unit}</span>
            <span class="finished-meta">${fmtDate(x.finishedAt)} · ${x.reason || '用完'}</span>
          </div>`
        )
        .join('');
      return `
      <div class="list-item">
        <div class="item-top">
          <div style="flex:1;min-width:0">
            <div class="item-name">${g.name}</div>
            ${g.spec ? `<div class="item-sub">规格：${g.spec}</div>` : ''}
            <div class="item-sub">有效期至 ${fmtDate(g.expiryDate)}</div>
          </div>
          <span class="badge badge-finished">共 ${count} 次</span>
        </div>
        <div class="item-meta">
          <span>累计 ${fmtNum(totalPacks)}${unit}</span>
        </div>
        <div class="finished-list">${timesHtml}</div>
      </div>`;
    })
    .join('');
}

/* ===================== 自行使用 ===================== */
function populateSelfUseMedSelect() {
  const sel = document.getElementById('suMedicine');
  sel.innerHTML =
    '<option value="">-- 手动输入药名 --</option>' +
    getMedicines()
      .map((m) => `<option value="${m.id}">${m.name}${m.spec ? '｜' + m.spec : ''}${m.genericName ? '（' + m.genericName + '）' : ''}</option>`)
      .join('');
}

function updateSuTimeInputs() {
  const n = Number(document.getElementById('suTimesPerDay').value);
  const wrap = document.getElementById('suTimeInputs');
  const old = Array.from(wrap.querySelectorAll('input[type="time"]')).map((i) => i.value);
  const tpl = TIME_TEMPLATES[n] || [];
  let html = '';
  for (let i = 0; i < n; i++) {
    const val = old[i] || tpl[i] || '08:00';
    html += `<input type="time" class="time-input" value="${val}" />`;
  }
  wrap.innerHTML = html;
}

function updateSuEndDateHint() {
  const start = document.getElementById('suStartDate').value;
  const days = Number(document.getElementById('suDays').value);
  const hint = document.getElementById('suEndDateHint');
  if (start && days > 0) {
    hint.textContent = addDays(start, days - 1);
  } else {
    hint.textContent = '—';
  }
}

function openSelfUseModal() {
  const form = document.getElementById('selfUseForm');
  form.reset();
  document.getElementById('selfUseId').value = '';
  document.getElementById('selfUseModalTitle').textContent = '新增自行使用';
  populateSelfUseMedSelect();
  document.getElementById('suMode').value = 'period';
  document.getElementById('suStartDate').value = todayStr();
  document.getElementById('suDays').value = 7;
  document.getElementById('suTimesPerDay').value = '3';
  toggleSuMode();
  updateSuTimeInputs();
  updateSuEndDateHint();
  document.getElementById('selfUseModal').classList.add('active');
}
function closeSelfUseModal() {
  document.getElementById('selfUseModal').classList.remove('active');
}

// 切换模式时显示/隐藏时间段相关字段
function toggleSuMode() {
  const mode = document.getElementById('suMode').value;
  const periodFields = document.getElementById('suPeriodFields');
  if (mode === 'period') {
    periodFields.classList.remove('hidden');
  } else {
    periodFields.classList.add('hidden');
  }
}
document.getElementById('suMode').addEventListener('change', toggleSuMode);
document.getElementById('suStartDate').addEventListener('change', updateSuEndDateHint);
document.getElementById('suDays').addEventListener('input', updateSuEndDateHint);
document.getElementById('suTimesPerDay').addEventListener('change', updateSuTimeInputs);

// 选择药品后清空手动输入
document.getElementById('suMedicine').addEventListener('change', function () {
  if (this.value) document.getElementById('suMedName').value = '';
});

document.getElementById('selfUseForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('selfUseId').value;
  const medicineId = document.getElementById('suMedicine').value;
  const manualName = document.getElementById('suMedName').value.trim();
  let medicineName = manualName;
  if (medicineId) {
    const med = getMedicines().find((m) => m.id === medicineId);
    if (med) medicineName = med.name;
  }
  if (!medicineName) {
    toast('请选择或输入药品名称');
    return;
  }
  const mode = document.getElementById('suMode').value;
  const dosage = document.getElementById('suDosage').value.trim();
  const instruction = document.getElementById('suInstruction').value;
  const reason = document.getElementById('suReason').value.trim();
  const notes = document.getElementById('suNotes').value.trim();

  let data = {
    medicineId: medicineId || null,
    medicineName,
    dosage,
    instruction,
    reason,
    notes,
    mode,
  };

  if (mode === 'period') {
    const startDate = document.getElementById('suStartDate').value;
    const days = Number(document.getElementById('suDays').value);
    if (!startDate || !days || days < 1) {
      toast('请填写开始日期和用药天数');
      return;
    }
    const timeList = Array.from(document.querySelectorAll('#suTimeInputs input[type="time"]'))
      .map((i) => i.value)
      .filter(Boolean)
      .sort();
    if (timeList.length === 0) {
      toast('请至少设置一个使用时间点');
      return;
    }
    data.startDate = startDate;
    data.days = days;
    data.endDate = addDays(startDate, days - 1);
    data.timeList = timeList;
  } else {
    // 单次使用
    data.useDate = document.getElementById('suStartDate').value || todayStr();
    data.startDate = data.useDate;
    data.endDate = data.useDate;
    data.timeList = [nowHM()];
    data.days = 1;
  }

  const list = getSelfUse();
  if (id) {
    const idx = list.findIndex((s) => s.id === id);
    if (idx >= 0) {
      const old = list[idx];
      const merged = { ...old, ...data, updatedAt: Date.now() };
      if (old.status !== 'active' && merged.endDate >= todayStr()) {
        merged.status = 'active';
        merged.finishedAt = null;
      }
      list[idx] = merged;
    }
  } else {
    list.unshift({
      id: uid(),
      ...data,
      status: 'active',
      checkins: {},
      finishedAt: null,
      createdAt: Date.now(),
    });
  }
  saveSelfUse(list);
  closeSelfUseModal();
  renderSelfUseList();
  toast(id ? '已更新' : '已创建自行使用');
});

// 自行使用归档逻辑（同处方）
function archiveSelfUseIfNeeded() {
  const today = todayStr();
  const list = getSelfUse();
  const inv = getInventory();
  let changed = false;
  list.forEach((su) => {
    if (su.status !== 'active') return;
    let done = false;
    if (su.endDate && su.endDate < today) {
      done = true;
    } else if (su.mode === 'period') {
      const recs = inv.filter((i) =>
        su.medicineId ? i.medicineId === su.medicineId : (i.name || '') === (su.medicineName || '')
      );
      if (recs.length > 0 && recs.every((i) => (Number(i.quantity) || 0) <= 0)) done = true;
    }
    if (done) {
      su.status = 'finished';
      su.finishedAt = Date.now();
      changed = true;
    }
  });
  if (changed) saveSelfUse(list);
}

// 今日自行使用清单
function getTodaySelfUseList() {
  const today = todayStr();
  const items = [];
  getSelfUse()
    .filter((su) => su.status === 'active' && su.startDate <= today && today <= su.endDate)
    .forEach((su) => {
      const doneList = (su.checkins && su.checkins[today]) || [];
      su.timeList.forEach((t) => {
        items.push({
          suId: su.id,
          time: t,
          name: su.medicineName,
          dosage: su.dosage || '',
          instruction: su.instruction || '',
          done: doneList.includes(t),
        });
      });
    });
  items.sort((a, b) => a.time.localeCompare(b.time));
  return items;
}

function renderSelfUseList() {
  archiveSelfUseIfNeeded();
  const active = getSelfUse()
    .filter((su) => su.status === 'active')
    .sort((a, b) => (a.startDate > b.startDate ? 1 : -1));
  const history = getSelfUse()
    .filter((su) => su.status !== 'active')
    .sort((a, b) => (b.finishedAt || b.createdAt) - (a.finishedAt || a.createdAt));

  const list = document.getElementById('selfUseList');
  let html = '';

  if (active.length === 0 && history.length === 0) {
    list.innerHTML = '<div class="empty-tip">还没有自行使用记录<br>点击右下角 + 新增</div>';
    return;
  }

  if (active.length > 0) {
    html += '<div class="sub-section-title">进行中</div>';
    html += active
      .map((su) => {
        const modeBadge = su.mode === 'once'
          ? '<span class="badge badge-valid">单次</span>'
          : '<span class="badge badge-valid">时间段</span>';
        const times = su.timeList.join(' / ');
        const prog = su.mode === 'period' ? courseProgress(su) : null;
        return `
        <div class="list-item" onclick="viewSelfUseDetail('${su.id}')">
          <div class="item-top">
            <div style="flex:1;min-width:0">
              <div class="item-name">${su.medicineName}</div>
              <div class="item-sub">ID：${shortId(su.id)}${su.dosage ? ' · ' + su.dosage : ''}</div>
              ${su.mode === 'period' ? `<div class="item-sub">每日 ${su.timeList.length} 次 ${times ? '（' + times + '）' : ''}</div>` : `<div class="item-sub">使用日期 ${fmtDate(su.useDate || su.startDate)}</div>`}
            </div>
            ${modeBadge}
          </div>
          ${su.mode === 'period' ? `
          <div class="item-meta">
            <span>${fmtDate(su.startDate)} ~ ${fmtDate(su.endDate)}</span>
            <span>${remainingDaysText(su)}</span>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((prog.current / prog.total) * 100)}%"></div></div>
            <span class="progress-text">第 ${prog.current} / ${prog.total} 天</span>
          </div>` : ''}
          <div class="item-actions" onclick="event.stopPropagation()">
            <button class="btn-edit" onclick="openSelfUseModal('${su.id}')">编辑</button>
            <button onclick="stopSelfUse('${su.id}')">结束</button>
          </div>
        </div>`;
      })
      .join('');
  }

  if (history.length > 0) {
    html += '<div class="sub-section-title">历史</div>';
    html += history
      .map((su) => {
        const badge = su.status === 'finished' ? '<span class="badge badge-valid">正常结束</span>' : '<span class="badge badge-soon">已停用</span>';
        return `
        <div class="list-item" onclick="viewSelfUseDetail('${su.id}')">
          <div class="item-top">
            <div style="flex:1;min-width:0">
              <div class="item-name">${su.medicineName}</div>
              <div class="item-sub">ID：${shortId(su.id)}</div>
            </div>
            ${badge}
          </div>
          <div class="item-meta">
            <span>${fmtDate(su.startDate)} ~ ${fmtDate(su.endDate)}</span>
            ${su.reason ? `<span>${su.reason}</span>` : ''}
          </div>
          <div class="item-actions" onclick="event.stopPropagation()">
            <button class="btn-del" onclick="deleteSelfUse('${su.id}')">删除</button>
          </div>
        </div>`;
      })
      .join('');
  }

  list.innerHTML = html;
}

function viewSelfUseDetail(id) {
  const su = getSelfUse().find((s) => s.id === id);
  if (!su) return;
  const statusMap = { active: '进行中', finished: '正常结束', stopped: '已停用' };
  const instrMap = { before: '饭前', after: '饭后', empty: '空腹', sleep: '睡前', any: '不限' };
  const rows = [
    ['记录ID', shortId(su.id)],
    ['药品名称', su.medicineName],
    ['使用模式', su.mode === 'once' ? '单次使用' : '时间段使用'],
    ['每次用量', su.dosage],
    ['使用要求', instrMap[su.instruction] || ''],
    ['使用原因', su.reason],
  ];
  if (su.mode === 'period') {
    rows.push(['每日次数', `${su.timeList.length} 次（${su.timeList.join(' / ')}）`]);
    rows.push(['使用周期', `${fmtDate(su.startDate)} ~ ${fmtDate(su.endDate)}（共 ${su.days} 天）`]);
  } else {
    rows.push(['使用日期', fmtDate(su.useDate || su.startDate)]);
  }
  rows.push(['备注', su.notes]);
  rows.push(['状态', statusMap[su.status] || su.status]);

  // 打卡统计
  let totalDose = 0, takenDose = 0;
  const start = su.startDate, end = su.status === 'active' ? todayStr() : su.endDate;
  if (start && end && end >= start) {
    let d = start;
    while (d <= end) {
      totalDose += su.timeList.length;
      takenDose += ((su.checkins && su.checkins[d]) || []).length;
      d = addDays(d, 1);
    }
  }
  let html = `<div class="detail-row"><div class="detail-label">使用记录</div><div class="detail-value">已打卡 <strong>${takenDose}</strong> / ${totalDose} 次</div></div>`;
  html += rows
    .filter(([, v]) => v)
    .map(([k, v]) => `
      <div class="detail-row">
        <div class="detail-label">${k}</div>
        <div class="detail-value">${v}</div>
      </div>`)
    .join('');
  if (su.medicineId) {
    const med = getMedicines().find((m) => m.id === su.medicineId);
    if (med && (med.function || med.contraindications)) {
      html += `
      <div class="detail-row">
        <div class="detail-label">关联医药库信息</div>
        <div class="detail-value">
          ${med.function ? '功能：' + med.function + '<br>' : ''}
          ${med.contraindications ? '禁忌：' + med.contraindications : ''}
        </div>
      </div>`;
    }
  }
  document.getElementById('inventoryDetailBody').innerHTML = html;
  document.getElementById('inventoryDetailModal').classList.add('active');
}

function deleteSelfUse(id) {
  if (!confirm('确定删除该自行使用记录？打卡记录将一并删除。')) return;
  saveSelfUse(getSelfUse().filter((s) => s.id !== id));
  renderSelfUseList();
  toast('已删除');
}

function stopSelfUse(id) {
  if (!confirm('确定提前结束该自行使用？将归入历史。')) return;
  const list = getSelfUse();
  const su = list.find((s) => s.id === id);
  if (su) {
    su.status = 'stopped';
    su.finishedAt = Date.now();
    saveSelfUse(list);
  }
  renderSelfUseList();
  toast('已结束，移入历史');
}

// 自行使用打卡：扣库存逻辑同处方
function toggleSelfUseCheckin(suId, time) {
  const today = todayStr();
  const list = getSelfUse();
  const su = list.find((s) => s.id === suId);
  if (!su) return;
  if (!su.checkins) su.checkins = {};
  if (!su.checkins[today]) su.checkins[today] = [];
  const idx = su.checkins[today].indexOf(time);
  if (idx >= 0) {
    su.checkins[today].splice(idx, 1);
    const res = applyStockForUse(su, 1);
    toast(res ? `已取消打卡，库存 +${res.text}` : '已取消打卡');
  } else {
    su.checkins[today].push(time);
    // 检查药品用量模式
    const med = su.medicineId ? getMedicines().find((m) => m.id === su.medicineId) : null;
    if (med && med.usageMode === 'manual') {
      // 方案A：打卡只记录，不扣库存
      toast('已记录使用（手动调整模式，请手动调整库存）');
    } else {
      const res = applyStockForUse(su, -1);
      if (res) {
        toast(`已记录使用 💊 库存 -${res.text}${res.approx ? '（按1包装估算）' : ''}${res.emptied ? '，该药已用完' : ''}`);
      } else {
        toast('已记录使用 💊（库存中未找到该药）');
      }
    }
  }
  saveSelfUse(list);
  renderTodayDose('homeTodayMeds');
  renderTodayDose('medTodayMeds');
  if (document.getElementById('page-inventory').classList.contains('page-active')) {
    renderInventoryList();
  }
  if (document.getElementById('page-medication').classList.contains('page-active')) {
    renderSelfUseList();
  }
}

/* ===================== 用药管理（处方） ===================== */

// 每日次数默认时间点模板
const TIME_TEMPLATES = {
  1: ['09:00'],
  2: ['08:00', '20:00'],
  3: ['08:00', '13:00', '20:00'],
  4: ['08:00', '12:00', '16:00', '20:00'],
  5: ['08:00', '11:00', '14:00', '17:00', '20:00'],
  6: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
};

// 到期自动归档：
// 1) 疗程结束日期已过 → 正常结束（中途忘记打卡不影响，不打卡也不扣库存）
// 2) 疗程未结束但关联药品的库存已全部用完（有入库记录且数量均为 0）→ 提前正常结束
// 手动提前停药的走 stopPrescription，状态为"已停用"
function archiveIfNeeded() {
  const today = todayStr();
  const rxs = getPrescriptions();
  const inv = getInventory();
  let changed = false;
  rxs.forEach((rx) => {
    if (rx.status !== 'active') return;
    let done = false;
    if (rx.endDate && rx.endDate < today) {
      done = true;
    } else {
      const recs = inv.filter((i) =>
        rx.medicineId ? i.medicineId === rx.medicineId : (i.name || '') === (rx.medicineName || '')
      );
      if (recs.length > 0 && recs.every((i) => (Number(i.quantity) || 0) <= 0)) done = true;
    }
    if (done) {
      rx.status = 'finished';
      rx.finishedAt = Date.now();
      changed = true;
    }
  });
  if (changed) savePrescriptions(rxs);
  archiveSelfUseIfNeeded();
}

// 今日用药清单（处方+自行使用）
function getTodayDoseList() {
  const today = todayStr();
  const items = [];
  // 处方用药
  getPrescriptions()
    .filter((rx) => rx.status === 'active' && rx.startDate <= today && today <= rx.endDate)
    .forEach((rx) => {
      const doneList = (rx.checkins && rx.checkins[today]) || [];
      rx.timeList.forEach((t) => {
        items.push({
          rxId: rx.id,
          time: t,
          name: rx.medicineName || rx.name,
          dosage: rx.dosage || '',
          instruction: rx.instruction || '',
          done: doneList.includes(t),
          type: 'rx',
        });
      });
    });
  // 自行使用
  getSelfUse()
    .filter((su) => su.status === 'active' && su.startDate <= today && today <= su.endDate)
    .forEach((su) => {
      const doneList = (su.checkins && su.checkins[today]) || [];
      su.timeList.forEach((t) => {
        items.push({
          suId: su.id,
          time: t,
          name: su.medicineName,
          dosage: su.dosage || '',
          instruction: su.instruction || '',
          done: doneList.includes(t),
          type: 'self',
        });
      });
    });
  items.sort((a, b) => a.time.localeCompare(b.time));
  return items;
}

// 渲染今日用药（首页与用药页共用）
function renderTodayDose(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  archiveIfNeeded();
  const items = getTodayDoseList();
  if (items.length === 0) {
    el.innerHTML = '<div class="empty-tip">今天没有用药计划</div>';
    return;
  }
  const now = nowHM();
  el.innerHTML = items
    .map((it) => {
      let stateClass = '';
      let btnHtml = '';
      const toggleFn = it.type === 'self' ? 'toggleSelfUseCheckin' : 'toggleCheckin';
      const itemId = it.type === 'self' ? it.suId : it.rxId;
      if (it.done) {
        stateClass = 'dose-done';
        btnHtml = `<button class="dose-btn done" onclick="${toggleFn}('${itemId}','${it.time}')">✓ 已用</button>`;
      } else if (it.time <= now) {
        stateClass = 'dose-due';
        btnHtml = `<button class="dose-btn due" onclick="${toggleFn}('${itemId}','${it.time}')">使用</button>`;
      } else {
        stateClass = 'dose-wait';
        btnHtml = `<button class="dose-btn" onclick="${toggleFn}('${itemId}','${it.time}')">使用</button>`;
      }
      const typeBadge = it.type === 'self' ? '<span class="dose-type">自用</span>' : '';
      return `
        <div class="dose-item ${stateClass}">
          <div class="dose-time">${it.time}</div>
          <div class="dose-info">
            <div class="dose-name">${it.name} ${typeBadge}</div>
            <div class="dose-desc">${[it.dosage, it.instruction].filter(Boolean).join(' · ') || '&nbsp;'}</div>
          </div>
          ${btnHtml}
        </div>`;
    })
    .join('');
}

// 用药页面渲染
let medTab = 'today';
function renderMedicationPage() {
  archiveIfNeeded();
  setMedTab(medTab);
}

function setMedTab(tab) {
  medTab = tab;
  document.querySelectorAll('#page-medication .med-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.getElementById('medTabToday').classList.toggle('hidden', tab !== 'today');
  document.getElementById('medTabActive').classList.toggle('hidden', tab !== 'active');
  document.getElementById('medTabSelfUse').classList.toggle('hidden', tab !== 'selfuse');
  document.getElementById('medTabHistory').classList.toggle('hidden', tab !== 'history');
  // FAB 切换：处方页显示 rxFab，自用页显示 suFab
  document.getElementById('rxFab').classList.toggle('hidden', tab === 'selfuse');
  document.getElementById('suFab').classList.toggle('hidden', tab !== 'selfuse');
  if (tab === 'today') renderTodayDose('medTodayMeds');
  if (tab === 'active') renderActivePrescriptions();
  if (tab === 'selfuse') renderSelfUseList();
  if (tab === 'history') renderHistoryPrescriptions();
}

// 计算剩余天数文案
function remainingDaysText(rx) {
  const today = todayStr();
  if (today < rx.startDate) {
    const d = Math.round((new Date(rx.startDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    return `${d} 天后开始`;
  }
  const d = Math.round((new Date(rx.endDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  if (d < 0) return '已结束';
  if (d === 0) return '今天结束';
  return `剩余 ${d} 天`;
}

// 疗程进度：第几天/共几天
function courseProgress(rx) {
  const total = Number(rx.days) || 1;
  const today = todayStr();
  let passed = Math.round((new Date(today + 'T00:00:00') - new Date(rx.startDate + 'T00:00:00')) / 86400000) + 1;
  passed = Math.max(1, Math.min(passed, total));
  return { current: passed, total };
}

function renderActivePrescriptions() {
  const active = getPrescriptions()
    .filter((rx) => rx.status === 'active')
    .sort((a, b) => (a.startDate > b.startDate ? 1 : -1));
  const list = document.getElementById('medActiveList');
  if (active.length === 0) {
    list.innerHTML = '<div class="empty-tip">没有进行中的用药计划<br>点击右下角 + 新建处方</div>';
    return;
  }
  list.innerHTML = active
    .map((rx) => {
      const prog = courseProgress(rx);
      const times = rx.timeList.join(' / ');
      return `
      <div class="list-item" onclick="viewPrescriptionDetail('${rx.id}')">
        <div class="item-top">
          <div style="flex:1;min-width:0">
            <div class="item-name">${rx.medicineName || rx.name}</div>
            <div class="item-sub">${rx.dosage ? rx.dosage + ' · ' : ''}每日 ${rx.timeList.length} 次 ${times ? '（' + times + '）' : ''}</div>
          </div>
          <span class="badge badge-valid">${rx.instruction || '按时服用'}</span>
        </div>
        <div class="item-meta">
          <span>${fmtDate(rx.startDate)} ~ ${fmtDate(rx.endDate)}</span>
          <span>${remainingDaysText(rx)}</span>
        </div>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((prog.current / prog.total) * 100)}%"></div></div>
          <span class="progress-text">第 ${prog.current} / ${prog.total} 天</span>
        </div>
        <div class="item-actions" onclick="event.stopPropagation()">
          <button class="btn-edit" onclick="openPrescriptionModal('${rx.id}')">编辑</button>
          <button onclick="stopPrescription('${rx.id}')">提前结束</button>
        </div>
      </div>`;
    })
    .join('');
}

function renderHistoryPrescriptions() {
  const history = getPrescriptions()
    .filter((rx) => rx.status !== 'active')
    .sort((a, b) => (b.finishedAt || b.createdAt) - (a.finishedAt || a.createdAt));
  const list = document.getElementById('medHistoryList');
  if (history.length === 0) {
    list.innerHTML = '<div class="empty-tip">暂无历史处方<br>完成的用药计划会自动归档到这里</div>';
    return;
  }
  list.innerHTML = history
    .map((rx) => {
      const badge = rx.status === 'finished' ? '<span class="badge badge-valid">正常结束</span>' : '<span class="badge badge-soon">已停用</span>';
      return `
      <div class="list-item" onclick="viewPrescriptionDetail('${rx.id}')">
        <div class="item-top">
          <div style="flex:1;min-width:0">
            <div class="item-name">${rx.medicineName || rx.name}</div>
            <div class="item-sub">${rx.dosage ? rx.dosage + ' · ' : ''}每日 ${rx.timeList.length} 次</div>
          </div>
          ${badge}
        </div>
        <div class="item-meta">
          <span>${fmtDate(rx.startDate)} ~ ${fmtDate(rx.endDate)}</span>
          ${rx.reason ? `<span>${rx.reason}</span>` : ''}
        </div>
        <div class="item-actions" onclick="event.stopPropagation()">
          <button class="btn-edit" onclick="openPrescriptionModal('${rx.id}')">编辑</button>
          <button class="btn-del" onclick="deletePrescription('${rx.id}')">删除</button>
        </div>
      </div>`;
    })
    .join('');
}

/* ---- 处方表单 ---- */
function populateRxMedicineSelect() {
  const sel = document.getElementById('rxMedicine');
  sel.innerHTML =
    '<option value="">-- 手动输入药名 --</option>' +
    getMedicines()
      .map((m) => `<option value="${m.id}">${m.name}${m.spec ? '｜' + m.spec : ''}${m.genericName ? '（' + m.genericName + '）' : ''}</option>`)
      .join('');
}

function updateTimeInputs() {
  const n = Number(document.getElementById('rxTimesPerDay').value);
  const wrap = document.getElementById('timeInputs');
  const old = Array.from(wrap.querySelectorAll('input[type="time"]')).map((i) => i.value);
  const tpl = TIME_TEMPLATES[n] || [];
  let html = '';
  for (let i = 0; i < n; i++) {
    const val = old[i] || tpl[i] || '08:00';
    html += `<input type="time" class="time-input" value="${val}" />`;
  }
  wrap.innerHTML = html;
}

// 更新表单中结束日期提示
function updateEndDateHint() {
  const start = document.getElementById('rxStartDate').value;
  const days = Number(document.getElementById('rxDays').value);
  const hint = document.getElementById('rxEndDateHint');
  if (start && days > 0) {
    hint.textContent = addDays(start, days - 1);
  } else {
    hint.textContent = '—';
  }
}

function openPrescriptionModal(id) {
  const form = document.getElementById('prescriptionForm');
  form.reset();
  document.getElementById('prescriptionId').value = '';
  document.getElementById('prescriptionModalTitle').textContent = '新建处方';
  populateRxMedicineSelect();
  document.getElementById('rxStartDate').value = todayStr();
  document.getElementById('rxTimesPerDay').value = '3';
  updateTimeInputs();
  updateEndDateHint();
  if (id) {
    const rx = getPrescriptions().find((r) => r.id === id);
    if (rx) {
      document.getElementById('prescriptionModalTitle').textContent = '编辑处方';
      document.getElementById('prescriptionId').value = rx.id;
      document.getElementById('rxName').value = rx.name || '';
      document.getElementById('rxMedicine').value = rx.medicineId || '';
      document.getElementById('rxMedName').value = rx.medicineId ? '' : (rx.medicineName || '');
      document.getElementById('rxDosage').value = rx.dosage || '';
      document.getElementById('rxStartDate').value = rx.startDate || todayStr();
      document.getElementById('rxDays').value = rx.days || 7;
      document.getElementById('rxTimesPerDay').value = String(rx.timeList.length);
      updateTimeInputs();
      // 恢复原有时间点
      const inputs = Array.from(document.querySelectorAll('#timeInputs input[type="time"]'));
      inputs.forEach((inp, i) => { if (rx.timeList[i]) inp.value = rx.timeList[i]; });
      document.getElementById('rxInstruction').value = rx.instruction || '';
      document.getElementById('rxReason').value = rx.reason || '';
      document.getElementById('rxDoctor').value = rx.doctor || '';
      document.getElementById('rxNotes').value = rx.notes || '';
    }
  }
  document.getElementById('prescriptionModal').classList.add('active');
}
function closePrescriptionModal() {
  document.getElementById('prescriptionModal').classList.remove('active');
}

document.getElementById('prescriptionForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('prescriptionId').value;
  const medicineId = document.getElementById('rxMedicine').value;
  const manualName = document.getElementById('rxMedName').value.trim();
  let medicineName = manualName;
  if (medicineId) {
    const med = getMedicines().find((m) => m.id === medicineId);
    if (med) medicineName = med.name;
  }
  if (!medicineName) {
    toast('请选择或输入药品名称');
    return;
  }
  const startDate = document.getElementById('rxStartDate').value;
  const days = Number(document.getElementById('rxDays').value);
  if (!startDate || !days || days < 1) {
    toast('请填写开始日期和用药天数');
    return;
  }
  const timeList = Array.from(document.querySelectorAll('#timeInputs input[type="time"]'))
    .map((i) => i.value)
    .filter(Boolean)
    .sort();
  if (timeList.length === 0) {
    toast('请至少设置一个使用时间点');
    return;
  }
  const data = {
    name: document.getElementById('rxName').value.trim() || medicineName,
    medicineId: medicineId || null,
    medicineName,
    dosage: document.getElementById('rxDosage').value.trim(),
    startDate,
    days,
    endDate: addDays(startDate, days - 1),
    timeList,
    instruction: document.getElementById('rxInstruction').value,
    reason: document.getElementById('rxReason').value.trim(),
    doctor: document.getElementById('rxDoctor').value.trim(),
    notes: document.getElementById('rxNotes').value.trim(),
  };
  const rxs = getPrescriptions();
  if (id) {
    const idx = rxs.findIndex((r) => r.id === id);
    if (idx >= 0) {
      // 保留打卡记录与状态；如已归档但改了结束日期在未来的话恢复进行中
      const old = rxs[idx];
      const merged = { ...old, ...data, updatedAt: Date.now() };
      if (old.status !== 'active' && merged.endDate >= todayStr()) {
        merged.status = 'active';
        merged.finishedAt = null;
      }
      rxs[idx] = merged;
    }
  } else {
    rxs.unshift({
      id: uid(),
      ...data,
      status: 'active',
      checkins: {},
      finishedAt: null,
      createdAt: Date.now(),
    });
  }
  savePrescriptions(rxs);
  closePrescriptionModal();
  if (document.getElementById('page-medication').classList.contains('page-active')) {
    renderMedicationPage();
  } else {
    renderHome();
  }
  toast(id ? '处方已更新' : '用药计划已创建');
});

// 选择药品后清空手动输入
document.getElementById('rxMedicine').addEventListener('change', function () {
  if (this.value) document.getElementById('rxMedName').value = '';
});

function deletePrescription(id) {
  if (!confirm('确定删除该处方记录？打卡记录将一并删除。')) return;
  savePrescriptions(getPrescriptions().filter((r) => r.id !== id));
  renderMedicationPage();
  toast('已删除');
}

// 提前结束（停用）
function stopPrescription(id) {
  if (!confirm('确定提前结束该用药计划？计划将归入历史。')) return;
  const rxs = getPrescriptions();
  const rx = rxs.find((r) => r.id === id);
  if (rx) {
    rx.status = 'stopped';
    rx.finishedAt = Date.now();
    savePrescriptions(rxs);
  }
  renderMedicationPage();
  toast('已结束，移入历史');
}

/* ---- 打卡 ---- */
// 从用量文本解析数量与单位，如 "2粒" → {num:2, unit:'粒'}；无数字默认 1
function parseDoseInfo(dosage) {
  const s = (dosage || '').trim();
  const m = /(\d+(?:\.\d+)?)/.exec(s);
  const num = m ? parseFloat(m[1]) : 1;
  let unit = '';
  if (m) {
    const rest = s.slice(m.index + m[0].length).trim();
    const um = /^[a-zA-Z\u4e00-\u9fa5]+/.exec(rest);
    if (um) unit = um[0];
  }
  return { num, unit };
}

// 处方打卡的库存增减：sign 为 -1 扣减（使用），+1 回加（取消打卡）
// 优先扣临期/过期的批次；有"每包装含量"时按使用单位折算
function applyStockForRx(rx, sign) {
  return applyStockInternal(rx.medicineId, rx.medicineName, rx.dosage, sign, rx.id, 'prescription');
}

// 自行使用打卡的库存增减
function applyStockForUse(su, sign) {
  return applyStockInternal(su.medicineId, su.medicineName, su.dosage, sign, su.id, 'selfuse');
}

// 通用库存增减逻辑
// refId/refType 用于关联流水记录（处方ID/自用ID）
function applyStockInternal(medicineId, medicineName, dosage, sign, refId, refType) {
  const { num, unit } = parseDoseInfo(dosage);
  const inv = getInventory();
  let cands = inv.filter((i) =>
    medicineId ? i.medicineId === medicineId : (i.name || '') === (medicineName || '')
  );
  cands = cands.filter((i) => (Number(i.quantity) || 0) > 0);
  // 回加时库存中无候选批次：尝试从历史药库恢复最近归档的批次
  if (!cands.length && sign > 0) {
    const restored = restoreFromFinished(medicineId, medicineName);
    if (restored) {
      inv.push(restored);
      saveInventory(inv);
      cands = [restored];
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (getExpiryStatus(a.expiryDate).days ?? 9999) - (getExpiryStatus(b.expiryDate).days ?? 9999));

  const changes = [];
  let left = num; // 还需处理的使用单位数
  let approx = false;
  for (const item of cands) {
    if (left <= 0) break;
    const per = Number(item.dosePerPack) || 0;
    const qty = Number(item.quantity) || 0;
    let delta = 0; // 本次变化量（正数）
    let changeText = '';
    if (per > 0) {
      // 可折算：按使用单位换算成包装数扣减/回加
      if (sign < 0) {
        // 扣减：受可用量限制
        const availDose = qty * per;
        const useDose = Math.min(availDose, left);
        if (useDose <= 0) continue;
        delta = useDose / per;
        item.quantity = Math.max(0, qty - delta);
        left -= useDose;
        changeText = `${fmtNum(useDose)}${item.doseUnit || ''}`;
      } else {
        // 回加：直接把剩余量加回去，不受可用量限制
        delta = left / per;
        item.quantity = qty + delta;
        changeText = `${fmtNum(left)}${item.doseUnit || ''}`;
        left = 0;
      }
    } else if (unit && (item.unit || '') === unit) {
      // 单位一致：直接按数量扣/加
      if (sign < 0) {
        delta = Math.min(qty, left);
        item.quantity = qty - delta;
        left -= delta;
      } else {
        // 回加：直接把剩余量加回去
        delta = left;
        item.quantity = qty + delta;
        left = 0;
      }
      changeText = `${fmtNum(delta)}${item.unit || ''}`;
    } else {
      // 无法精确换算：按 1 个包装估算，只处理一次
      delta = 1;
      item.quantity = sign < 0 ? Math.max(0, qty - 1) : qty + 1;
      approx = true;
      changeText = `1${item.unit || ''}`;
      left = 0;
    }
    // 记录库存流水
    const actualDelta = sign < 0 ? -delta : delta;
    addLedgerEntry(
      item.id, item.medicineId, item.name,
      sign < 0 ? 'decrease' : 'increase',
      refType || 'unknown', refId,
      actualDelta, item.quantity,
      `${refType === 'prescription' ? '处方' : refType === 'selfuse' ? '自行使用' : '用药'}打卡${sign < 0 ? '扣减' : '回加'} ${changeText}`
    );
    changes.push(changeText);
  }
  if (!changes.length) return null;
  // 扣减后数量为0的批次进入历史药库
  if (sign < 0) {
    archiveEmptyBatches(inv, new Set(cands.map((c) => c.id)), '用完');
  }
  saveInventory(inv);
  const emptied = cands.every((i) => (Number(i.quantity) || 0) <= 0);
  return { text: changes.join(' + '), approx, emptied };
}

function toggleCheckin(rxId, time) {
  const today = todayStr();
  const rxs = getPrescriptions();
  const rx = rxs.find((r) => r.id === rxId);
  if (!rx) return;
  if (!rx.checkins) rx.checkins = {};
  if (!rx.checkins[today]) rx.checkins[today] = [];
  const idx = rx.checkins[today].indexOf(time);
  if (idx >= 0) {
    rx.checkins[today].splice(idx, 1);
    const res = applyStockForRx(rx, 1);
    toast(res ? `已取消打卡，库存 +${res.text}` : '已取消打卡');
  } else {
    rx.checkins[today].push(time);
    // 检查药品用量模式
    const med = rx.medicineId ? getMedicines().find((m) => m.id === rx.medicineId) : null;
    if (med && med.usageMode === 'manual') {
      // 方案A：打卡只记录，不扣库存
      toast('已记录使用（手动调整模式，请手动调整库存）');
    } else {
      const res = applyStockForRx(rx, -1);
      if (res) {
        toast(`已记录使用 💊 库存 -${res.text}${res.approx ? '（按1包装估算）' : ''}${res.emptied ? '，该药已用完' : ''}`);
      } else {
        toast('已记录使用 💊（库存中未找到该药）');
      }
    }
  }
  savePrescriptions(rxs);
  renderTodayDose('homeTodayMeds');
  renderTodayDose('medTodayMeds');
  if (document.getElementById('page-inventory').classList.contains('page-active')) {
    renderInventoryList();
  }
}

/* ---- 处方详情 ---- */
function viewPrescriptionDetail(id) {
  const rx = getPrescriptions().find((r) => r.id === id);
  if (!rx) return;
  const statusMap = { active: '进行中', finished: '正常结束', stopped: '已停用' };
  const instrMap = { before: '饭前', after: '饭后', empty: '空腹', sleep: '睡前', any: '不限' };
  const rows = [
    ['处方ID', shortId(rx.id)],
    ['处方名称', rx.name],
    ['药品名称', rx.medicineName],
    ['每次用量', rx.dosage],
    ['用药原因', rx.reason],
    ['服用要求', instrMap[rx.instruction] || ''],
    ['每日次数', `${rx.timeList.length} 次（${rx.timeList.join(' / ')}）`],
    ['用药周期', `${fmtDate(rx.startDate)} ~ ${fmtDate(rx.endDate)}（共 ${rx.days} 天）`],
    ['医生 / 医院', rx.doctor],
    ['备注', rx.notes],
    ['状态', statusMap[rx.status] || rx.status],
  ];
  // 打卡统计
  let totalDose = 0, takenDose = 0;
  const start = rx.startDate, end = rx.status === 'active' ? todayStr() : rx.endDate;
  if (start && end && end >= start) {
    let d = start;
    while (d <= end) {
      totalDose += rx.timeList.length;
      takenDose += ((rx.checkins && rx.checkins[d]) || []).length;
      d = addDays(d, 1);
    }
  }
  let html = `<div class="detail-row"><div class="detail-label">用药记录</div><div class="detail-value">已打卡 <strong>${takenDose}</strong> / ${totalDose} 次</div></div>`;
  html += rows
    .filter(([, v]) => v)
    .map(([k, v]) => `
      <div class="detail-row">
        <div class="detail-label">${k}</div>
        <div class="detail-value">${v}</div>
      </div>`)
    .join('');
  if (rx.medicineId) {
    const med = getMedicines().find((m) => m.id === rx.medicineId);
    if (med && (med.function || med.contraindications)) {
      html += `
      <div class="detail-row">
        <div class="detail-label">关联医药库信息</div>
        <div class="detail-value">
          ${med.function ? '功能：' + med.function + '<br>' : ''}
          ${med.contraindications ? '禁忌：' + med.contraindications : ''}
        </div>
      </div>`;
    }
  }
  document.getElementById('prescriptionDetailBody').innerHTML = html;
  document.getElementById('prescriptionDetailModal').classList.add('active');
}
function closePrescriptionDetail() {
  document.getElementById('prescriptionDetailModal').classList.remove('active');
}

/* ---- 页面内到点提醒（Notification） ---- */
const NOTIFY_KEY = 'mb_notify_on';
const NOTIFIED_KEY = 'mb_notified_list';

function notifyEnabled() {
  return localStorage.getItem(NOTIFY_KEY) === '1';
}

function updateNotifyBtn() {
  const btn = document.getElementById('notifyToggle');
  if (!btn) return;
  if (notifyEnabled()) {
    btn.textContent = '🔔 到点提醒：已开启';
    btn.classList.add('on');
  } else {
    btn.textContent = '🔕 到点提醒：已关闭';
    btn.classList.remove('on');
  }
}

async function toggleNotify() {
  if (notifyEnabled()) {
    localStorage.setItem(NOTIFY_KEY, '0');
    toast('已关闭提醒');
  } else {
    if (!('Notification' in window)) {
      toast('当前浏览器不支持通知');
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm === 'granted') {
      localStorage.setItem(NOTIFY_KEY, '1');
      toast('已开启到点提醒');
    } else {
      toast('通知权限被拒绝，仍会在页面内提醒');
      localStorage.setItem(NOTIFY_KEY, '1');
    }
  }
  updateNotifyBtn();
}

function markNotified(id, time) {
  const list = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
  const today = todayStr();
  // 清理非今天的记录
  Object.keys(list).forEach((k) => {
    if (!k.startsWith(today)) delete list[k];
  });
  list[`${today}|${id}|${time}`] = true;
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(list));
}

function wasNotified(id, time) {
  const list = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
  return !!list[`${todayStr()}|${id}|${time}`];
}

// 每分钟检查：到点未打卡 → 发通知 + toast
function checkDoseReminders() {
  if (document.hidden) return;
  const now = nowHM();
  getTodayDoseList().forEach((it) => {
    const id = it.type === 'self' ? it.suId : it.rxId;
    if (it.time <= now && !it.done && !wasNotified(id, it.time)) {
      markNotified(id, it.time);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('💊 用药提醒', {
            body: `${it.time} 该使用「${it.name}」${it.dosage ? '（' + it.dosage + '）' : ''}`,
          });
        } catch {}
      }
      toast(`⏰ ${it.time} 该使用 ${it.name} 了`);
      renderTodayDose('homeTodayMeds');
      renderTodayDose('medTodayMeds');
    }
  });
}

/* ===================== 数据导入导出 ===================== */

// 构建备份数据对象
function buildBackup() {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'medicine-box',
    medicines: getMedicines(),
    inventory: getInventory(),
    prescriptions: getPrescriptions(),
    purchases: getPurchases(),
    selfUse: getSelfUse(),
    adjustments: getAdjustments(),
    invLedger: getInvLedger(),
    finished: getFinished(),
  };
}

// 校验并解析备份文本
function parseBackup(text) {
  try {
    const trimmed = text.trim();
    // 兼容可能带前缀的格式
    const jsonStr = trimmed.startsWith('MB_BK:') ? trimmed.slice(6) : trimmed;
    const data = JSON.parse(jsonStr);
    if (!data || typeof data !== 'object') return null;
    // 兼容旧格式：直接是数组或带 medicines/inventory 的对象
    const medicines = Array.isArray(data.medicines) ? data.medicines : (Array.isArray(data) ? [] : []);
    const inventory = Array.isArray(data.inventory) ? data.inventory : [];
    const prescriptions = Array.isArray(data.prescriptions) ? data.prescriptions : [];
    const purchases = Array.isArray(data.purchases) ? data.purchases : [];
    const selfUse = Array.isArray(data.selfUse) ? data.selfUse : [];
    const adjustments = Array.isArray(data.adjustments) ? data.adjustments : [];
    const invLedger = Array.isArray(data.invLedger) ? data.invLedger : [];
    const finished = Array.isArray(data.finished) ? data.finished : [];
    if (!medicines.length && !inventory.length && !prescriptions.length && !purchases.length && !selfUse.length) {
      // 可能是单数组格式
      if (Array.isArray(data) && data.length) {
        // 尝试判断是药品还是库存
        const sample = data[0];
        if (sample && (sample.expiryDate || sample.quantity !== undefined)) {
          return { medicines: [], inventory: data, prescriptions: [], purchases: [], selfUse: [], adjustments: [], invLedger: [], finished: [] };
        }
        if (sample && (sample.name && (sample.genericName !== undefined || sample.function !== undefined))) {
          return { medicines: data, inventory: [], prescriptions: [], purchases: [], selfUse: [], adjustments: [], invLedger: [], finished: [] };
        }
      }
      return null;
    }
    return { medicines, inventory, prescriptions, purchases, selfUse, adjustments, invLedger, finished };
  } catch {
    return null;
  }
}

/* ---- 导出 ---- */
function openExportModal() {
  const backup = buildBackup();
  document.getElementById('exportMedCount').textContent = backup.medicines.length;
  document.getElementById('exportInvCount').textContent = backup.inventory.length;
  document.getElementById('exportRxCount').textContent = backup.prescriptions.length;
  document.getElementById('exportPurCount').textContent = backup.purchases.length;
  document.getElementById('exportSuCount').textContent = backup.selfUse.length;
  document.getElementById('exportTime').textContent = fmtDate(new Date().toISOString().slice(0, 10));

  // 检查系统分享是否可用
  const shareBtn = document.getElementById('shareBtn');
  if (!navigator.share) {
    shareBtn.classList.add('disabled');
    shareBtn.querySelector('.export-desc').textContent = '当前浏览器不支持系统分享';
  } else {
    shareBtn.classList.remove('disabled');
    shareBtn.querySelector('.export-desc').textContent = '直接分享到微信、QQ等应用';
  }
  document.getElementById('exportModal').classList.add('active');
}
function closeExportModal() {
  document.getElementById('exportModal').classList.remove('active');
}

// 导出为文件下载
function exportAsFile() {
  const backup = buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `药箱备份_${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('备份文件已下载');
}

// 复制到剪贴板
async function exportAsClipboard() {
  const backup = buildBackup();
  const text = JSON.stringify(backup);
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板，可粘贴发送');
  } catch {
    // 降级方案：创建临时 textarea 执行复制
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('已复制到剪贴板');
    } catch {
      toast('复制失败，请手动选择文本');
    }
    document.body.removeChild(ta);
  }
}

// 系统分享
async function exportAsShare() {
  if (!navigator.share) {
    toast('当前浏览器不支持系统分享');
    return;
  }
  const backup = buildBackup();
  const text = JSON.stringify(backup);
  const ts = new Date().toISOString().slice(0, 10);
  try {
    await navigator.share({
      title: `药箱备份_${ts}`,
      text: '我的药箱数据备份，请使用"我的药箱"应用导入。',
      url: location.href,
    });
    toast('分享面板已打开');
  } catch (err) {
    if (err.name !== 'AbortError') {
      toast('分享失败，请改用复制到剪贴板');
    }
  }
}

/* ---- 导入 ---- */
function openImportModal() {
  // 重置状态
  document.getElementById('clipboardImportArea').classList.add('hidden');
  document.getElementById('importStrategyArea').classList.add('hidden');
  document.getElementById('clipboardText').value = '';
  document.getElementById('importFileInput').value = '';
  document.querySelector('input[name="strategy"][value="merge"]').checked = true;
  pendingBackup = null;
  document.getElementById('importModal').classList.add('active');
}
function closeImportModal() {
  document.getElementById('importModal').classList.remove('active');
  pendingBackup = null;
}

let pendingBackup = null;

// 从文件导入
function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    processImportText(text);
  };
  reader.onerror = () => toast('文件读取失败');
  reader.readAsText(file, 'utf-8');
}

// 打开剪贴板粘贴区
function openClipboardImport() {
  document.getElementById('clipboardImportArea').classList.remove('hidden');
  document.getElementById('clipboardText').focus();
}

// 从剪贴板粘贴
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      document.getElementById('clipboardText').value = text;
      toast('已粘贴');
    } else {
      toast('剪贴板为空');
    }
  } catch {
    toast('无法自动读取，请手动粘贴');
  }
}

// 从剪贴板文本导入
function importFromClipboard() {
  const text = document.getElementById('clipboardText').value.trim();
  if (!text) {
    toast('请先粘贴备份文本');
    return;
  }
  processImportText(text);
}

// 处理导入文本：解析 -> 显示策略选择
function processImportText(text) {
  const backup = parseBackup(text);
  if (!backup) {
    toast('备份格式不正确，无法解析');
    return;
  }
  const total = backup.medicines.length + backup.inventory.length + backup.prescriptions.length + backup.purchases.length + backup.selfUse.length;
  if (total === 0) {
    toast('备份中没有数据');
    return;
  }
  pendingBackup = backup;
  showStrategyArea(backup);
}

// 显示导入策略选择
function showStrategyArea(backup) {
  const area = document.getElementById('importStrategyArea');
  const info = document.getElementById('strategyInfo');
  const parts = [];
  if (backup.medicines.length) parts.push(`<strong>${backup.medicines.length}</strong> 个药品`);
  if (backup.inventory.length) parts.push(`<strong>${backup.inventory.length}</strong> 条库存记录`);
  if (backup.prescriptions.length) parts.push(`<strong>${backup.prescriptions.length}</strong> 个处方`);
  if (backup.purchases.length) parts.push(`<strong>${backup.purchases.length}</strong> 条采购记录`);
  if (backup.selfUse.length) parts.push(`<strong>${backup.selfUse.length}</strong> 条自行使用`);
  info.innerHTML = `备份包含：${parts.join('，')}。<br>请选择导入方式：`;
  area.classList.remove('hidden');
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cancelImportStrategy() {
  document.getElementById('importStrategyArea').classList.add('hidden');
  pendingBackup = null;
}

// 确认导入
function confirmImport() {
  if (!pendingBackup) {
    toast('没有可导入的数据');
    return;
  }
  const strategy = document.querySelector('input[name="strategy"]:checked').value;
  const backup = pendingBackup;
  const dataKeys = ['medicines', 'inventory', 'prescriptions', 'purchases', 'selfUse', 'adjustments', 'invLedger', 'finished'];
  const saveFns = {
    medicines: saveMedicines,
    inventory: saveInventory,
    prescriptions: savePrescriptions,
    purchases: savePurchases,
    selfUse: saveSelfUse,
    adjustments: saveAdjustments,
    invLedger: saveInvLedger,
    finished: saveFinished,
  };

  if (strategy === 'replace') {
    if (!confirm('确认覆盖？当前所有数据将被清空，仅保留备份中的数据。')) return;
    dataKeys.forEach((k) => saveFns[k](backup[k] || []));
    const parts = [];
    if (backup.medicines.length) parts.push(`${backup.medicines.length} 个药品`);
    if (backup.inventory.length) parts.push(`${backup.inventory.length} 条库存`);
    if (backup.prescriptions.length) parts.push(`${backup.prescriptions.length} 个处方`);
    if (backup.purchases.length) parts.push(`${backup.purchases.length} 条采购`);
    if (backup.selfUse.length) parts.push(`${backup.selfUse.length} 条自行使用`);
    toast(`已覆盖：${parts.join('，')}`);
  } else {
    // 合并：按 id 去重，已有 id 的保留现有，无 id 的新增
    const labels = { medicines: '药品', inventory: '库存', prescriptions: '处方', purchases: '采购', selfUse: '自行使用', adjustments: '调整', invLedger: '流水', finished: '历史药库' };
    const msgParts = [];
    let skipped = 0;
    dataKeys.forEach((k) => {
      const cur = load(STORAGE_KEYS[k]);
      const existingIds = new Set(cur.map((x) => x.id));
      let addedCount = 0;
      const merged = [...cur];
      (backup[k] || []).forEach((item) => {
        if (item.id && existingIds.has(item.id)) {
          skipped++;
        } else {
          merged.push({ ...item, id: item.id || uid() });
          if (item.id) existingIds.add(item.id);
          addedCount++;
        }
      });
      saveFns[k](merged);
      if (addedCount > 0) msgParts.push(`新增${labels[k]} ${addedCount}`);
    });
    if (skipped > 0) msgParts.push(`跳过重复 ${skipped}`);
    toast(msgParts.join('，') || '没有新数据');
  }

  pendingBackup = null;
  closeImportModal();
  renderHome();
}

/* ===== 初始化 ===== */
function init() {
  archiveIfNeeded();
  navTo('home');
  updateNotifyBtn();
  // 到点提醒：每分钟检查一次
  setInterval(checkDoseReminders, 60 * 1000);
  // 页面从后台回到前台时刷新今日用药
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      archiveIfNeeded();
      renderTodayDose('homeTodayMeds');
      renderTodayDose('medTodayMeds');
      updateNotifyBtn();
    }
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
init();
