import { crypto } from "liquidjs-lib";
import { ElectrumWS } from "./ws/ws-electrs";

export interface ChainSource {
    batchScriptGetHistory(scripts: Buffer[]): Promise<GetHistoryResponse[]>;
    subscribeScriptStatus(script: Buffer, callback: (scripthash: string, status: string | null) => void): Promise<void>;
    unsubscribeScriptStatus(script: Buffer): Promise<void>;
}

export type GetHistoryResponse = Array<{
    tx_hash: string;
    height: number;
}>

const GetHistoryMethod = 'blockchain.scripthash.get_history'
const SubscribeStatusMethod = 'blockchain.scripthash' // ElectrumWS automatically adds '.subscribe'

export class WsElectrumChainSource implements ChainSource {
    static ElectrumBlockstreamLiquid = "wss://blockstream.info/liquid/electrum-websocket/api";
    static ElectrumBlockstreamTestnet = "wss://blockstream.info/liquidtestnet/electrum-websocket/api";
    static NigiriRegtest = "ws://localhost:1234"

    constructor(private ws: ElectrumWS) {}

    async unsubscribeScriptStatus(script: Buffer): Promise<void> {
        this.ws.unsubscribe(SubscribeStatusMethod, toScriptHash(script)).catch();
    }

    static fromNetwork(network: string): WsElectrumChainSource {
        return new WsElectrumChainSource(
            new ElectrumWS(
                network === 'liquid' ? WsElectrumChainSource.ElectrumBlockstreamLiquid :
                    network === 'testnet' ? WsElectrumChainSource.ElectrumBlockstreamTestnet
                        : WsElectrumChainSource.NigiriRegtest
            )
        );
    }

    async subscribeScriptStatus(script: Buffer, callback: (scripthash: string, status: string | null) => void) {
        const scriptHash = toScriptHash(script);
        await this.ws.subscribe(SubscribeStatusMethod, callback, scriptHash);
    }

    async batchScriptGetHistory(scripts: Buffer[]): Promise<GetHistoryResponse[]> {
        const scriptsHashes = scripts.map(toScriptHash);
        const responses = await this.ws.batchRequest<GetHistoryResponse[]>(...scriptsHashes.map(s => ({ method: GetHistoryMethod, params: [s] })));
        return responses;
    }
}

function toScriptHash(script: Buffer): string {
    return crypto.sha256(script).reverse().toString('hex');
}