(function() {
  function getUrlParameters() {
    var urlParams = {},
        match,
        pl = /\+/g, // Regex for replacing addition symbol with a space
        search = /([^&=]+)=?([^&]*)/g,
        decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
        query  = window.location.search.substring(1);

    while (match = search.exec(query))
      urlParams[decode(match[1])] = decode(match[2]);
    return urlParams;
  }

  // elements is an object, key is id, value is display type
  function getElements(elements) {
    return {
      show: function() {
        Object.keys(elements).forEach(function(element) {
          document.getElementById(element).style.display = elements[element];
        });
      },
      hide: function() {
        Object.keys(elements).forEach(function(element) {
          document.getElementById(element).style.display = 'none';
        });
      }
    };
  }

  function connect(url) {
    console.log('connecting');
    console.log('url: ' + url);

    var link = new DS.LinkProvider(url, 'visualizer-', {
      isRequester: true,
      isResponder: false
    });

    return link.init().then(function() {
      return link.connect();
    }).then(function() {
      return link.onRequesterReady;
    }).then(function() {
      console.log('connected');
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    var urlParams = getUrlParameters();
    var elements = getElements({
      'title': 'block',
      'container': 'flex'
    });

    if(!urlParams.url) {
      elements.show();

      document.getElementById('connect-btn').onclick = function() {
        var url = document.getElementById('broker-url').value;
        connect(url).then(function() {
          elements.hide();
        });
      };
    } else {
      connect(urlParams.url);
    }
  }, false);
})();
