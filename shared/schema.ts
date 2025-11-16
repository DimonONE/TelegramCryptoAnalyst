import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Portfolio holdings for users
export const portfolioHoldings = pgTable("portfolio_holdings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull(),
  symbol: text("symbol").notNull(),
  amount: real("amount").notNull(),
});

// Price alerts
export const priceAlerts = pgTable("price_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chatId: text("chat_id").notNull(),
  symbol: text("symbol").notNull(),
  targetPrice: real("target_price").notNull(),
  condition: text("condition").notNull(), // 'above' or 'below'
  triggered: integer("triggered").notNull().default(0), // 0 = false, 1 = true
});

export const insertPortfolioHoldingSchema = createInsertSchema(portfolioHoldings).omit({
  id: true,
});

export const insertPriceAlertSchema = createInsertSchema(priceAlerts).omit({
  id: true,
  triggered: true,
});

export type InsertPortfolioHolding = z.infer<typeof insertPortfolioHoldingSchema>;
export type PortfolioHolding = typeof portfolioHoldings.$inferSelect;

export type InsertPriceAlert = z.infer<typeof insertPriceAlertSchema>;
export type PriceAlert = typeof priceAlerts.$inferSelect;
