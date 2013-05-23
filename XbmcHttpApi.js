window.Xbmc = window.Xbmc || {};

Xbmc.HttpApi = function(options) {
	var self = this;
	
	var _refreshTimer;
	var _refreshInterval = 1000;
	function _refresh() {
		if (_notificationBindings['Application.OnVolumeChanged']) {
			self.call('Application.GetProperties',
				{properties: ['volume', 'muted']}, 
				function(response) {
					if (_monitoredValues.volume === undefined || _monitoredValues.muted === undefined || _monitoredValues.volume != response.volume || _monitoredValues.muted != response.muted) {
						for (var i in _notificationBindings['Application.OnVolumeChanged']) {
							_notificationBindings['Application.OnVolumeChanged'][i](response);
						}
					}
					_monitoredValues.volume = response.volume;
					_monitoredValues.muted = response.muted;
				}, 
				false
			);
		}
	}
	function _startRefresh() {
		_refreshTimer = setInterval(function(){
			_refresh();
		},_refreshInterval);
	}
	function _stopRefresh() {
		_refreshTimer = clearInterval(refreshTimer);
	}
	
	var _cmdId = 1; // the next command ID in sequence
	var _notificationBindings = {};
	var _monitoredValues = {};

	var _settings = extend({
		host: null
		,port: '8080'
	}, options || {});
	
	var _url = (_settings.hostname) 
		? 'http://' + _settings.host + ':' + _settings.port + '/jsonrpc'
		: '/jsonrpc';
	
	function extend(a,b) {
		for(var key in b)
     	   if(a.hasOwnProperty(key))
	            a[key] = b[key];
	    return a;
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
		
	this.call = function(method, params, onSuccess, onError) {
		var cmd = buildCommand(method,params);
		//xdr(_url,'POST',JSON.stringify(cmd),onSuccess,onError);
		var xhr = Xbmc.HttpApi.createCORSRequest('POST',_url);
		
		//var xhr = createCORSRequest('POST', url);
		if (!xhr) {
			alert('CORS not supported');
			return;
		}
		
		// Response handlers.
		xhr.onload = function() {
			//var text = xhr.responseText;
			var response = JSON.parse(xhr.responseText);
			if (onSuccess) onSuccess(response.result);
		};
		
		xhr.onerror = function() {
			if (onError) onError();
		};
		
		xhr.send(JSON.stringify(cmd));
		
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
			if (_notificationBindings[notification].length == 0) {
				delete _notificationBindings[notification];
			}
		}
	};
	
	this.isConnected = false;
	
	_startRefresh();
}

Xbmc.HttpApi.isAvailable = function() {
	var xhr = XbmcHttpApi.createCORSRequest('GET', url);
	if (xhr) return true;
	return false;
}
Xbmc.HttpApi.createCORSRequest = function(method, url) {
	var xhr = new XMLHttpRequest();
	if ("withCredentials" in xhr) {
		// Check if the XMLHttpRequest object has a "withCredentials" property.
		// "withCredentials" only exists on XMLHTTPRequest2 objects.
		xhr.open(method, url, true);
		xhr.setRequestHeader('Content-Type','application/json');
	} else if (typeof XDomainRequest != "undefined") {
		// Otherwise, check if XDomainRequest.
		// XDomainRequest only exists in IE, and is IE's way of making CORS requests.
		xhr = new XDomainRequest();
		xhr.open(method, url);
		xhr.setRequestHeader("Content-Type", 'application/json');
	} else {

		// Otherwise, CORS is not supported by the browser.
		xhr = null;
		
	}
	return xhr;
}

// experimenting with other options for XDR
// it seems the problem is XBMC does not add the necessary headers for CORS


//**
/* Make a X-Domain request to url and callback.
*
* @param url {String}
* @param method {String} HTTP verb ('GET', 'POST', 'DELETE', etc.)
* @param data {String} request body
* @param callback {Function} to callback on completion
* @param errback {Function} to callback on error
*/
/*
function xdr(url, method, data, callback, errback) {
	var req;
	if(XMLHttpRequest) {
		req = new XMLHttpRequest();
 
		if('withCredentials' in req) {
			req.open(method, url, true);
			req.onerror = errback;
			req.onreadystatechange = function() {
				if (req.readyState === 4) {
					if (req.status >= 200 && req.status < 400) {
						callback(req.responseText);
					} else {
						errback(new Error('Response returned with non-OK status'));
					}
				}
			};
			req.send(data);
		}
	} else if(XDomainRequest) {
		req = new XDomainRequest();
		req.open(method, url);
		req.onerror = errback;
		req.onload = function() {
			callback(req.responseText);
		};
		req.send(data);
	} else {
	errback(new Error('CORS not supported'));
	}
}
*/
