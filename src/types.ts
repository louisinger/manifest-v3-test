export interface Message<T extends string, D extends any> {
    message: T;
    data: D;
}

export type RestoreMessage = Message<'restore', { mnemonic: string }>;
export type SubscribeAccountMessage = Message<'subscribeAccount', { mnemonic: string }>;
export type ResetMessage = Message<'reset', never>;

export function isRestoreMessage(message: any): message is RestoreMessage {
    return message.message === 'restore';
}

export function isSubscribeMessage(message: any): message is SubscribeAccountMessage {
    return message.message === 'subscribe';
}

export function isResetMessage(message: any): message is ResetMessage {
    return message.message === 'reset';
}
