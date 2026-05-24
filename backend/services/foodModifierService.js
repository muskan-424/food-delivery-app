/**
 * Resolve modifier selections against food.modifierGroups (Phase 1).
 * @param {object} food - mongoose doc or plain object with modifierGroups
 * @param {Array<{ groupKey: string, optionKeys?: string[], optionKey?: string }>} modifiersInput
 */
export function resolveItemPricing(food, modifiersInput) {
  const groups = food.modifierGroups || [];
  const input = Array.isArray(modifiersInput) ? modifiersInput : [];

  const byGroup = new Map();
  for (const row of input) {
    const gk = row.groupKey;
    if (!gk) continue;
    if (!byGroup.has(gk)) byGroup.set(gk, []);
    const keys = Array.isArray(row.optionKeys)
      ? row.optionKeys
      : row.optionKey
        ? [row.optionKey]
        : [];
    for (const k of keys) {
      if (k) byGroup.get(gk).push(k);
    }
  }

  const snapshot = [];
  let extra = 0;

  for (const g of groups) {
    const raw = byGroup.get(g.key) || [];
    const uniq = [...new Set(raw)];
    const minSel = Math.max(0, Number(g.minSelect) || 0);
    const optCount = (g.options && g.options.length) || 1;
    const maxSel =
      g.maxSelect != null ? Number(g.maxSelect) : optCount;

    if (g.required && uniq.length < Math.max(1, minSel || 1)) {
      return {
        error: `Required choices missing for "${g.name || g.key}"`,
      };
    }
    if (uniq.length < minSel) {
      return {
        error: `"${g.name || g.key}" requires at least ${minSel} selection(s)`,
      };
    }
    if (uniq.length > maxSel) {
      return {
        error: `"${g.name || g.key}" allows at most ${maxSel} selection(s)`,
      };
    }

    for (const ok of uniq) {
      const opt = (g.options || []).find((o) => o.key === ok);
      if (!opt) {
        return { error: `Invalid option for "${g.name || g.key}"` };
      }
      const delta = Number(opt.priceDelta) || 0;
      snapshot.push({
        groupKey: g.key,
        optionKey: ok,
        label: opt.name || ok,
        priceDelta: delta,
      });
      extra += delta;
    }
    byGroup.delete(g.key);
  }

  for (const [gk, keys] of byGroup) {
    if (keys.length && !groups.some((g) => g.key === gk)) {
      return { error: `Unknown modifier group: ${gk}` };
    }
  }

  const base = Number(food.price) || 0;
  return {
    unitPrice: Math.round((base + extra) * 100) / 100,
    modifierSnapshot: snapshot,
  };
}
