"use strict";

var ji_pushOBJ = {
		id: "0",
		ep: "",
		url: "/",
		click_id: "",
		subscribeOptions: {},
	},
	baseURL = "";

// Event for service worker post message
self.addEventListener("message", function (event) {
	var data = event.data;

	if (typeof data.baseURL !== "undefined") {
		baseURL = data.baseURL;
	}

	if (typeof data.endpoint !== "undefined") {
		ji_pushOBJ.ep = data.endpoint;
	}

	if (typeof data.subscribeOptions !== "undefined") {
		ji_pushOBJ.subscribeOptions = data.subscribeOptions;
	}
});

// Callback for updating push status
function updatePushStatus(data) {
	console.log('Update Status: ', JSON.stringify(data));
	fetch(baseURL + "/api/push/update-status", {
		method: "POST",
		body: JSON.stringify(data),
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
	})
		.then((res) => {
			// return res.json();
		    console.log(res);
		})
		.catch((err) => {
			console.log(err);
		});
}

// Callback for showing notification
async function pushShowNotification(event) {
	// Get push data
	let payload = event.data.json();

	// Set push data to global variable to be used for other events
	ji_pushOBJ.ep = payload.data.endpoint;
	ji_pushOBJ.id = payload.data.id;
	ji_pushOBJ.url = payload.data.url;
	ji_pushOBJ.click_id = payload.data.click_id;

	self.registration.showNotification(payload.title, payload);

	let req_param = payload.data;
	req_param.endpoint = ji_pushOBJ.ep;
	req_param.notification_id = ji_pushOBJ.id;
	req_param.click_id = ji_pushOBJ.click_id;
	req_param.event_type = "displayed";

	await updatePushStatus(req_param);
}

// Callback for clicking notification
async function pushClickNotification(event) {
	// Get push related data
	var pushURL = event.notification.data.url
		? event.notification.data.url
		: ji_pushOBJ.url;
	var pushID = event.notification.data.id
		? event.notification.data.id
		: ji_pushOBJ.id;
	var endpoint = event.notification.data.endpoint
		? event.notification.data.endpoint
		: ji_pushOBJ.ep;
	var clickID = event.notification.data.click_id
		? event.notification.data.click_id
		: ji_pushOBJ.click_id;

	// Open the url in new tab
	clients.openWindow(pushURL);

	let req_param = event.notification.data;
	req_param.endpoint = endpoint;
	req_param.notification_id = pushID;
	req_param.click_id = clickID;
	req_param.event_type = "clicked";

	await updatePushStatus(req_param);
}

// Event for receiving a push notification
self.addEventListener("push", function (event) {
	if (!(self.Notification && self.Notification.permission === "granted")) {
		//notifications aren't supported or permission not granted!
		console.log("Notifications not supported or Permission not granted!");
		return;
	}

	if (event.data) {
		event.waitUntil(pushShowNotification(event));
	}
});

self.addEventListener("notificationclick", function (event) {
	if (event.notification) {
		event.notification.close();
	}
	event.waitUntil(pushClickNotification(event));
});

self.addEventListener("pushsubscriptionchange", function (event) {
	event.waitUntil(
		self.registration.pushManager
			.subscribe(ji_pushOBJ.subscribeOptions)
			.then(async function (subscription) {
				if (indexedDB) {
					let _pushDB_ = null;
					let _pushDBName_ = "_PUSH_DB_";
					let _storeName_ = "_PUSH_STORE_";

					var requestDB = await indexedDB.open(_pushDBName_, 1);

					requestDB.onerror = function (event) {
						console.log("Unable to open new db.");
					};

					requestDB.onsuccess = function (event) {
						_pushDB_ = event.target.result;
						var transaction = _pushDB_.transaction([_storeName_]);
						var storeOBJ = transaction.objectStore(_storeName_);
						var getREQ = storeOBJ.get("endpoint");
						getREQ.onerror = function (event) {
							console.log("Unable to get data.");
						};
						getREQ.onsuccess = function (event) {
							// Do something with the request.result!
							var endpoint =
								ji_pushOBJ.ep !== ""
									? ji_pushOBJ.ep
									: getREQ.result.value;
							if (endpoint !== "" && endpoint !== null) {
								const req_param = {
									endpoint: endpoint,
									notification_id: ji_pushOBJ.id,
									click_id: ji_pushOBJ.click_id,
									event_type: "unsubscribed",
								};
								return fetch(
									baseURL + "/api/push/update-status",
									{
										method: "POST",
										headers: {
											"Content-type": "application/json",
										},
										body: JSON.stringify(req_param),
									}
								);
							}
						};
					};
				}
			})
	);
});
