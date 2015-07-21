document.addEventListener('DOMContentLoaded', function() {
  var hasClicked = false;

  document.getElementById('connect-btn').onclick = function() {
    var input = document.getElementById('broker-url').value;
    if(hasClicked || input.trim().length == 0)
      return;
    hasClicked = true;

    console.log('connecting');
    console.log('url: ' + input);

    var link = new DS.LinkProvider(input, 'visualizer-', {
      isRequester: true,
      isResponder: false
    });

    link.init().then(function() {
      return link.connect();
    }).then(function() {
      return link.onRequesterReady;
    }).then(function() {
      console.log('connected');
    });
  };
}, false);
