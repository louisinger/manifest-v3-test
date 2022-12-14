export interface StorageInterface {
  get(key: string): Promise<Record<string, any> | null>;
  set(object: Record<string, any>): Promise<void>;
}

export class ChromeStorage implements StorageInterface {
  async get(key: string): Promise<Record<string, any> | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result);
      });
    });
  }

  async set(object: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(object, () => {
        resolve();
      });
    });
  }
}
