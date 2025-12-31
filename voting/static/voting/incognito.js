async function detectIncognitoSingle() {
    return await new Promise((resolve, reject) => {
        let browserName = 'Unknown';
        let callbackSettled = false;
        const done = (isPrivate) => {
            if (callbackSettled) return;
            callbackSettled = true;
            resolve({ isPrivate, browserName });
        };

        const ua = navigator.userAgent;

        const identifyChromium = () => {
            if (ua.match(/Chrome/)) {
                if (navigator.brave !== undefined) return 'Brave';
                if (ua.match(/Edg/)) return 'Edge';
                if (ua.match(/OPR/)) return 'Opera';
                return 'Chrome';
            }
            return 'Chromium';
        };

        const feid = () => {
            let toFixedEngineID = 0;
            try {
                const neg = parseInt("-1");
                neg.toFixed(neg);
            } catch (e) {
                toFixedEngineID = (e && e.message) ? e.message.length : String(e).length;
            }
            return toFixedEngineID;
        };

        const isSafari = () => {
            const id = feid();
            return id === 44 || id === 43;
        };
        const isChrome = () => feid() === 51;
        const isFirefox = () => feid() === 25;
        const isMSIE = () => navigator.msSaveBlob !== undefined;

        // Safari
        const runSafariChecks = async () => {
            if (typeof navigator.storage?.getDirectory === 'function') {
                try {
                    await navigator.storage.getDirectory();
                    done(false);
                } catch (e) {
                    const message = (e && e.message) ? e.message : String(e);
                    const matchesExpectedError = message.includes('unknown transient reason');
                    done(matchesExpectedError);
                }
                return;
            }

            if (navigator.maxTouchPoints !== undefined) {
                const tmp = String(Math.random());
                try {
                    const dbReq = indexedDB.open(tmp, 1);
                    dbReq.onupgradeneeded = (ev) => {
                        const db = ev.target.result;
                        try {
                            db.createObjectStore('t', { autoIncrement: true }).put(new Blob());
                            done(false);
                        } catch (err) {
                            const message = (err && err.message) ? err.message : String(err);
                            if (message.includes('are not yet supported')) done(true);
                            else done(false);
                        } finally {
                            db.close();
                            indexedDB.deleteDatabase(tmp);
                        }
                    };
                    dbReq.onerror = () => done(false);
                } catch {
                    done(false);
                }
                return;
            }

            try {
                window.openDatabase(null, null, null, null);
            } catch (e) {
                done(true);
                return;
            }
            try {
                window.localStorage.setItem('test', '1');
                window.localStorage.removeItem('test');
            } catch (e) {
                done(true);
                return;
            }
            done(false);
        };

        // Chrome
        const runChromeChecks = () => {
            if (self.Promise !== undefined && Promise.allSettled !== undefined) {
                try {
                    navigator.webkitTemporaryStorage.queryUsageAndQuota(
                        function (_, quota) {
                            const quotaInMib = Math.round(quota / (1024 * 1024));
                            const quotaLimitInMib = Math.round(
                                (window?.performance?.memory?.jsHeapSizeLimit ?? 1073741824) / (1024 * 1024)
                            ) * 2;
                            done(quotaInMib < quotaLimitInMib);
                        },
                        function (e) {
                            reject(new Error('detectIncognito somehow failed to query storage quota: ' + ((e && e.message) ? e.message : String(e))));
                        }
                    );
                } catch (e) {
                    reject(e);
                }
            } else {
                try {
                    const fs = window.webkitRequestFileSystem;
                    fs(0, 1, () => done(false), () => done(true));
                } catch {
                    done(false);
                }
            }
        };

        // Firefox
        const runFirefoxChecks = async () => {
            if (typeof navigator.storage?.getDirectory === 'function') {
                try {
                    await navigator.storage.getDirectory();
                    done(false);
                } catch (e) {
                    done((e?.message ?? String(e)).includes('Security error'));
                }
                return;
            }

            try {
                const request = indexedDB.open('inPrivate');
                request.onerror = () => {
                    if (request.error && request.error.name === 'InvalidStateError') {
                        // preventDefault would be called on event if provided; not needed here
                    }
                    done(true);
                };
                request.onsuccess = () => {
                    indexedDB.deleteDatabase('inPrivate');
                    done(false);
                };
            } catch {
                done(true);
            }
        };

        (async () => {
            try {
                if (isSafari()) {
                    browserName = 'Safari';
                    await runSafariChecks();
                } else if (isChrome()) {
                    browserName = identifyChromium();
                    runChromeChecks();
                } else if (isFirefox()) {
                    browserName = 'Firefox';
                    await runFirefoxChecks();
                } else if (isMSIE()) {
                    browserName = 'Internet Explorer';
                    done(window.indexedDB === undefined);
                } else {
                    reject(new Error('detectIncognito cannot determine the browser'));
                }
            } catch (e) {
                reject(e);
            }
        })();
    });
}
