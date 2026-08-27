function deleteDatabase(dbName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`${dbName} reset is blocked by another open tab`));
    });
}
