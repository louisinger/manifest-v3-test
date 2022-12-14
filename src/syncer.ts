import type Account from "./account";
import ElectrumWS, { GetHistoryResponse } from "./electrum";

const GAP_LIMIT = 20;

export async function sync(account: Account, electrum: ElectrumWS): Promise<{ 
  lastUsed: { internal: number, external: number }, 
  historyTxsId: Set<string>, 
  heightsSet: Set<number>,
  txidHeight: Map<string, number | undefined> 
}> {

  let historyTxsId: Set<string> = new Set();
  let heightsSet: Set<number> = new Set();
  let txidHeight: Map<string, number | undefined> = new Map();

  let lastUsed = { internal: 0, external: 0 };
  const walletChains = [0, 1];
  for (const i of walletChains) {
    const isInternal = i === 1;
    let batchCount = 0;

    while (true) {
      const batch = account.deriveBatch(batchCount, GAP_LIMIT, isInternal);
      const histories = await electrum.batchScriptGetHistory(batch);

      let max = histories
        .map((v, i) => v.length > 0 ? i : -1)
        .reduce((a, b) => Math.max(a, b));
      if (max >= 0) {
        if (isInternal) {
          lastUsed.internal = max + batchCount * GAP_LIMIT;
        } else {
          lastUsed.external = max + batchCount * GAP_LIMIT;
        }
      }


      let flattened: GetHistoryResponse[] = histories.flat();
      console.log(`${i}/batch(${batchCount}) ${flattened.length}`);

      if (flattened.length === 0) {
        break;
      }


      for (let el of flattened) {
        let height = Math.max(el.height, 0);
        heightsSet.add(height as number);
        if (height === 0) {
          txidHeight.set(el.tx_hash, undefined);
        } else {
          txidHeight.set(el.tx_hash, height as number);
        }

        historyTxsId.add(el.tx_hash);
      }

      batchCount += 1;
    }
  }

  return { lastUsed, historyTxsId, heightsSet, txidHeight };
}
