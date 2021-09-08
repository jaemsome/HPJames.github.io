"use strict";

let swReady = null,
	baseURL = "",
	hasLoaded = false,
	vPublicKey = "";

document.addEventListener("DOMContentLoaded", initSW);
window.onload = initSW; //fallback.

async function initDB(data) {
	let _pushDB_ = null;
	let _pushDBName_ = "_PUSH_DB_";
	let _storeName_ = "_PUSH_STORE_";

	if (!window.indexedDB) {
		console.log("IndexDB not supported.");
		return;
	}

	var request = window.indexedDB.open(_pushDBName_, 1);

	request.onerror = function (event) {
		console.log("Unable to open new db.");
	};

	request.onupgradeneeded = async function (event) {
		_pushDB_ = event.target.result;

		var objectStore = _pushDB_.createObjectStore(_storeName_, {
			keyPath: "id",
		});

		objectStore.createIndex("value", "value", {
			unique: false,
		});

		objectStore.transaction.oncomplete = function (event) {
			// Store values in the newly created objectStore.
			var storeOBJ = _pushDB_
				.transaction(_storeName_, "readwrite")
				.objectStore(_storeName_);
			storeOBJ.add(data);
		};
	};

	request.onsuccess = function (event) {
		// _pushDB_ = event.target.result;
	};
}

// Register service worker
async function initSW() {
	// Prevent from initializing multiple times
	if (hasLoaded) return;
	hasLoaded = true;

	// Initialize base url
	if (typeof _PUSH_BASE_URL_ !== "undefined") {
		baseURL = _PUSH_BASE_URL_;
	}

	if (!"serviceWorker" in navigator) {
		// service worker not supported
		console.log("[Service Worker] not supported.");
		return;
	}

	// Push support
	if (!"PushManager" in window) {
		// Push is not supported
		console.log("[Push Manager] not supported.");
		return;
	}

	// register the service worker
	await navigator.serviceWorker
		.register(window.location.origin + "/pf-sw.js")
		.then(() => {
			initPush();
		})
		.catch((err) => {
			console.log(err);
		});
}

async function initPush() {
	swReady = await navigator.serviceWorker.ready;

	if (!swReady) {
		console.log("[Service Worker] not ready.");
		return;
	}

	// Skip if subscription already exists.
	let subscriptionExists = await swReady.pushManager.getSubscription();
	if (subscriptionExists) return;

	let optinDialog = await getOptinDialog();
	vPublicKey = optinDialog.vPublicKey;

	if (optinDialog.success && optinDialog.popup) {
		// Set correct dialog details
		optinDialog.popup = optinDialog.popup.replace(
			"{{icon}}",
			optinDialog.dialog.icon
		);
		optinDialog.popup = optinDialog.popup.replace(
			"{{title}}",
			optinDialog.dialog.title
		);
		optinDialog.popup = optinDialog.popup.replace(
			"{{body}}",
			optinDialog.dialog.body
		);
		optinDialog.popup = optinDialog.popup.replace(
			"{{ok_text}}",
			optinDialog.dialog.acceptText
		);
		optinDialog.popup = optinDialog.popup.replace(
			"{{cancel_text}}",
			optinDialog.dialog.denyText
		);

		document.body.innerHTML += optinDialog.popup;
		var dialog = document.getElementById("md-slidedown-container");
		dialog.style.display = "block";
		var acceptBtn = document.getElementById("md-slidedown-allow-button");
		var denyBtn = document.getElementById("md-slidedown-cancel-button");
		let dialogResult = { dialogID: optinDialog.dialog.id };

		acceptBtn.onclick = async () => {
			dialogResult.result = "accepted";
			getOptinDialogResult(dialog, dialogResult);
		};
		denyBtn.onclick = async () => {
			dialogResult.result = "denied";
			getOptinDialogResult(dialog, dialogResult);
		};

		return;
	}
	// Proceed on getting notification permission.
	getNotificationPermission();
}

async function getOptinDialog() {
	var requestURL = baseURL + "/api/dialog/double-optin-script";
	var chGUID = "";

	if (typeof _PUSH_CHANNEL_GUID_ !== "undefined") {
		chGUID = _PUSH_CHANNEL_GUID_;
	}

	let response = null;

	await fetch(requestURL, {
		method: "POST",
		body: JSON.stringify({ channelGUID: chGUID }),
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
	})
		.then((resp) => {
			response = resp.json();
		})
		.catch((err) => {
			console.log("Get Optin Dialog: ", err);
		});

	return response;
}

async function getOptinDialogResult(dialog = null, optinResult = {}) {
	if (dialog !== null) {
		dialog.style.display = "none";
	}

	if (typeof optinResult.dialogID !== "undefined") {
		await fetch(baseURL + "/api/dialog/result", {
			method: "POST",
			body: JSON.stringify(optinResult),
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
			},
		})
			.then((resp) => {
				return resp.json();
			})
			.then((response) => {
				if (!response.success) {
					throw new Error("Unable to record dialog result.");
				}
			})
			.catch((err) => {
				console.log("Get Optin Dialog Result: ", err);
			});

		// Ask for notification permission only if accepted.
		if (optinResult.result === "accepted") {
			await getNotificationPermission();
		}
	}
}

function getNotificationPermission() {
	new Promise(function (resolve, reject) {
		const permissionResult = Notification.requestPermission(function (
			result
		) {
			resolve(result);
		});

		if (permissionResult) {
			permissionResult.then(resolve, reject);
		}
	}).then((permissionResult) => {
		if (permissionResult !== "granted") {
			throw new Error("We weren't granted permission.");
		}
		subscribeUser();
	});
}

/**
 * Subscribe user to push
 */
async function subscribeUser() {
	const subscribeOptions = {
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(vPublicKey),
	};

	let newSubscription = await swReady.pushManager.subscribe(subscribeOptions);

	await swReady.active.postMessage({
		endpoint: newSubscription.endpoint,
		subscribeOptions: subscribeOptions,
		baseURL: baseURL,
	});
	storePushSubscription(newSubscription);
}

/**
 * Send PushSubscription to server with AJAX.
 * @param {object} pushSubscription
 */
function storePushSubscription(pushSubscription) {
	var custom_tag = "";

	if (typeof _PUSH_CUSTOM_TAG_ !== "undefined") {
		custom_tag = _PUSH_CUSTOM_TAG_;
	}

	var pushSubsSTR = JSON.stringify(pushSubscription);
	var pushSUBsOBJ = JSON.parse(pushSubsSTR);
	pushSUBsOBJ.pushCustomTag = custom_tag;
	pushSUBsOBJ.timezone = new Date().toTimeString().split(" ")[1];
	pushSUBsOBJ.domain = window.location.origin;

	fetch(baseURL + "/api/subscribepush", {
		method: "POST",
		body: JSON.stringify(pushSUBsOBJ),
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
	})
		.then((res) => {
			return res.json();
		})
		.then((res) => {
			if (res.success && res.data) {
				initDB({ id: "endpoint", value: res.data.endpoint });
			}
		})
		.catch((err) => {
			console.log(err);
		});
}

/**
 * urlBase64ToUint8Array
 *
 * @param {string} base64String a public vapid key
 */
function urlBase64ToUint8Array(base64String) {
	var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
	var base64 = (base64String + padding)
		.replace(/\-/g, "+")
		.replace(/_/g, "/");

	var rawData = window.atob(base64);
	var outputArray = new Uint8Array(rawData.length);

	for (var i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
