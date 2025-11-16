import cron from 'node-cron';
import { storage } from '../storage';
import { cryptoApi } from '../services/cryptoApi';
import type { CryptoAnalystBot } from './telegram';

export class AlertMonitor {
  private bot: CryptoAnalystBot;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(bot: CryptoAnalystBot) {
    this.bot = bot;
  }

  start() {
    // Check alerts every 2 minutes
    this.cronJob = cron.schedule('*/2 * * * *', async () => {
      await this.checkAlerts();
    });

    console.log('📊 Alert monitoring started (checking every 2 minutes)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('Alert monitoring stopped');
    }
  }

  private async checkAlerts() {
    try {
      const alerts = await storage.getAllActiveAlerts();

      if (alerts.length === 0) {
        return;
      }

      // Group alerts by symbol (uppercase) for efficient API calls
      const symbolsToCheck = new Set(alerts.map(a => a.symbol.toUpperCase()));
      const prices = await cryptoApi.getMultiplePrices(Array.from(symbolsToCheck));

      for (const alert of alerts) {
        // Use uppercase symbol for price lookup
        const priceData = prices.get(alert.symbol.toUpperCase());
        
        if (!priceData) {
          continue;
        }

        let triggered = false;

        if (alert.condition === 'above' && priceData.price >= alert.targetPrice) {
          triggered = true;
        } else if (alert.condition === 'below' && priceData.price <= alert.targetPrice) {
          triggered = true;
        }

        if (triggered) {
          // Send alert notification
          await this.bot.sendAlert(
            alert.chatId,
            alert.symbol.toUpperCase(),
            priceData.price,
            alert.targetPrice,
            alert.condition
          );

          // Mark as triggered
          await storage.markAlertTriggered(alert.id);
          
          console.log(`✅ Alert triggered for ${alert.chatId}: ${alert.symbol} ${alert.condition} $${alert.targetPrice}`);
        }
      }
    } catch (error) {
      console.error('Alert monitoring error:', error);
    }
  }
}
