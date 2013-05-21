function XbmcWebSocketsApi(options) {
	"use strict";
	var self = this;
	
	var SOCKET_CONNECTING = 0;
	var SOCKET_OPEN = 1;
	var SOCKET_CLOSED = 2; 
	//var WEBSOCKET_TIMEOUT = 3000; //3 seconds
	//var MAX_SOCKET_CONNECTION_ATTEMPTS = 3;
	
	var _cmdId = 1; // the next command ID in sequence
	var _pendingCmds = {};
	var _notificationBindings = {};
	
	var _settings = extend({
		hostname: 'localhost'
		,port: '9090'
		,onConnected: function() {_debug('XBMC Web Sockets Connected');}
		,onDisconnected: function() {_debug('XBMC Web Sockets Connected');}
	}, options || {});
	
	var _connected = false;
	var _available = false;
	var _ws; // the websocket
	var _port = _settings.port;
	var _hostname = _settings.hostname;
	var _onConnected = _settings.onConnected;
	var _onDisconnected = _settings.onDisconnected;
	
	function extend(a,b) {
		for(var key in b)
     	   if(a.hasOwnProperty(key))
	            a[key] = b[key];
	    return a;
	}
	
	function init() {
		// firefox websockets
		if (window.MozWebSocket) {
			window.WebSocket = window.MozWebSocket;
		}
		_available = XbmcWebSocketsApi.isAvailable();
		if (_available === true) {
			_ws = new WebSocket('ws://' + _hostname + ':' + _port + '/jsonrpc');
			_ws.onopen = onWsOpen;
			_ws.onmessage = onWsMessage; 
			_ws.onclose = onWsClose;
			if (self.isConnected()) {
				onWsOpen();
			}
		}
	}
	
	function _debug(msg) {
		console.log(msg);
	}
	
	function onWsOpen() {
		_connected = true;
		_onConnected();
		_debug('web socket is connected');
	}
	
	function onWsClose() {
		_connected = false;
		_onDisconnected();
		_debug('websocket is closed');
	}
	
	function onWsMessage(msg) {
		var json = msg.data;
		_debug('message received - ' + json);
		var obj = JSON.parse(json);
		if (typeof obj.id !== 'undefined') { // reply
			_debug('received reply for '+obj.id);
			// try and find the callbacks
			var callbacks = _pendingCmds[obj.id];
			delete _pendingCmds[obj.id];
			// error?
			if (typeof obj.error === 'object') {
				if (typeof callbacks.onError === 'function') {
					callbacks.onError(obj.error);
				}
			} else {
				if (typeof callbacks.onSuccess === 'function') {
					callbacks.onSuccess(obj.result);
				}
			}
			_debug(JSON.stringify(_pendingCmds));
		} else if (typeof obj.method !== 'undefined') { // notification
			parseNotification(obj.method, obj.params.data);
		}	
	}
	
	function onWsError(err) {
		_debug(JSON.stringify(err));
	}
	
	function getNextId() {
		return _cmdId++;
	}
	
	function buildCommand(method, params) {
		return {
			jsonrpc: "2.0"
			, method: method
			, params: params
			, id: getNextId()
		}
	}
	
	function parseNotification(method, data) {
		if (_notificationBindings[method]) {
			var n = _notificationBindings[method];
			for (var i in n) {
				n[i](data);
			}
		}
	}
	
	this.call = function(method, params, onSuccess, onError) {
		if (self.isConnected()) {
			var cmd = buildCommand(method,params);
			_pendingCmds[cmd.id] = {
				onSuccess: onSuccess
				, onError: onError
			};
			_ws.send(JSON.stringify(cmd));
		}		
	};
	
	this.subscribe = function(notification, handler) {
		if (!_notificationBindings[notification]) {
			_notificationBindings[notification] = [];
		}
		_notificationBindings[notification].push(handler);
	};
	
	this.unsubscribe = function(notification, handler) {
		if (_notificationBindings[notification]) {
			var n = _notificationBindings[notification];
			var i = n.indexOf(handler);
			if (i >= 0) {
				n.splice(i,1);
			}
		}
	};
	
	this.isConnected = function() {
		if (_ws == null) return false;
		return _ws.readyState === SOCKET_OPEN;
	};
	
	init();
}

XbmcWebSocketsApi.isAvailable = function() {
	return ("WebSocket" in window);
}
