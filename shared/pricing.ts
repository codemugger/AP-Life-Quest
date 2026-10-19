// Shop pricing: base price × tax, then one voucher discount.

export interface PriceItem {
  id: number;
  category: string;
  base_price: number;
  tax: number;
  voucher_ok: number | boolean;
}

export interface PriceVoucher {
  discount: number;
  scope: string;
  scope_values: string | null | (string | number)[];
}

export function scopeList(v: PriceVoucher): string[] {
  if (Array.isArray(v.scope_values)) return v.scope_values.map(String);
  if (!v.scope_values) return [];
  try {
    const parsed = JSON.parse(v.scope_values);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return String(v.scope_values)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

export function voucherApplies(v: PriceVoucher, item: PriceItem): boolean {
  if (!item.voucher_ok) return false;
  if (v.scope === "all") return true;
  const list = scopeList(v).map((s) => s.toLowerCase());
  if (v.scope === "categories") return list.includes(item.category.toLowerCase());
  if (v.scope === "items") return list.includes(String(item.id));
  return false;
}

export function unitPrice(item: PriceItem): number {
  return Math.round(item.base_price * (item.tax || 1));
}

export function priceOf(item: PriceItem, qty: number, voucher?: PriceVoucher | null) {
  const unit = unitPrice(item);
  const subtotal = Math.round(unit * qty);
  const pct = voucher && voucherApplies(voucher, item) ? Math.min(1, Math.max(0, voucher.discount)) : 0;
  const total = Math.round(subtotal * (1 - pct));
  return { unit, subtotal, pct, discount: subtotal - total, total };
}
