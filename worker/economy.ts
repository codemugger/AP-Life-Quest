// Shop, vouchers, inventory, calorie court and loot chests.
import { addDays, monthStart } from "../shared/dates";
import { HATS, levelInfo, type Rarity } from "../shared/levels";
import { priceOf, unitPrice, voucherApplies } from "../shared/pricing";
import { checkRule, limitPeriodStart, parseRule, type RuleInputs } from "../shared/rules";
import { all, bad, first, HttpError, notFound, rand, randInt, run, stmt } from "./db";
import { award, ledgerStmt, settingStmt, totals, type Ctx, type ShopRow } from "./game";

interface VoucherRow {
  id: number;
  name: string;
  discount: number;
  scope: string;
  scope_values: string | null;
  limit_type: string;
  limit_count: number;
  rule: string | null;
  active: number;
}

export async function ruleInputs(ctx: Ctx): Promise<RuleInputs> {
  const [vals, tots, earned] = await ctx.db.batch([
    stmt(ctx.db, "SELECT metric_key, date, value FROM metric_values WHERE date >= ?", addDays(ctx.today, -400)),
    stmt(ctx.db, "SELECT metric_key, SUM(value) AS total FROM metric_values GROUP BY metric_key"),
    stmt(
      ctx.db,
      "SELECT COALESCE(SUM(ap),0) AS v FROM ledger WHERE season_id = ? AND voided = 0 AND ap > 0 AND kind IN ('earn','bonus','loot') AND date >= ?",
      ctx.season,
      monthStart(ctx.today),
    ),
  ]);
  return {
    today: ctx.today,
    values: vals.results as RuleInputs["values"],
    totals: Object.fromEntries((tots.results as { metric_key: string; total: number }[]).map((t) => [t.metric_key, t.total])),
    monthEarned: (earned.results[0] as { v: number })?.v ?? 0,
    birthday: ctx.s.birthday,
  };
}

export async function inventoryLeft(ctx: Ctx, itemId: number) {
  const r = await first<{ left: number }>(
    ctx.db,
    `SELECT (SELECT COALESCE(SUM(qty),0) FROM purchases WHERE item_id = ? AND season_id = ?)
          - (SELECT COALESCE(SUM(qty),0) FROM item_uses WHERE item_id = ? AND season_id = ?) AS left`,
    itemId,
    ctx.season,
    itemId,
    ctx.season,
  );
  return r?.left ?? 0;
}

