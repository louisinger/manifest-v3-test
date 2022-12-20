import { crypto } from "liquidjs-lib";
import { ElectrumWS } from "./ws/ws-electrs";

export interface ChainSource {
  batchScriptGetHistory(scripts: Buffer[]): Promise<GetHistoryResponse[]>;
}

export type GetHistoryResponse = Array<{
    tx_hash: string;
    height: number;
}>

const GetHistoryMethod = 'blockchain.scripthash.get_history'

export class WsElectrumChainSource implements ChainSource {
  static ElectrumBlockstreamLiquid = "wss://blockstream.info/liquid/electrum-websocket/api";
  static ElectrumBlockstreamTestnet = "wss://blockstream.info/liquidtestnet/electrum-websocket/api";

    constructor(private ws: ElectrumWS) {}

    static testnet() {
        return new WsElectrumChainSource(new ElectrumWS(WsElectrumChainSource.ElectrumBlockstreamTestnet));
    }

    static mainnet() {
        return new WsElectrumChainSource(new ElectrumWS(WsElectrumChainSource.ElectrumBlockstreamLiquid));
    }

    async batchScriptGetHistory(scripts: Buffer[]): Promise<GetHistoryResponse[]> {
        // const scripthashes = scripts.map(toScriptHash);
        // const responses: GetHistoryResponse[] = [];
        // for (const scripthash of scripthashes) {
        //     const resp = await this.ws.request<GetHistoryResponse>(GetHistoryMethod, scripthash);
        //     responses.push(resp);
        // }
        // return responses;
        const scriptsHashes = scripts.map(toScriptHash);
        const responses = await this.ws.batchRequest<GetHistoryResponse[]>(...scriptsHashes.map(s => ({ method: GetHistoryMethod, params: [s] })));
        return responses;
    }
}

function toScriptHash(script: Buffer): string {
    return crypto.sha256(script).reverse().toString('hex');
}