function get_appcache_state() {
    var appCache = window.applicationCache;

    switch (appCache.status) {
        case appCache.UNCACHED: // UNCACHED == 0
            return 'UNCACHED';
        case appCache.IDLE: // IDLE == 1
            return 'IDLE';
        case appCache.CHECKING: // CHECKING == 2
            return 'CHECKING';
        case appCache.DOWNLOADING: // DOWNLOADING == 3
            return 'DOWNLOADING';
        case appCache.UPDATEREADY: // UPDATEREADY == 4
            return 'UPDATEREADY';
        case appCache.OBSOLETE: // OBSOLETE == 5
            return 'OBSOLETE';
        default:
            return 'UNKNOWN CACHE STATUS';
    }
}

function add_cache_event_toasts() {
    var appCache = window.applicationCache;


    if (!appCache) {
        if (typeof showToast === "function") {
            showToast('★ Not supported', 4000);
        }
        return;
    }

    if (!navigator.onLine) {
        //showToast('★ Offline', 300000);
    }

    appCache.addEventListener('checking', function (e) {
        //showToast('★ Checking cache...');
    }, false);

    appCache.addEventListener('downloading', function (e) {
        showToast('★ Download cache...');
    }, false);

    appCache.addEventListener('cached', function (e) {

        setTimeout(function () {
            showToast('★ Successfully ! ㋡');
        }, 1000);
    }, false);

    appCache.addEventListener('noupdate', function (e) {
        showToast('★ Offline Ready!');
    }, false);

    appCache.addEventListener('obsolete', function (e) {
        showToast('Clear cache & restart');
    }, false);

    appCache.addEventListener('error', function (e) {
        //showToast('★ Cache error');
    }, false);

    appCache.addEventListener('updateready', function (e) {
        if (window.applicationCache.status == window.applicationCache.UPDATEREADY) {
            showToast('Site was updated. Refresh ', 8000);
        }
    }, false);
}
