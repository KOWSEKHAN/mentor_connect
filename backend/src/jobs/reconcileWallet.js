import Transaction from '../models/Transaction.js';
import Wallet from '../models/Wallet.js';

export const reconcileWallets = async () => {
  try {
    // 5. Reconciliation job (silent correctness)
    const wallets = await Wallet.find({});
    
    for (const w of wallets) {
      const txns = await Transaction.find({ userId: w.userId, status: { $in: ['completed', 'paid'] } });
      
      let expectedBalance = 0;
      for (const tx of txns) {
        if (tx.type === 'credit') expectedBalance += tx.amount;
        if (tx.type === 'debit') expectedBalance -= tx.amount;
      }

      if (w.balance !== expectedBalance) {
        console.warn(`[RECONCILIATION_WARNING] Drift detected for user ${w.userId}. Expected ${expectedBalance}, got ${w.balance}`);
        // Optimistic match to prevent overwriting fresh updates during the interval run
        await Wallet.updateOne(
          { _id: w._id, balance: w.balance }, 
          { $set: { balance: expectedBalance } }
        );
      }
    }
  } catch (err) {
    console.error('[RECONCILIATION_JOB_ERROR]', err);
  }
};

export const startReconciliationJob = () => {
  // Run once every 5 minutes (300000ms)
  setInterval(() => {
    reconcileWallets().catch(console.error);
  }, 5 * 60 * 1000);
  console.log('[JOBS] Wallet reconciliation started');
};
