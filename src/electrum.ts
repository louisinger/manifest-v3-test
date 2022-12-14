import {crypto} from 'liquidjs-lib';

export interface GetHistoryResponse {
  tx_hash: string;
  height: number;
}
// ElectrumClient exposes ElectrumX methods via WebSockets interface
export interface ElectrumClient {
  // batch request for 'blockchain.scripthash.get_history'
  batchScriptGetHistory(scripts: Buffer[]): Promise<GetHistoryResponse[][]>;
}

export default class ElectrumWS implements ElectrumClient {

  static ElectrumBlockstreamLiquid = "wss://blockstream.info/liquid/electrum-websocket/api";
  static ElectrumBlockstreamTestnet = "wss://blockstream.info/liquidtestnet/electrum-websocket/api";
  
  private ws: WebSocket;


  constructor(webSocketURL: string = ElectrumWS.ElectrumBlockstreamLiquid) {
    this.ws = new WebSocket(webSocketURL);
   }

  async batchScriptGetHistory(scripts: Buffer[]): Promise<GetHistoryResponse[][]> {
    const requests = scripts.map((script) => {
      const scriptHex = crypto.sha256(script).reverse().toString('hex');
      return ({ method: 'blockchain.scripthash.get_history', params: [scriptHex] });
    });
    const histories = await this.batchedWebsocketRequest(requests);
    return histories;
  }

  private async batchedWebsocketRequest(requests: { method: string; params: any[] }[]): Promise<any[]> {
    const ws = this.ws;
    let argumentsByID: Record<number, any> = {};
    // wait for ws to be connected
    if (ws.readyState !== WebSocket.OPEN) {
      return new Promise((resolve) => {
        ws.onopen = () => {
          resolve(this.batchedWebsocketRequest(requests));
        };
      });
    }

    let id = Math.ceil(Math.random() * 1e5);

    const payloads = requests.map(({ method, params }) => {
      id++;
      argumentsByID[id] = params[0];
      return {
        jsonrpc: '2.0',
        method,
        params,
        id,
      };
    });

    //console.debug('ElectrumWS SEND:', requests);
    ws.send(JSON.stringify(payloads));


    return new Promise((resolve, reject) => {
      ws.onmessage = (event) => {
        const { result, error } = JSON.parse(event.data);
        if (result && Array.isArray(result) && result[0] && result[0].id) {
          // this is a batch request response
          for (let r of result) {
            r.param = argumentsByID[r.id];
          }
        }
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };
    });
  }
}