/** Buys an item. Returns the purchase id. */
export async function purchase(
  ctx: Ctx,
  opts: { item_id: number; qty?: number; voucher_id?: number | null; note?: string | null; use_now?: boolean },
): Promise<number> {
  const item = await first<ShopRow>(ctx.db, "SELECT * FROM shop_items WHERE id = ?", opts.item_id);
  if (!item || !item.active) throw notFound("Item not found");
  const qty = Math.max(0.25, Math.min(1000, Number(opts.qty) || 1));
  const level = levelInfo(ctx.before.xp).level;
  if (item.min_level > level) throw bad(`Unlocks at level ${item.min_level}`);

  let voucher: VoucherRow | null = null;
  if (opts.voucher_id) {
    voucher = await first<VoucherRow>(ctx.db, "SELECT * FROM vouchers WHERE id = ?", opts.voucher_id);
    if (!voucher || !voucher.active) throw notFound("Voucher not found");
    if (!voucherApplies(voucher, item)) throw bad(`${voucher.name} can't be used on ${item.name}`);
    const from = limitPeriodStart(voucher.limit_type, ctx.today);
    if (from) {
      const used = await first<{ c: number }>(
        ctx.db,
        "SELECT COUNT(*) AS c FROM purchases WHERE voucher_id = ? AND season_id = ? AND date >= ?",
        voucher.id,
        ctx.season,
        from,
      );
      if ((used?.c ?? 0) >= voucher.limit_count) throw bad(`${voucher.name} is used up for this period`);
    }
    const rule = parseRule(voucher.rule);
    if (rule) {
      const res = checkRule(rule, await ruleInputs(ctx));
      if (!res.ok) throw bad(`${voucher.name} locked: ${res.text}`);
    }
  }

  const price = priceOf(item, qty, voucher);
  const bal = (await totals(ctx)).ap;
  if (price.total > bal) throw bad(`Not enough AP — need ${price.total}, you have ${bal}`);

  const desc =
    `${item.emoji} ${item.name}${qty !== 1 ? ` ×${qty}` : ""}` +
    (voucher && price.pct ? ` (${voucher.name} −${Math.round(price.pct * 100)}%)` : "");
  const ledgerId = await award(ctx, { kind: "spend", ap: -price.total, source: "shop", ref_id: item.id, description: desc, fx: false });
  const p = await stmt(
    ctx.db,
    `INSERT INTO purchases (item_id, item_name, qty, unit_price, voucher_id, voucher_name, discount, total, note, date, ledger_id, season_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    item.id,
    item.name,
    qty,
    price.unit,
    voucher?.id ?? null,
    voucher?.name ?? null,
    price.pct,
    price.total,
    opts.note ? String(opts.note).slice(0, 500) : null,
    ctx.today,
    ledgerId,
    ctx.season,
  ).first<{ id: number }>();
  ctx.fx.push({ t: "toast", msg: `Bought ${item.name}${price.total ? ` for ${price.total} AP` : " for free!"}`, emoji: item.emoji });
  if (price.total) ctx.fx.push({ t: "ap", v: -price.total });
  if (opts.use_now && item.effect !== "streak_freeze") await useItem(ctx, item.id, { qty, purchaseId: p!.id });
  return p!.id;
}

/**
 * Uses an item from the bag. Using a ticket that a Calorie Court case is waiting for settles that
 * case (the given one, or else the oldest open one for this item).
 */
export async function useItem(
  ctx: Ctx,
  itemId: number,
  opts: { qty?: number; note?: string | null; reason?: string; purchaseId?: number; obligationId?: number } = {},
) {
  const item = await first<ShopRow>(ctx.db, "SELECT * FROM shop_items WHERE id = ?", itemId);
  if (!item) throw notFound("Item not found");
  if (item.effect === "streak_freeze") throw bad("Streak Shields are used automatically when you need one");
  const qty = Math.max(0.25, Number(opts.qty) || 1);
  const left = await inventoryLeft(ctx, itemId);
  if (left < qty - 1e-9) throw bad(`You only have ${left} left`);
  await stmt(
    ctx.db,
    "INSERT INTO item_uses (item_id, purchase_id, qty, note, date, season_id) VALUES (?,?,?,?,?,?)",
    itemId,
    opts.purchaseId ?? null,
    qty,
    opts.reason ?? (opts.note ? String(opts.note).slice(0, 500) : null),
    ctx.today,
    ctx.season,
  ).run();
  if (item.effect?.startsWith("heal:")) {
    const hp = Number(item.effect.split(":")[1]) * qty;
    await award(ctx, { kind: "bonus", hp, source: "item", ref_id: itemId, description: `${item.emoji} ${item.name}` });
  } else if (item.effect === "rest_day") {
    await stmt(ctx.db, "INSERT OR IGNORE INTO rest_days (date, reason) VALUES (?, ?)", ctx.today, item.name).run();
    ctx.fx.push({ t: "toast", msg: "Today is a rest day. No penalties, streak frozen.", emoji: "🏖️" });
  } else if (!opts.obligationId) {
    ctx.fx.push({ t: "toast", msg: `Used ${item.name}. Enjoy!`, emoji: item.emoji });
  }
  if (qty >= 1 && item.trigger_metric) {
    const settled = opts.obligationId
      ? await run(
          ctx.db,
          "UPDATE obligations SET status = 'paid', resolved_at = ?, purchase_id = ? WHERE id = ? AND status IN ('open','settling')",
          ctx.today,
          opts.purchaseId ?? null,
          opts.obligationId,
        )
      : await run(
          ctx.db,
          `UPDATE obligations SET status = 'paid', resolved_at = ?, purchase_id = ?
           WHERE id = (SELECT id FROM obligations WHERE item_id = ? AND status = 'open' AND season_id = ? ORDER BY date LIMIT 1)`,
          ctx.today,
          opts.purchaseId ?? null,
          itemId,
          ctx.season,
        );
    if (settled.meta.changes) ctx.fx.push({ t: "toast", msg: "Calorie Court case settled. ⚖️", emoji: item.emoji });
  }
}

export async function resolveObligation(ctx: Ctx, id: number, method: "use" | "buy" | "waive", voucherId?: number | null) {
  const o = await first<{ id: number; date: string; item_id: number; status: string }>(
    ctx.db,
    "SELECT * FROM obligations WHERE id = ? AND season_id = ?",
    id,
    ctx.season,
  );
  if (!o) throw notFound("Case not found");
  // Claim the case first so a double tap can't pay twice.
  const claim = await run(ctx.db, "UPDATE obligations SET status = 'settling' WHERE id = ? AND status = 'open'", id);
  if (!claim.meta.changes) throw new HttpError(409, "Already settled");
  const reason = `Calorie court ${o.date}`;
  try {
    if (method === "buy") {
      const purchaseId = await purchase(ctx, { item_id: o.item_id, voucher_id: voucherId, note: reason });
      await useItem(ctx, o.item_id, { reason, purchaseId, obligationId: id });
    } else if (method === "use") {
      await useItem(ctx, o.item_id, { reason, obligationId: id });
    } else {
      await run(ctx.db, "UPDATE obligations SET status = 'waived', resolved_at = ? WHERE id = ?", ctx.today, id);
      ctx.fx.push({ t: "toast", msg: "Exception granted. Use wisely!", emoji: "⚖️" });
    }
  } catch (e) {
    await run(ctx.db, "UPDATE obligations SET status = 'open' WHERE id = ? AND status = 'settling'", id);
    throw e;
  }
}

const LOOT: Record<Rarity, { ap: [number, number]; xp: [number, number]; hat: number; item: number }> = {
  common: { ap: [5, 15], xp: [10, 20], hat: 0, item: 0 },
  rare: { ap: [20, 40], xp: [30, 50], hat: 0.1, item: 0.1 },
  epic: { ap: [50, 100], xp: [60, 100], hat: 0.25, item: 0.3 },
  legendary: { ap: [150, 300], xp: [150, 250], hat: 0.4, item: 0.5 },
};

export async function openChest(ctx: Ctx, id: number) {
  const chest = await first<{ id: number; rarity: Rarity; opened_at: string | null }>(
    ctx.db,
    "SELECT * FROM chests WHERE id = ? AND season_id = ?",
    id,
    ctx.season,
  );
  if (!chest) throw notFound("Chest not found");
  // Claim it first: only one request can ever open a given chest.
  const claim = await run(ctx.db, "UPDATE chests SET opened_at = datetime('now') WHERE id = ? AND opened_at IS NULL", id);
  if (!claim.meta.changes) throw new HttpError(409, "Already opened");
  const L = LOOT[chest.rarity] ?? LOOT.common;
  const ap = randInt(...L.ap);
  const xp = randInt(...L.xp);
  let hat: string | undefined;
  let itemName: string | undefined;
  const batch: D1PreparedStatement[] = [];

  const locked = HATS.filter((h) => !ctx.s.hats.includes(h.id));
  if (locked.length && rand() < L.hat) {
    hat = locked[randInt(0, locked.length - 1)].id;
    ctx.s.hats.push(hat);
    batch.push(settingStmt(ctx, "hats", ctx.s.hats));
  }
  if (rand() < L.item) {
    const pool = await all<ShopRow>(
      ctx.db,
      chest.rarity === "legendary"
        ? "SELECT * FROM shop_items WHERE active = 1 AND trigger_metric IS NULL AND base_price * tax <= 200 AND category <> 'Calorie Waiver'"
        : "SELECT * FROM shop_items WHERE active = 1 AND effect IS NOT NULL",
    );
    if (pool.length) {
      const it = pool[randInt(0, pool.length - 1)];
      itemName = `${it.emoji} ${it.name}`;
      batch.push(
        stmt(
          ctx.db,
          "INSERT INTO purchases (item_id, item_name, qty, unit_price, total, note, date, season_id) VALUES (?,?,1,?,0,'Loot',?,?)",
          it.id,
          it.name,
          unitPrice(it),
          ctx.today,
          ctx.season,
        ),
      );
    }
  }
  batch.push(
    ledgerStmt(ctx, { kind: "loot", ap, xp, source: "chest", ref_id: id, description: `🎁 ${chest.rarity} chest`, fx: false }),
    stmt(ctx.db, "UPDATE chests SET reward = ? WHERE id = ?", JSON.stringify({ ap, xp, hat, item: itemName }), id),
  );
  try {
    await ctx.db.batch(batch);
  } catch (e) {
    await run(ctx.db, "UPDATE chests SET opened_at = NULL WHERE id = ?", id);
    throw e;
  }
  ctx.fx.push({ t: "loot", rarity: chest.rarity, ap, xp, hat, item: itemName });
}
