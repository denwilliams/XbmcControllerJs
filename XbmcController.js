window.Xbmc = window.Xbmc || {};

Xbmc.Controller = function(options) {
	var self = this;
	
	var _settings = _extend({
		host: 'localhost'
		,port: 8080
		,onInit: function() { _debug('Xbmc Controller Initialised'); }
		,onFail: function() { console.error('Xbmc Controller failed to init'); }
		,protocol: 'auto'
		,defaultCache: 'none'
	},options || {});

	
	var _api = null;
	var _cachedApi = null;
	
	/**
	 * Constructor
	 */
	function _init() {
		if (typeof Xbmc.CachedQueryController !== 'function') {
			console.error('Xbmc.CachedQueryController required');
			return;
		}
		if (Xbmc.WebSocketsApi.isAvailable()) {
			_tryWebSockets(
				function() {
					_onInit();
				}, function() {
					_tryHttp(
						function() {
							_onInit();
						}, function() {
							console.error('Xbmc.HttpApi failed');
						}
					);					
				}
			);
		} else if (Xbmc.HttpApi.isAvailable()) {
			_tryHttp(
				function() {
					_onInit();
				}, function() {
					console.error('Xbmc.HttpApi failed');
				}
			);
		}
	}
	
	function _onInit() {
		_applyCache();
		_addMethods(function() {_settings.onInit();	} );
	}

	function _tryWebSockets(onSuccess, onError) {
		if (typeof Xbmc.WebSocketsApi !== 'function') {
			onError();
			return;
		}
		_debug('Attempting to use web sockets');
		_api = new Xbmc.WebSocketsApi({
			host:_settings.host
			, onConnected: function() { onSuccess(); }
			, onDisconnected: function() { onError(); }
		});
	}
	function _tryHttp(onSuccess, onError) {
		if (typeof Xbmc.HttpApi !== 'function') {
			onError();
			return;
		}
		_debug('Attempting to use HTTP');
		_api = new Xbmc.HttpApi({
			host:_settings.host
			, port:_settings.port
			, onConnected: function() { onSuccess(); }
			, onDisconnected: function() { onError(); }
		});		
	}
	function _applyCache() {
		if (typeof Xbmc.CachedQueryController === 'function') {
			_cachedApi = new Xbmc.CachedQueryController(_api);
		}
	}
	
	/** Outputs a message to the console if window.DEBUG === true */
	function _debug(message) {
		if (Xbmc.DEBUG === true)
			console.log(message);
	}
	
	/** 
	 * Overwrites properties in object a with like-named properties in object b. 
	 * Properties that do not exist in a will not be copied. 
	 */
	function _extend(a,b) {
		for(var key in b)
     	   if(a.hasOwnProperty(key))
	            a[key] = b[key];
	    return a;
	}

	
	/**
	 * Creates shortcut methods for all commands
	 */
	function _addMethods(callback) {
		_api.call('JSONRPC.introspect', {}, function(response) {
				if (response.methods) {
					var xbmcMethods = response.methods;

					for ( var methodName in xbmcMethods ) {
						if (methodName) {
							var parts = methodName.split('.');
							_addMethod(methodName);
						}
					}
				} else {
					console.error('Failed to retrieve methods');
				}
				callback();
			}, function (error) {
				console.error('Failed to retrieve methods');
				callback();
			}
		);
	}




	
	/**
	 * Creates a method shortcut for the specified associated XBMC API method
	 * @param {string} namespace - The namespace for the command
	 * @param {string} commandName - The name of the command
	 */
	function _addMethod(methodName) {
		var parts = methodName.split('.');
		if (2 == parts.length) {
			var namespace = parts[0];
			var commandName = parts[1];
			// create namespace if required
			if (self[namespace] == undefined) self[namespace] = {};
			var objNs = self[namespace];
			objNs[commandName] = function(params, onSuccess, onError, useCache) {
				return _api.call(methodName, params || {}, onSuccess, onError, useCache);
			};
		}
	}	
	
	/* #### PUBLIC #### */
	
	//*************************************************************************
	//* Public XBMC Helper Methods
	//*************************************************************************

	/** 
	 * Gets the name of the XBMC instance
	 * usage: getName(function(name) { alert('the name is '+name); });
	 */
	this.getName = function(callback) {
		var name = '';
    	self.Application.GetProperties({properties: ['name']}
    		, function(response) { callback(response.name); }
			, function() { callback('Error'); }
			, 'sess'
		);
    };

	/**
	 * Returns {major:12,minor:2,revision:'',tag:'stable'}
	 */
    this.getVersion = function(callback) {
		var version = '';
    	self.Application.GetProperties({properties: ['version']}
    		, function(response) { callback(response.version); }
    		, function() { callback(0); }
    		, 'sess'
    	);
    };
    
	this.mute = function(mute, callback) { 
		self.Application.SetMute({mute: mute}, callback);
	};
	
	this.volume = function(volume) { 
    	self.Application.SetVolume({volume: volume}, callback);
    };
    
    /*
this.getVolume = function() {
    		var currentVol = self.volume;
	    	var currentMute = self.muted;
	    	_xbmc.Application.GetProperties({properties: ['volume', 'muted']}, function(response) {
	    		self.volume = response.volume;
	    		self.muted = response.muted;
	    	}, false);
	    	if (currentVol != self.volume || currentMute != self.muted) {
	    		notifyVolumeChanged();
	    	}
	    	return self.volume;
    };
    
*/

	//*************************************************************************
	//* XBMC API Interface Methods
	//*************************************************************************

	this.call = function(method, params, onSuccess, onError, useCache) {
		return _cachedApi(method, params, onSuccess, onError, useCache);
	};
	
	this.subscribe = function(notification, handler) {
		return _api.subscribe(notification, handler);
	};
	
	this.unsubscribe = function(notification, handler) {
		return _api.unsubscribe(notification, handler);
	};
	
	/* ## Init ## */
	
	// construct
	_init();
};