import { 
  type PortfolioHolding, 
  type InsertPortfolioHolding,
  type PriceAlert,
  type InsertPriceAlert,
  portfolioHoldings,
  priceAlerts
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // Portfolio operations
  getPortfolioHoldings(chatId: string): Promise<PortfolioHolding[]>;
  addPortfolioHolding(holding: InsertPortfolioHolding): Promise<PortfolioHolding>;
  removePortfolioHolding(chatId: string, symbol: string): Promise<boolean>;
  
  // Alert operations
  getPriceAlerts(chatId: string): Promise<PriceAlert[]>;
  getAllActiveAlerts(): Promise<PriceAlert[]>;
  addPriceAlert(alert: InsertPriceAlert): Promise<PriceAlert>;
  removePriceAlert(id: string): Promise<boolean>;
  markAlertTriggered(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  async getPortfolioHoldings(chatId: string): Promise<PortfolioHolding[]> {
    return await db
      .select()
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.chatId, chatId));
  }

  async addPortfolioHolding(insertHolding: InsertPortfolioHolding): Promise<PortfolioHolding> {
    const id = randomUUID();
    const [holding] = await db
      .insert(portfolioHoldings)
      .values({ ...insertHolding, id })
      .returning();
    return holding;
  }

  async removePortfolioHolding(chatId: string, symbol: string): Promise<boolean> {
    const result = await db
      .delete(portfolioHoldings)
      .where(
        and(
          eq(portfolioHoldings.chatId, chatId),
          eq(portfolioHoldings.symbol, symbol.toUpperCase())
        )
      )
      .returning();
    return result.length > 0;
  }

  async getPriceAlerts(chatId: string): Promise<PriceAlert[]> {
    return await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.chatId, chatId));
  }

  async getAllActiveAlerts(): Promise<PriceAlert[]> {
    return await db
      .select()
      .from(priceAlerts)
      .where(eq(priceAlerts.triggered, 0));
  }

  async addPriceAlert(insertAlert: InsertPriceAlert): Promise<PriceAlert> {
    const id = randomUUID();
    const [alert] = await db
      .insert(priceAlerts)
      .values({ ...insertAlert, id, triggered: 0 })
      .returning();
    return alert;
  }

  async removePriceAlert(id: string): Promise<boolean> {
    const result = await db
      .delete(priceAlerts)
      .where(eq(priceAlerts.id, id))
      .returning();
    return result.length > 0;
  }

  async markAlertTriggered(id: string): Promise<void> {
    await db
      .update(priceAlerts)
      .set({ triggered: 1 })
      .where(eq(priceAlerts.id, id));
  }
}

export const storage = new DbStorage();
