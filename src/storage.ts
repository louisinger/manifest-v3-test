export interface StorageInterface {
  get(key: string): Promise<Record<string, any> | null>;
  set(object: Record<string, any>): Promise<void>;
}

export interface Data {
  scriptHexToDerivationPath: Record<string, string>;
}

export class ChromeStorage implements StorageInterface {
  async get(key: string): Promise<Record<string, Data> | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result);
      });
    });
  }

  async set(object: Record<string, Data>): Promise<void> {
    return new Promise((resolve) => {
      const keys = Object.keys(object);
      chrome.storage.local.get(keys, (data) => {
        const originalObject = data;
        let updatedObject = { ...originalObject };
        for (const key of keys) {
          updatedObject = {
            ...updatedObject,
            [key]: {
              ...updatedObject[key],
              ...object[key],
            }
          }
        }
        chrome.storage.local.set(updatedObject, () => {
          resolve();
        });
      });
    });
  }
}