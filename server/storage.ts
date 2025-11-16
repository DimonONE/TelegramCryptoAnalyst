import { 
  type PortfolioHolding, 
  type InsertPortfolioHolding,
  type PriceAlert,
  type InsertPriceAlert
} from "@shared/schema";
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

export class MemStorage implements IStorage {
  private portfolioHoldings: Map<string, PortfolioHolding>;
  private priceAlerts: Map<string, PriceAlert>;

  constructor() {
    this.portfolioHoldings = new Map();
    this.priceAlerts = new Map();
  }

  async getPortfolioHoldings(chatId: string): Promise<PortfolioHolding[]> {
    return Array.from(this.portfolioHoldings.values()).filter(
      (holding) => holding.chatId === chatId
    );
  }

  async addPortfolioHolding(insertHolding: InsertPortfolioHolding): Promise<PortfolioHolding> {
    const id = randomUUID();
    const holding: PortfolioHolding = { ...insertHolding, id };
    this.portfolioHoldings.set(id, holding);
    return holding;
  }

  async removePortfolioHolding(chatId: string, symbol: string): Promise<boolean> {
    const holdings = Array.from(this.portfolioHoldings.entries());
    const found = holdings.find(
      ([_, h]) => h.chatId === chatId && h.symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (found) {
      this.portfolioHoldings.delete(found[0]);
      return true;
    }
    return false;
  }

  async getPriceAlerts(chatId: string): Promise<PriceAlert[]> {
    return Array.from(this.priceAlerts.values()).filter(
      (alert) => alert.chatId === chatId
    );
  }

  async getAllActiveAlerts(): Promise<PriceAlert[]> {
    return Array.from(this.priceAlerts.values()).filter(
      (alert) => alert.triggered === 0
    );
  }

  async addPriceAlert(insertAlert: InsertPriceAlert): Promise<PriceAlert> {
    const id = randomUUID();
    const alert: PriceAlert = { ...insertAlert, id, triggered: 0 };
    this.priceAlerts.set(id, alert);
    return alert;
  }

  async removePriceAlert(id: string): Promise<boolean> {
    return this.priceAlerts.delete(id);
  }

  async markAlertTriggered(id: string): Promise<void> {
    const alert = this.priceAlerts.get(id);
    if (alert) {
      alert.triggered = 1;
      this.priceAlerts.set(id, alert);
    }
  }
}

export const storage = new MemStorage();
