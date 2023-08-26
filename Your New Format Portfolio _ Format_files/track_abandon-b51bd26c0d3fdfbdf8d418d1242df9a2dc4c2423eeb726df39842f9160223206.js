(function () {
  var trackAbandons = function() {
    // Remove the listener so it only runs once.
    document.removeEventListener('visibilitychange', trackAbandons);

    if (!navigator.sendBeacon) return;

    var anonymousId = 'unknown-user';
    try {
      anonymousId = analytics.user().anonymousId();
    } catch(e) { }

    var payload = {
      anonymousId: anonymousId,
      event: "Load Abandoned",
      context: {
        library: {name: 'format-track-abandons', version: '0.0.1'},
        page: { path: document.location.pathname, url: document.location.href }
      },
      type: "track",
      writeKey: formatAnalytics.writeKey
    };
    navigator.sendBeacon('https://api.segment.io/v1/t', JSON.stringify(payload))
  };

  document.addEventListener('visibilitychange', trackAbandons);
  document.addEventListener("DOMContentLoaded", function () {
    document.removeEventListener('visibilitychange', trackAbandons);
  })
})()
;
