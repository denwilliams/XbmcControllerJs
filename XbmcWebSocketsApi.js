window.Xbmc = window.Xbmc || {};

/**
 * Manages JSON-RPC API calls to an XBMC instance using HTML5 Web Sockets
 */
Xbmc.WebSocketsApi = function(options) {
	"use strict";
	var self = this;
	
	var SOCKET_CONNECTING = 0;
	var SOCKET_OPEN = 1;
	var SOCKET_CLOSED = 2; 
	
	var CALL_TIMEOUT = 5000; //number of milliseconds to wait before retrying an API call
	var CALL_RETRIES = 3; // number of times to retry a call before failing
	
	var _cmdId = 1; // the next command ID in sequence (used for JSON-RPC id)
	var _pendingCmds = {}; // stores each command so it can be retried or replied to as necessary
	var _retryTimer; // retries or fails commands
	var _notificationBindings = {}; // stores all callbacks bound to each notification
	
	var _settings = _extend({
		host: window.location.host || 'localhost'
		,port: '9090'
		,autoRetry: true
		,retryInterval: 10000 // number of milliseconds to wait before retrying the connection after a dropout
		,onConnected: function() {_debug('XBMC Web Sockets Connected');}
		,onDisconnected: function() {_debug('XBMC Web Sockets Connected');}
	}, options || {});
	
	var _connected = false;
	var _isRetry = false;
	var _available = false;
	var _ws; // the websocket
	var _port = _settings.port;
	var _hostname = _settings.host;
	var _onConnected = _settings.onConnected;
	var _onDisconnected = _settings.onDisconnected;
	var _monitorTimer = null;
	var _monitorCount = 0;
	
	/** Constructor
	 * @private
	 */
	function _init() {
		// old firefox versions websockets
		if (window.MozWebSocket) {
			window.WebSocket = window.MozWebSocket;
		}
		_available = Xbmc.WebSocketsApi.isAvailable();
		if (_available === true) {
			_connect();
		}
	}
	
	/** 
	 * Extends object a with matching properties from object b
	 * @private
	 */
	function _extend(a,b) {
		for(var key in b)
     	   if(a.hasOwnProperty(key))
	            a[key] = b[key];
	    return a;
	}
	
	/**
	 * Enumerates through the sent messages queue.
	 * Fails any messages that have timed out.
	 * @private
	 */
	function _checkForTimedOutCalls() {
		var now = new Date();
		for (var i in _pendingCmds) {
			var cmd = _pendingCmds[i];
			var interval = now - cmd.timeStamp;
			if (interval > CALL_TIMEOUT) {
				// already retried too much?
				if (cmd.attempt > CALL_RETRIES) {
					// fail the command
					if (typeof cmd.onError === 'function') {
						cmd.onError('Too many retries');
					}
				} else {
					// retry the command
					self.call(cmd.method, cmd.params, cmd.onSuccess, cmd.onError, cmd.attempt++);
				}
				// remove the existing command
				delete _pendingCmds[i];
			}
		}
	}
	
	/**
	 * Attempts to connect to the Web Sockets server
	 * @private
	 */
	function _connect() {
		if (_connected === false) {
			_ws = new WebSocket('ws://' + _hostname + ':' + _port + '/jsonrpc');
			_ws.onopen = _onWsOpen;
			_ws.onmessage = _onWsMessage; 
			_ws.onclose = _onWsClose;
			_ws.onerror = _onWsError;
			if (self.isConnected()) { // already connected??
				_onWsOpen();
			}
		}
	}
	
	/**
	 * Prints a debug message
	 * @private
	 */
	function _debug(msg) {
		if (Xbmc.DEBUG === true)
			console.log(msg);
	}
	
	/**
	 * Pings the server. Alerts onWsClose if no reply is received.
	 * @private
	 */
	function _monitor() {
		if (_monitorCount > 0) { // last ping failed!
			_onWsClose();
		} else {
			_monitorCount++;
			self.call('JSONRPC.Ping',{},function(pong) {
				if (pong === 'pong') {
					_monitorCount = 0;
				}
			});
		}
	}
	
	/**
	 * Event handler for the websocket open event
	 * @private
	 */
	function _onWsOpen() {
		if (!_monitorTimer) {
			_monitorTimer = setInterval(_monitor, 5000);
		}
		if (!_retryTimer) {
			_retryTimer = setInterval(_checkForTimedOutCalls, 2000);
		}
		_connected = true;
		_isRetry = false;
		_onConnected();
		_debug('web socket is connected');
	}
	
	/**
	 * Event handler for the websocket close event
	 * @private
	 */
	function _onWsClose() {
		if (_monitorTimer) {
			_monitorTimer = clearInterval(_monitorTimer);
		}
		_connected = false;
		if (_isRetry === false) {
			_onDisconnected();
			_debug('websocket is closed');
		}
		if (_settings.autoRetry === true) {
			_isRetry = true;
			setTimeout(_connect,_settings.retryInterval);
		}
	}
	
	/**
	 * Event handler for the websocket message event
	 * @private
	 */
	function _onWsMessage(msg) {
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
			_parseNotification(obj.method, obj.params.data);
		}	
	}
	
	/**
	 * Event handler for the websocket error event
	 * @private
	 */
	function _onWsError(err) {
		_debug(JSON.stringify(err));
	}
	
	/**
	 * Returns and increments the JSON-RPC command ID
	 * @private
	 */
	function _getNextId() {
		return _cmdId++;
	}
	
	/**
	 * Builds a JSON-RPC command object from the params
	 * @private
	 */
	function _buildCommand(method, params) {
		return {
			jsonrpc: "2.0"
			, method: method
			, params: params
			, id: _getNextId()
		}
	}
	
	/**
	 * Parses a notification message and responds as necessary
	 * @param {string} method - The API method name
	 * @param {object} data - The data sent with the message
	 * @private
	 */
	function _parseNotification(method, data) {
		if (_notificationBindings[method]) {
			var n = _notificationBindings[method];
			for (var i in n) {
				n[i](data);
			}
		}
	}
	
	/**
	 * Calls an API method
	 * @param {string} method - The method name
	 * @param {object} [params] - The data object to pass as the params
	 * @param {function} [onSuccess] - Callback to call on successful API request
	 * @param {function} [onError] - Callback to call on failed API request
	 * @param {number} [attempt] - The attempt number (used to keep track of retries)
	 */
	this.call = function(method, params, onSuccess, onError, attempt) {
		if (self.isConnected()) {
			var cmd = _buildCommand(method,params);
			// save the callbacks for the command for later reference
			_pendingCmds[cmd.id] = {
				timeStamp: new Date()
				, attempt: attempt || 1
				, method: method
				, params: params
				, onSuccess: onSuccess
				, onError: onError
			};
			_ws.send(JSON.stringify(cmd));
		} else {
			onError('Not connected');
		}
	};
	
	/**
	 * Subscribe a callback method to an XBMC notifiication
	 * @param {string} notification - The notification name
	 * @param {function} handler - The callback method to call on notification received event
	 */
	this.subscribe = function(notification, handler) {
		if (!_notificationBindings[notification]) {
			_notificationBindings[notification] = [];
		}
		_notificationBindings[notification].push(handler);
	};
	
	/**
	 * Unsubscribes a callback to an XBMC notification
	 * @param {string} notification - The notification name
	 * @param {function} handler - The callback method to unbind from the notification event
	 */	 
	this.unsubscribe = function(notification, handler) {
		if (_notificationBindings[notification]) {
			var n = _notificationBindings[notification];
			var i = n.indexOf(handler);
			if (i >= 0) {
				n.splice(i,1);
			}
		}
	};
	
	/**
	 * Returns true if the Web Socket is connected
	 * NOTE: On some browsers this can return true for up to a minute when network connectivity is lost.
	 */
	this.isConnected = function() {
		if (_ws == null) return false;
		return _ws.readyState === SOCKET_OPEN;
	};
	
	//construct
	_init();
}

Xbmc.WebSocketsApi.isAvailable = function() {
	return ("WebSocket" in window);
}
