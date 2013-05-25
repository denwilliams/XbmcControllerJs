window.Xbmc = window.Xbmc || {};

Xbmc.CachedQueryController = function(apiController, options) {
	var self = this;
	
	var _settings = _extend({
		defaultCache: 'sess' // perm, sess, none
		,permCacheDur: 1 // permanent cache duration IN DAYS (used unless expires is specified)
		,sessCacheDur: 1 // session cache duration IN MINUTES (used unless expires is specified)
	},options || {});

	var _api = apiController;
	var _sessCache = {}; // session cache will just be a normal object if no html5 support (ie: page, not session)
	var _permCache = {}; // permanent cache will just be a normal object if no html5 support (ie: not permanent)
		
	/** Constructor */
	function _init() {
		try {
			if (localStorage.getItem) {
				_permCache = localStorage;
				_debug('Permantent Cache usage - ' + (_getPermanentCacheUsed() / 1024) + ' kb');
			}
			if (sessionStorage.getItem) {
				_sessCache = sessionStorage;
				_debug('Session Cache usage - ' + (_getSessionCacheUsed() / 1024) + ' kb');
			}
		} catch (e) { }
	}
	
	/** Outputs a message to the console if window.DEBUG === true */
	function _debug(message) {
		if (Xbmc.DEBUG === true)
			console.log(message);
	}
	
	/** Overwrites properties in object a with like-named properties in object b. Properties that do not exist in a will not be copied. */
	function _extend(a,b) {
		for(var key in b)
     	   if(a.hasOwnProperty(key))
	            a[key] = b[key];
	    return a;
	}
	
	/** Overwrites properties in object a with like-named properties in object b. Even properties that do not exist in a will be copied. */
	function _merge(a,b) {
		for(var key in b)
            a[key] = b[key];
	    return a;
	}
	
	function _getSessionCacheUsed() {
		return _getCacheUsed(sessionStorage);
    }
    
	function _getPermanentCacheUsed() {
		return _getCacheUsed(localStorage);
	}
	
	function _getCacheUsed(cache) {
    	try {
    		return JSON.stringify(localStorage).length;
		} catch (err) {
			return 0;
        }
	}
	
	function _saveToSessionCache(key, obj, expires) {
		if (!expires) {
            var d = new Date();
            expires = d.setHours(d.getHours() + _settings.sessCacheDur);
        }
        _saveToCache(_sessCache, key, obj, expires);
    }

    function _saveToPermanentCache(key, obj, expires) {
        if (!expires) {
            var d = new Date();
            expires = d.setDate(d.getDate() + _settings.permCacheDur);
        }
        _saveToCache(_permCache, key, obj, expires);
    }
    
    function _saveToCache(cache, key, obj, expires) {
    	_debug('Caching key ' + key);
        cache[key] = JSON.stringify({
            expires: expires,
            data: obj
        });
    }

    function _getFromPermanentCache(key) {
	    return _getFromCache(_permCache, key);
    }

    function _getFromSessionCache(key) {
    	return _getFromCache(_sessCache, key);
    }
    
    function _getFromCache(cache, key) {
    	_debug('Retrieving key ' + key);
	    var cacheObj = cache[key];
        if (typeof cacheObj == 'string' && cacheObj != 'undefined') {
            var obj = JSON.parse(cacheObj);
            if (obj.expires > new Date()) {
                return obj.data;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

	function _generateKey(forString) {
		var hash = 0, i, char;
	    if (forString.length == 0) return hash;
	    for (i = 0; i < forString.length; i++) {
	        char = forString.charCodeAt(i);
	        hash = ((hash<<5)-hash)+char;
	        hash = hash & hash; // Convert to 32bit integer
	    }
	    return hash;
	}
	
	
	/* #### PUBLIC #### */
	
	
	this.getSettings = function() {
		var cacheObj = _permCache['settings'];
        if (typeof cacheObj === 'string' && cacheObj !== 'undefined') {
            var obj = JSON.parse(cacheObj);
            return obj;
        } else {
            return {};
        }
	};
	
	/** 
	 * Saves a settings object that is preserved when clearCache is called
	 */
	this.saveSettings = function(settings) {
		_permCache['settings'] = JSON.stringify(settings);	
	};

	/** Clears all items from cache with the exception of the settings object */
	this.clearCache = function() {
		// preserve settings
		var settings = self.getSettings();
		
		// clear the cache
		try {
			if (localStorage.clear) localStorage.clear();
			if (sessionStorage.clear) sessionStorage.clear();
        } catch (err) {
        	// cache not available... using objects instead
	        _permCache = {};
	        _sessCache = {};
        }
		
		// save settings to cleared cache
		self.saveSettings(settings);
	};
	
	/**
	 * Retrieves from cache or calls the API if a cached value is not available
	 * {string} method
	 * {object} [params]
	 * {function} [onSuccess]
	 * {function} [onError]
	 * {string} [useCache='sess'] - Identifies which cache to use - 'none', 'sess', 'perm'
	 * {boolean} [forceRefresh=false] - If true then will ALWAYS retrieve a fresh version from the API
	 */
	this.call = function(method, params, onSuccess, onError, useCache, forceRefresh) {
		params = params || {};
		useCache = useCache || _settings.defaultCache;

		var key = method + '.' + _generateKey(JSON.stringify(params));
		// attempt to retrieve from cache
		var cacheObj = (forceRefresh === true || useCache == 'none')
			? null
			: (useCache == 'perm')
			? _getFromPermanentCache(key)
			: _getFromSessionCache(key);
		if (cacheObj != null) {
			_debug(method + ' returned from cache');
			if (typeof onSuccess == 'function') {
				onSuccess(cacheObj);
			}
		} else {
			_debug(method + ' requested from API');
			_api.call(method, params, function (response) {
				switch (useCache) {
					case 'perm':
						_saveToPermanentCache(key, response);
						break;
					case 'sess':
						_saveToSessionCache(key, response);
						break;
				}
				if (typeof onSuccess == 'function') {
					onSuccess(response);
				}
			}, onError);
		}
	};

	this.subscribe = function(notification, handler) {
		_api.subscribe(notification, handler);
	};

	this.unsubscribe = function(notification, handler) {
		_api.unsubscribe(notification, handler);
	};

	// construct
	_init();
};
