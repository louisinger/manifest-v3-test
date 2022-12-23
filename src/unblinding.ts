import { AssetHash, confidential } from 'liquidjs-lib';
import { confidentialValueToSatoshi, ZKPInterface } from 'liquidjs-lib/src/confidential';
import { Output } from 'liquidjs-lib/src/transaction';
import { WalletRepository } from './storage';

export type UnblindingData = {
    value: number;
    asset: string;
    assetBlindingFactor: string;
    valueBlindingFactor: string;
};

export interface Unblinder {
    unblind(...outputs: Output[]): Promise<(UnblindingData | Error)[]>;
}

export class WalletRepositoryUnblinder implements Unblinder {
    private lib: confidential.Confidential;

    constructor(private cache: WalletRepository, zkpLib: ZKPInterface) {
        this.lib = new confidential.Confidential(zkpLib);
    }

    async unblind(...outputs: Output[]): Promise<(UnblindingData | Error)[]> {
        const scripts = outputs.map(o => o.script.toString('hex'));
        const scriptDetails = await this.cache.getScriptDetails(...scripts);

        const unblindingResults: (UnblindingData | Error)[] = [];

        for (const output of outputs) {
            try {
                const script = output.script.toString('hex');

                // if output is unconfidential, we don't need to unblind it
                if (!isConfidentialOutput(output)) {
                    unblindingResults.push({
                        value: confidentialValueToSatoshi(output.value),
                        asset: AssetHash.fromBytes(output.asset).hex,
                        assetBlindingFactor: Buffer.alloc(32).toString('hex'),
                        valueBlindingFactor: Buffer.alloc(32).toString('hex'),
                    });
                    continue;
                }


                const blindingPrivKey = scriptDetails[script]?.blindingPrivateKey;
                if (!blindingPrivKey) throw new Error('Could not find script blindingKey in cache');

                const unblinded = this.lib.unblindOutputWithKey(
                    output,
                    Buffer.from(blindingPrivKey, 'hex'),
                );

                unblindingResults.push({
                    value: parseInt(unblinded.value, 10),
                    asset: AssetHash.fromBytes(unblinded.asset).hex,
                    assetBlindingFactor: unblinded.assetBlindingFactor.toString('hex'),
                    valueBlindingFactor: unblinded.valueBlindingFactor.toString('hex'),
                });

            } catch (e: unknown) {
                if (e instanceof Error) {
                    unblindingResults.push(e);
                } else {
                    unblindingResults.push(new Error('unable to unblind output (unknown error)'));
                }
                continue;
            }
        }

        return unblindingResults;
    }
}

const emptyNonce: Buffer = Buffer.from('0x00', 'hex');

function bufferNotEmptyOrNull(buffer?: Buffer): boolean {
  return buffer != null && buffer.length > 0;
}

function isConfidentialOutput({
  rangeProof,
  surjectionProof,
  nonce,
}: any): boolean {
  return (
    bufferNotEmptyOrNull(rangeProof) &&
    bufferNotEmptyOrNull(surjectionProof) &&
    nonce !== emptyNonce
  );
}