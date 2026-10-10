// 只生成建议编码，不从货架名称推断业务身份，也不修改原货位。
export function generateCodes(rack, options) {
  const { prefix, suffix, start, step, digits, reverse, level } = options;
  if (options.layerFormat === 'szx' && rack.levels !== 3) throw Error('S/Z/X 层号仅适用于三层货架');
  if (![start, step, digits].every(Number.isSafeInteger) || start < 0 || step < 1 || digits < 1 || digits > 12)
    throw Error('起始编号需为非负整数，递增需为正整数，数字位数为 1–12');
  return rack.slots
    .filter(slot => !level || slot.level === level)
    .map(slot => {
      const number = start + (reverse ? rack.cols - slot.col : slot.col - 1) * step;
      if (!Number.isSafeInteger(number)) throw Error('编号超出安全整数范围');
      // 前后缀共享层号格式，替换全部占位符，不修改原货位。
      const layerCode = options.layerFormat === 'szx' ? { 1: 'X', 2: 'Z', 3: 'S' }[slot.level] : slot.level;
      return {
        id: slot.id,
        code:
          prefix.replaceAll('{层号}', layerCode) +
          String(number).padStart(digits, '0') +
          suffix.replaceAll('{层号}', layerCode),
      };
    });
}

// 以最终结果校验唯一性，允许同一批内交换编码；应用层另外校验发布身份。
export function previewCodes(layout, rackId, changes, canRename) {
  const rack = layout.racks.find(item => item.id === rackId);
  if (!rack) throw Error('货架不存在');
  const seen = new Set();
  const rows = changes.map(change => {
    const slot = rack.slots.find(item => item.id === change.id);
    if (!slot || seen.has(change.id)) throw Error('货位不存在或重复提交');
    seen.add(change.id);
    const code = String(change.code ?? '').trim();
    return {
      ...change,
      code,
      original: slot.code,
      error: !code ? '编码不能为空' : code !== slot.code && !canRename(slot) ? '货位已锁定' : '',
    };
  });
  const replacements = new Map(rows.map(row => [row.id, row.code]));
  const counts = new Map();
  for (const slot of layout.racks.flatMap(item => item.slots)) {
    const code = replacements.get(slot.id) ?? slot.code;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  for (const row of rows) if (counts.get(row.code) > 1) row.error ||= '布局内编码重复';
  return rows;
}

// Excel 的 TSV 行列顺序与立面一致；超出范围时拒绝整次粘贴，不截断数据。
export function pasteCodes(rack, text, anchorId) {
  const anchor = rack.slots.find(slot => slot.id === anchorId);
  if (!anchor) throw Error('请选择粘贴起始格');
  const matrix = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map(row => row.split('\t'));
  const result = [];
  matrix.forEach((row, y) =>
    row.forEach((code, x) => {
      const slot = rack.slots.find(item => item.level === anchor.level - y && item.col === anchor.col + x);
      if (!slot) throw Error('粘贴范围超出货架，请检查起始格和行列数');
      result.push({ id: slot.id, code });
    })
  );
  return result;
}
